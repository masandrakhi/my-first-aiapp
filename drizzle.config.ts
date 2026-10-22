import { defineConfig } from 'drizzle-kit'

// Generates SQL migrations from server/db/schema.ts. Applying them is a separate, explicit step
// (server/db/migrate.ts) so nothing touches a cloud database by accident.
export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
})
