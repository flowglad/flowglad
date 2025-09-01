import { user } from '../schema/betterAuthSchema'
import { DbTransaction } from '../types'
import { eq } from 'drizzle-orm'

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
