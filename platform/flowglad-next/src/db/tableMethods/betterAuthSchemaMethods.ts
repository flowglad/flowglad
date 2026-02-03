import { session, user } from '@db-core/schema/betterAuthSchema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { DbTransaction } from '../types'

/**
 * Input schema for updateSessionContextOrganizationId.
 */
const updateSessionContextOrganizationIdInputSchema = z.object({
  sessionToken: z.string().min(1, 'Session token is required'),
  contextOrganizationId: z
    .string()
    .min(1, 'Context organization ID is required'),
})

/**
 * Output schema for updateSessionContextOrganizationId.
 * Returns the updated session record or undefined if no session was found.
 */
const updateSessionContextOrganizationIdOutputSchema = z
  .object({
    id: z.string(),
    token: z.string(),
    userId: z.string(),
    expiresAt: z.date(),
    createdAt: z.date(),
    updatedAt: z.date(),
    ipAddress: z.string().nullable(),
    userAgent: z.string().nullable(),
    scope: z.enum(['merchant', 'customer']).nullable(),
    contextOrganizationId: z.string().nullable(),
  })
  .optional()

/**
 * Update a session's contextOrganizationId by session token.
 * Used during customer OTP verification to set the organization context on the session.
 *
 * @param sessionToken - The session token to update
 * @param contextOrganizationId - The organization ID to set on the session
 * @param transaction - Database transaction
 * @returns The updated session record, or undefined if no session was found
 * @throws {z.ZodError} If input validation fails
 */
export const updateSessionContextOrganizationId = async (
  sessionToken: string,
  contextOrganizationId: string,
  transaction: DbTransaction
) => {
  // Validate inputs
  const validatedInput =
    updateSessionContextOrganizationIdInputSchema.parse({
      sessionToken,
      contextOrganizationId,
    })

  const result = await transaction
    .update(session)
    .set({
      contextOrganizationId: validatedInput.contextOrganizationId,
    })
    .where(eq(session.token, validatedInput.sessionToken))
    .returning()

  // Validate and return output
  return updateSessionContextOrganizationIdOutputSchema.parse(
    result[0]
  )
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
