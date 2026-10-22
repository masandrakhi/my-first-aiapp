/**
 * Applies migrations to the Postgres database in DATABASE_URL (e.g. Neon).
 * Run deliberately with `npm run db:migrate`; nothing migrates a cloud database automatically.
 */
import { existsSync } from 'node:fs'
import { Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import { migrate } from 'drizzle-orm/neon-serverless/migrator'
import { MIGRATIONS_DIR } from './client'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')
const url = process.env.DATABASE_URL
if (!url) throw new Error('Set DATABASE_URL to the database you want to migrate.')

const pool = new Pool({ connectionString: url })
await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_DIR })
await pool.end()
console.log('Migrations applied.')
