import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { Pool } from '@neondatabase/serverless'
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from './schema'

/** Any Postgres-backed Drizzle database with our schema (Neon in production, PGlite locally and in tests). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>
/** A database or an open transaction: repository code accepts either. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
export type DbOrTx = Db | Tx

// Built from the string form of import.meta.url, so it also works where URL is a polyfill (jsdom tests).
export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations')

/** In-process Postgres for development (persisted to `dataDir`) and tests (in memory). Applies migrations. */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const db = drizzlePglite(new PGlite(dataDir), { schema })
  await migratePglite(db, { migrationsFolder: MIGRATIONS_DIR })
  return db as unknown as Db
}

/** Neon serverless Postgres over WebSockets (supports transactions, which token rotation needs). */
export function createNeonDb(connectionString: string): Db {
  return drizzleNeon(new Pool({ connectionString }), { schema }) as unknown as Db
}
