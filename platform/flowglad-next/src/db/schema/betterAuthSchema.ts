import {
  boolean,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { SessionScope } from '@/types'

/**
 * PostgreSQL enum type for session scopes.
 * Exported so drizzle-kit can track it and generate CREATE TYPE migrations.
 * Used to distinguish between merchant dashboard sessions and customer billing portal sessions.
 */
export const sessionScopeEnum = pgEnum('session_scope', [
  SessionScope.Merchant,
  SessionScope.Customer,
])

export const user = pgTable('better_auth_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  role: text('role').notNull().default('user'),
  emailVerified: boolean('email_verified')
    .$defaultFn(() => false)
    .notNull(),
  image: text('image'),
  banned: boolean('banned').$defaultFn(() => false),
  createdAt: timestamp('created_at')
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedAt: timestamp('updated_at')
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
}).enableRLS()

export const session = pgTable('better_auth_session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  /**
   * Scope of the session - either 'merchant' for dashboard sessions
   * or 'customer' for billing portal sessions.
   * Defaults to 'merchant' for backward compatibility.
   */
  scope: sessionScopeEnum('scope')
    .notNull()
    .default(SessionScope.Merchant),
  /**
   * The organization ID associated with this session.
   * For merchant sessions, this is the focused organization.
   * For customer sessions, this is the billing portal organization being accessed.
   */
  contextOrganizationId: text('context_organization_id'),
}).enableRLS()

export const account = pgTable('better_auth_account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
}).enableRLS()

export const verification = pgTable('better_auth_verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').$defaultFn(
    () => /* @__PURE__ */ new Date()
  ),
  updatedAt: timestamp('updated_at').$defaultFn(
    () => /* @__PURE__ */ new Date()
  ),
}).enableRLS()
