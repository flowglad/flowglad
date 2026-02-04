import { headers } from 'next/headers'
import { z } from 'zod'
import { auth } from '@/utils/auth'
import { protectedProcedure, router } from '../trpc'

/**
 * Verify a device user code is valid and not expired.
 *
 * This is used to display the authorization form with confidence that the code is valid.
 * Uses protectedProcedure to prevent unauthenticated users from probing valid device codes.
 */
const verifyDeviceCode = protectedProcedure
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
    // Use BETTER_AUTH_URL (server-only env var) instead of NEXT_PUBLIC_APP_URL
    const baseUrl =
      process.env.BETTER_AUTH_URL || 'http://localhost:3000'

    // Add timeout to prevent hanging requests
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

    try {
      const response = await fetch(
        `${baseUrl}/api/auth/merchant/device?user_code=${encodeURIComponent(input.userCode)}`,
        { signal: controller.signal }
      )
      clearTimeout(timeoutId)

      if (!response.ok) {
        return { valid: false, error: 'Invalid or expired code' }
      }

      return { valid: true }
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof Error && error.name === 'AbortError') {
        return { valid: false, error: 'Request timed out' }
      }
      return { valid: false, error: 'Failed to verify code' }
    }
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
