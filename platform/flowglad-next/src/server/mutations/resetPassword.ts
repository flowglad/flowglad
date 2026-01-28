import { Result } from 'better-result'
import { z } from 'zod'
import { adminTransaction } from '@/db/adminTransaction'
import { selectBetterAuthUserByEmail } from '@/db/tableMethods/betterAuthSchemaMethods'
import { publicProcedure } from '@/server/trpc'
import { auth } from '@/utils/auth'

export const resetPassword = publicProcedure
  .input(z.object({ email: z.string().email() }))
  .mutation(async ({ input }) => {
    const { email } = input

    const txResult = await adminTransaction(
      async ({ transaction }) => {
        const user = await selectBetterAuthUserByEmail(
          email,
          transaction
        )
        return Result.ok(user)
      }
    )
    const userExists = txResult.unwrap()

    if (userExists) {
      try {
        await auth.api.forgetPassword({
          body: {
            email,
            redirectTo: '/sign-in/reset-password',
          },
        })
      } catch (error) {
        console.error('Failed to send password reset email:', error)
        // Swallow error to prevent user enumeration via timing/error differences
      }
    }

    // Always return success to prevent user enumeration
    return {
      success: true,
      message:
        'If an account exists with this email, a password reset link has been sent',
    }
  })
