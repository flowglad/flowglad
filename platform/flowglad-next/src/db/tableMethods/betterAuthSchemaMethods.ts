import { user } from '@db-core/schema/betterAuthSchema'
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
