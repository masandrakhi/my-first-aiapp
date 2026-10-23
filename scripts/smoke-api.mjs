// Loads the API from `.verify/build` (compiled file by file with no bundling, as Vercel does) and sends it
// one request. Catches import paths Node can't resolve, missing modules and crashes at start-up. Placeholder
// settings are used: no database or secret is touched.
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

Object.assign(process.env, {
  DATABASE_URL: 'postgres://verify:verify@127.0.0.1:1/verify',
  APP_ORIGIN: 'https://verify.example',
  JWT_SECRETS: 'verify-only-secret-verify-only-secret-01',
  IP_HASH_SECRET: 'verify-only-secret-verify-only-secret-02',
})

const entry = pathToFileURL(resolve('.verify/build/api/index.js')).href
const api = await import(entry)
const res = await api.GET(new Request('https://verify.example/api/nope'))
const body = await res.json()
if (res.status !== 404 || body?.error?.code !== 'not_found' || !body.error.requestId) {
  console.error('unexpected response', res.status, JSON.stringify(body))
  process.exit(1)
}
console.log('  GET /api/nope → 404 with a request id')
