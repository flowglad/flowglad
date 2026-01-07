import { z } from 'zod'
import { adminTransaction } from '@/db/adminTransaction'
import { selectBetterAuthUserByEmail } from '@/db/tableMethods/betterAuthSchemaMethods'
import { publicProcedure } from '@/server/trpc'
import { auth } from '@/utils/auth'

export const resetPassword = publicProcedure
  .input(z.object({ email: z.string().email() }))
  .mutation(async ({ input }) => {
    const { email } = input

    const userExists = await adminTransaction(
      async ({ transaction }) => {
        return selectBetterAuthUserByEmail(email, transaction)
      }
    )

    if (userExists) {
      await auth.api.forgetPassword({
        body: {
          email,
          redirectTo: '/sign-in/reset-password',
        },
      })
    }

    // Always return success to prevent user enumeration
    return {
      success: true,
      message:
        'If an account exists with this email, a password reset link has been sent',
    }
  })
