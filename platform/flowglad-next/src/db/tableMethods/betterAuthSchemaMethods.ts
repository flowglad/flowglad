import {
  user,
  verification,
} from '@db-core/schema/betterAuthSchema'
import { eq } from 'drizzle-orm'
import type { DbTransaction } from '../types'

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

export const selectVerificationByIdentifier = async (
  identifier: string,
  transaction: DbTransaction
) => {
  const [verificationRecord] = await transaction
    .select()
    .from(verification)
    .where(eq(verification.identifier, identifier))
    .limit(1)
  return verificationRecord || null
}
