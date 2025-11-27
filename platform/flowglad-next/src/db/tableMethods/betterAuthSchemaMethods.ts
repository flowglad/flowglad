import { eq } from 'drizzle-orm'
import { user } from '../schema/betterAuthSchema'
import type { DbTransaction } from '../types'

export const selectBetterAuthUserById = async (
  id: string,
  transaction: DbTransaction
) => {
  const [betterAuthUser] = await transaction
    .select()
    .from(user)
    .where(eq(user.id, id))
  if (!betterAuthUser) {
    throw new Error('BetterAuth user not found')
  }
  return betterAuthUser
}
