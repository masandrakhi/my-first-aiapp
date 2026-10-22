/**
 * Local API server for `npm run dev`: PGlite database in .data/pglite, emails written to
 * .data/outbox, listening on 127.0.0.1:8787 behind Vite's /api proxy (same origin as the app).
 */
import { existsSync, mkdirSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { loadConfig } from './config'
import { createPgliteDb } from './db/client'
import { createLogger } from './logger'
import { DevOutboxMailer } from './mail/mailer'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

// Development-only fallbacks so the app runs without setup. Production requires real secrets.
const devSecret = () => randomBytes(32).toString('base64url')
const config = loadConfig({
  APP_ORIGIN: 'http://127.0.0.1:5173',
  JWT_SECRETS: devSecret(),
  IP_HASH_SECRET: devSecret(),
  COOKIE_SECURE: 'false',
  ...process.env,
})

mkdirSync('.data', { recursive: true }) // PGlite creates its own folder, but not missing parents
const db = await createPgliteDb('.data/pglite')
const app = createApp({ db, config, mailer: new DevOutboxMailer('.data/outbox'), logger: createLogger(), now: () => new Date() })

serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 8787 }, ({ port }) => {
  console.log(`API ready on http://127.0.0.1:${port} (database .data/pglite, emails .data/outbox)`)
})
