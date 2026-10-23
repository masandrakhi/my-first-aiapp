// Checks the release gate itself (EV-1, cases 1-1 to 1-4 and 1-7): in a throwaway copy of the working
// tree (a git worktree plus the uncommitted changes, deleted afterwards), each seeded break must make
// `verify` fail at the step meant to catch it, and the untouched copy must pass.
// Run with `npm run eval:gate` (takes a few minutes).
import { spawnSync } from 'node:child_process'
import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const repo = resolve('.')
const dir = mkdtempSync(join(tmpdir(), 'habits-gate-'))
const git = (cwd, args, input) => spawnSync('git', args, { cwd, encoding: 'utf8', input })

// [name, seed the break, the step that must fail (null = verify must pass)]
const breaks = [
  ['1-1 untouched copy passes', null, null],
  ['1-2 a failing test', () => appendFileSync(join(dir, 'src/lib/stats.test.ts'), "\nit('seeded failure', () => { throw new Error('seeded') })\n"), 'tests'],
  // `debugger` is valid TypeScript, so only the linter can catch it.
  ['1-3 a lint warning', () => appendFileSync(join(dir, 'src/lib/stats.ts'), '\nexport function seeded() { debugger }\n'), 'lint (warnings fail)'],
  // The import-guard test usually catches this first; the compiled-API check is the backstop.
  ['1-4 an import without .js', () => {
    const file = join(dir, 'server/app.ts')
    writeFileSync(file, readFileSync(file, 'utf8').replace("from './errors.js'", "from './errors'"))
  }, ['tests', 'API loads and answers']],
  ['1-7a a focused test (.only)', () => {
    const file = join(dir, 'src/lib/stats.test.ts')
    writeFileSync(file, readFileSync(file, 'utf8').replace('it(', 'it.only('))
  }, 'tests'],
  ['1-7b a deleted test file', () => unlinkSync(join(dir, 'src/lib/stats.test.ts')), 'test count floor'],
]

let failures = 0
try {
  const add = git(repo, ['worktree', 'add', '--detach', dir, 'HEAD'])
  if (add.status !== 0) throw new Error(add.stderr)
  // Bring over uncommitted edits and new files, so the gate is checked as it stands now.
  const diff = git(repo, ['diff', 'HEAD', '--binary']).stdout
  if (diff && git(dir, ['apply', '--whitespace=nowarn'], diff).status !== 0) throw new Error('could not copy uncommitted changes')
  for (const file of git(repo, ['ls-files', '--others', '--exclude-standard']).stdout.split('\n').filter(Boolean)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true })
    copyFileSync(join(repo, file), join(dir, file))
  }
  git(dir, ['add', '-A'])
  git(dir, ['-c', 'user.name=gate', '-c', 'user.email=gate@localhost', 'commit', '-qm', 'gate baseline', '--no-verify'])
  symlinkSync(join(repo, 'node_modules'), join(dir, 'node_modules'), 'junction') // share installed packages

  for (const [name, apply, step] of breaks) {
    apply?.()
    const run = spawnSync(process.execPath, ['scripts/verify.mjs'], { cwd: dir, encoding: 'utf8', env: { ...process.env } })
    const failedAt = /✗ (.+?)(?: failed \(exit|:)/.exec(run.stderr)?.[1] ?? (run.status === 0 ? null : 'unknown (crashed)')
    const ok = Array.isArray(step) ? step.includes(failedAt) : failedAt === step
    console.log(`${ok ? '✓' : '✗'} ${name}: ${failedAt ? `failed at "${failedAt}"` : 'passed'}${ok ? '' : ` (expected ${step ? `"${step}"` : 'a pass'})`}`)
    if (!ok) {
      failures++
      console.log(run.stdout.slice(-2000), run.stderr.slice(-2000))
    }
    git(dir, ['checkout', '--', '.'])
    git(dir, ['clean', '-fdq', '-e', 'node_modules'])
  }
} finally {
  try { unlinkSync(join(dir, 'node_modules')) } catch { /* already gone */ }
  git(repo, ['worktree', 'remove', '--force', dir])
  rmSync(dir, { recursive: true, force: true })
  git(repo, ['worktree', 'prune'])
}
console.log(failures === 0 ? '\ngate check: every seeded break was caught at the right step' : `\ngate check: ${failures} case(s) wrong`)
process.exit(failures === 0 ? 0 : 1)
