import { session, user } from '@db-core/schema/betterAuthSchema'
import { eq } from 'drizzle-orm'
import type { DbTransaction } from '../types'

/**
 * Update a session's contextOrganizationId by session token.
 * Used during customer OTP verification to set the organization context on the session.
 */
export const updateSessionContextOrganizationId = async (
  sessionToken: string,
  contextOrganizationId: string,
  transaction: DbTransaction
) => {
  const result = await transaction
    .update(session)
    .set({ contextOrganizationId })
    .where(eq(session.token, sessionToken))
    .returning()
  return result[0]
}

export const selectBetterAuthUserById = async (
  id: string,
  transaction: DbTransaction
) => {
  const [betterAuthUser] = await transaction
    .select()
    .from(user)
    .where(eq(user.id, id))
    .limit(1)
  if (!betterAuthUser) {
    throw new Error('BetterAuth user not found')
  }
  return betterAuthUser
}

export const selectBetterAuthUserByEmail = async (
  email: string,
  transaction: DbTransaction
) => {
  const [betterAuthUser] = await transaction
    .select()
    .from(user)
    .where(eq(user.email, email))
    .limit(1)
  if (!betterAuthUser) {
    throw new Error('BetterAuth user not found')
  }
  return betterAuthUser
}
