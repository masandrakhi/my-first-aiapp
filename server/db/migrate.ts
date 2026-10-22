/**
 * Applies migrations to the Postgres database in DATABASE_URL (e.g. Neon).
 * On Vercel this runs in each deployment's build (see vercel.json), because the database secrets are
 * only readable there. A failed migration fails the deploy before the new version goes live. It runs
 * before Vercel packages the API, so a later build failure leaves the old version serving a migrated
 * database: keep migrations backward compatible (add, don't rename or drop in the same release).
 * Already-applied migrations are skipped, so running it again is harmless.
 */
import { existsSync } from 'node:fs'
import { Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import { migrate } from 'drizzle-orm/neon-serverless/migrator'
import { MIGRATIONS_DIR } from './client.js'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')
// DDL goes over a direct connection when Neon provides one (the pooled one is meant for app queries).
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
if (!url) throw new Error('Set DATABASE_URL to the database you want to migrate.')

const pool = new Pool({ connectionString: url })
await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_DIR })
await pool.end()
console.log('Migrations applied.')
