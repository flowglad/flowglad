import { TRPCError } from '@trpc/server'
import { headers } from 'next/headers'
import { z } from 'zod'
import { auth } from '@/utils/auth'
import core from '@/utils/core'
import { protectedProcedure, publicProcedure, router } from '../trpc'

/**
 * Verify a device user code is valid and not expired.
 *
 * This is used to display the authorization form with confidence that the code is valid.
 */
const verifyDeviceCode = publicProcedure
  .input(
    z.object({
      userCode: z.string().min(1).describe('The user code to verify'),
    })
  )
  .output(
    z.object({
      valid: z.boolean(),
      error: z.string().optional(),
    })
  )
  .query(async ({ input }) => {
    const response = await fetch(
      `${core.NEXT_PUBLIC_APP_URL}/api/auth/device?user_code=${encodeURIComponent(input.userCode)}`
    )

    if (!response.ok) {
      return { valid: false, error: 'Invalid or expired code' }
    }

    return { valid: true }
  })

/**
 * Approve a device authorization request.
 *
 * This allows the CLI to receive an access token for the authenticated user.
 */
const approveDevice = protectedProcedure
  .input(
    z.object({
      userCode: z
        .string()
        .min(1)
        .describe('The user code to approve'),
    })
  )
  .output(
    z.object({
      success: z.boolean(),
      error: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    try {
      await auth.api.deviceApprove({
        body: { userCode: input.userCode },
        headers: await headers(),
      })
      return { success: true }
    } catch (error) {
      if (error instanceof Error) {
        return { success: false, error: error.message }
      }
      return { success: false, error: 'Failed to approve device' }
    }
  })

/**
 * Deny a device authorization request.
 *
 * This rejects the CLI's authorization request.
 */
const denyDevice = protectedProcedure
  .input(
    z.object({
      userCode: z.string().min(1).describe('The user code to deny'),
    })
  )
  .output(
    z.object({
      success: z.boolean(),
      error: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    try {
      await auth.api.deviceDeny({
        body: { userCode: input.userCode },
        headers: await headers(),
      })
      return { success: true }
    } catch (error) {
      if (error instanceof Error) {
        return { success: false, error: error.message }
      }
      return { success: false, error: 'Failed to deny device' }
    }
  })

/**
 * tRPC router for CLI device authorization.
 *
 * Provides endpoints for the /cli/authorize page to:
 * - Verify if a user code is valid
 * - Approve or deny device authorization requests
 */
export const cliRouter = router({
  verifyDeviceCode,
  approveDevice,
  denyDevice,
})
