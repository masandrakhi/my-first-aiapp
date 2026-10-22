import { sql } from 'drizzle-orm'
import {
  boolean, customType, date, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid,
} from 'drizzle-orm/pg-core'
import type { Frequency, Theme } from '../../src/types'

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' })
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  /** Always stored lowercased; uniqueness is case-insensitive by construction. */
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  passwordChangedAt: ts('password_changed_at').notNull(),
  createdAt: ts('created_at').notNull(),
})

/** One row per sign-in. Also the "family" that every refresh token in the chain belongs to. */
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: ts('created_at').notNull(),
  /** Last meaningful authenticated activity; drives the 15-minute inactivity timeout. */
  lastActivityAt: ts('last_activity_at').notNull(),
  /** Absolute lifetime, regardless of activity. */
  expiresAt: ts('expires_at').notNull(),
  revokedAt: ts('revoked_at'),
  revokeReason: text('revoke_reason'),
}, (t) => [index('sessions_user_idx').on(t.userId)])

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  /** SHA-256 of the opaque token; the token itself is never stored. */
  tokenHash: bytea('token_hash').notNull().unique(),
  createdAt: ts('created_at').notNull(),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
  replacedBy: uuid('replaced_by'),
  revokedAt: ts('revoked_at'),
}, (t) => [index('refresh_tokens_session_idx').on(t.sessionId)])

export const passwordResets = pgTable('password_resets', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: bytea('token_hash').notNull().unique(),
  createdAt: ts('created_at').notNull(),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
}, (t) => [index('password_resets_user_idx').on(t.userId)])

export const habits = pgTable('habits', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  emoji: text('emoji').notNull(),
  color: text('color').notNull(),
  frequency: jsonb('frequency').$type<Frequency>().notNull(),
  archived: boolean('archived').notNull().default(false),
  sortOrder: integer('sort_order').notNull(),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
}, (t) => [
  // Target of the composite foreign key below: ties every completion to its habit's owner.
  unique('habits_id_user_unique').on(t.id, t.userId),
  index('habits_user_idx').on(t.userId),
])

export const completions = pgTable('completions', {
  habitId: uuid('habit_id').notNull(),
  userId: uuid('user_id').notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  createdAt: ts('created_at').notNull(),
}, (t) => [
  primaryKey({ columns: [t.habitId, t.date] }),
  // A completion can only reference a habit owned by the same user.
  foreignKey({ columns: [t.habitId, t.userId], foreignColumns: [habits.id, habits.userId] }).onDelete('cascade'),
  index('completions_user_idx').on(t.userId),
])

export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  theme: text('theme').$type<Theme>().notNull().default('system'),
  collapseDone: boolean('collapse_done').notNull().default(true),
})

/** Fixed-window counters for rate limiting, shared by every serverless instance. */
export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  windowStart: ts('window_start').notNull(),
  count: integer('count').notNull(),
})

/** Makes the one-time import of a device's local data idempotent. */
export const imports = pgTable('imports', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  deviceImportId: text('device_import_id').notNull(),
  createdAt: ts('created_at').notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.deviceImportId] })])
