// Suite reliability (EV-2): runs the full test suite N times (default 10) under a fixed, reproducible CPU
// load, in shuffled order, and reports how many runs were fully green. Run before releases and after
// harness changes: `npm run eval:reliability` (or `-- 3` for a quick check).
// Pass: every run green. Duration is reported, not scored (it depends on the machine).
import { spawnSync } from 'node:child_process'
import { availableParallelism } from 'node:os'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { Worker } from 'node:worker_threads'

const runs = Number(process.argv[2] ?? 10)
// "Under load" = one busy-looping thread per two cores, started here so every run sees the same pressure.
const burners = Math.max(1, Math.floor(availableParallelism() / 2))
const workers = Array.from({ length: burners }, () => new Worker('for (;;) {}', { eval: true }))
mkdirSync('.eval', { recursive: true })

const results = []
try {
  for (let i = 1; i <= runs; i++) {
    const seed = Math.floor(Math.random() * 1e9)
    const out = `.eval/reliability-${i}.json`
    const started = Date.now()
    const run = spawnSync(process.execPath, [
      'node_modules/vitest/vitest.mjs', 'run', '--sequence.shuffle', `--sequence.seed=${seed}`,
      '--reporter=json', `--outputFile=${out}`,
    ], { encoding: 'utf8', env: { ...process.env, CI: 'true' } })
    const seconds = Math.round((Date.now() - started) / 1000)
    // Keep Vitest's own output: errors outside tests (a worker that never started) only appear there.
    writeFileSync(`.eval/reliability-${i}.log`, `${run.stdout}\n${run.stderr}`)
    let detail = ''
    try {
      const r = JSON.parse(readFileSync(out, 'utf8'))
      detail = `${r.numPassedTests} passed, ${r.numFailedTests} failed, ${r.numPendingTests} skipped`
      if (r.numFailedTests > 0) {
        const names = r.testResults.flatMap((f) => f.assertionResults.filter((a) => a.status === 'failed').map((a) => a.fullName))
        detail += ` — ${names.slice(0, 3).join('; ')}`
      }
    } catch {
      detail = 'no report (the run crashed)'
    }
    if (run.status !== 0) {
      const error = `${run.stdout}\n${run.stderr}`.split('\n').find((l) => /Error|Timeout|failed to/i.test(l) && !/✓/.test(l))
      detail += ` — ${error?.trim().slice(0, 200) ?? 'see the log'} (.eval/reliability-${i}.log)`
    }
    const green = run.status === 0
    results.push({ green, seconds })
    console.log(`${green ? '✓' : '✗'} run ${i}/${runs}  seed ${seed}  ${seconds}s  ${detail}`)
  }
} finally {
  for (const w of workers) void w.terminate()
}

const greens = results.filter((r) => r.green).length
const times = results.map((r) => r.seconds)
console.log(`\nreliability: ${greens}/${runs} green under load (${burners} busy threads); ${Math.min(...times)}–${Math.max(...times)} s per run`)
console.log('Replay a failing order with: npx vitest run --sequence.shuffle --sequence.seed=<seed>')
process.exit(greens === runs ? 0 : 1)
