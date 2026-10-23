// The release gate (EV-1): every step must pass before a deploy. Run with `npm run verify`.
// Vercel runs it in the deploy's build, so a failing step stops the deploy.
//
//   1. type-check (tsc -b)          2. lint, warnings fail (oxlint --deny-warnings)
//   3. all tests; `.only` fails     4. at least the stored number of tests passed (scripts/test-floor.json)
//   5. the API, compiled file by file like Vercel does, loads and answers
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const OUT = '.verify'
const node = (script, args, env = {}) => ({ cmd: process.execPath, args: [script, ...args], env })

const steps = [
  ['type-check', node('node_modules/typescript/bin/tsc', ['-b'])],
  ['lint (warnings fail)', node('node_modules/oxlint/bin/oxlint', ['--deny-warnings'])],
  // CI=true makes Vitest refuse `.only`, so a focused test can't silently skip the rest.
  ['tests', node('node_modules/vitest/vitest.mjs', ['run', '--reporter=default', '--reporter=json', `--outputFile=${OUT}/vitest.json`], { CI: 'true' })],
  ['test count floor', { check: checkFloor }],
  ['compile API like Vercel', node('node_modules/typescript/bin/tsc', ['-p', 'tsconfig.verify.json'])],
  ['API loads and answers', node('scripts/smoke-api.mjs', [])],
]

function checkFloor() {
  const { minPassed } = JSON.parse(readFileSync('scripts/test-floor.json', 'utf8'))
  const report = JSON.parse(readFileSync(join(OUT, 'vitest.json'), 'utf8'))
  const passed = report.numPassedTests
  if (passed < minPassed) {
    return `only ${passed} tests passed, below the floor of ${minPassed} (were tests skipped or deleted?)`
  }
  console.log(`  ${passed} tests passed (floor ${minPassed})`)
  return null
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
for (const [name, step] of steps) {
  console.log(`\n▶ ${name}`)
  if (step.check) {
    const problem = step.check()
    if (problem) {
      console.error(`✗ ${name}: ${problem}`)
      process.exit(1)
    }
  } else {
    const run = spawnSync(step.cmd, step.args, { stdio: 'inherit', env: { ...process.env, ...step.env } })
    if (run.status !== 0) {
      console.error(`✗ ${name} failed (exit ${run.status ?? run.signal})`)
      process.exit(1)
    }
  }
  console.log(`✓ ${name}`)
}
console.log('\nverify: all steps passed')
