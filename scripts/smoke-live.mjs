// Post-deploy smoke test (EV-1, case 1-8). Run right after every deploy: `npm run smoke:live`.
// Refreshing without a cookie must answer 401 invalid_refresh. That path goes through the rate limiter,
// so it proves the deployed function starts on Linux (native password-hashing library included) and
// reaches the database. It reads nothing private and changes nothing.
const base = process.argv[2] ?? 'https://my-first-aiapp.vercel.app'
const res = await fetch(`${base}/api/auth/refresh`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: base },
  body: '{}',
})
const body = await res.json().catch(() => null)
if (res.status !== 401 || body?.error?.code !== 'invalid_refresh') {
  console.error(`✗ ${base}: expected 401 invalid_refresh, got ${res.status} ${JSON.stringify(body)}`)
  console.error('  Roll back to the previous deployment in Vercel if this persists.')
  process.exit(1)
}
console.log(`✓ ${base}: API up, database reachable (401 invalid_refresh, ref ${body.error.requestId})`)
