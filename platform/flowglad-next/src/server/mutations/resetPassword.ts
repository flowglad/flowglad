import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { publicProcedure } from '@/server/trpc'
import db from '@/db/client'
import { user } from '@/db/schema/betterAuthSchema'
import { authClient } from '@/utils/authClient'

export const resetPassword = publicProcedure
  .input(z.object({ email: z.string().email() }))
  .mutation(async ({ input }) => {
    const { email } = input

    const userExists = await db
      .select()
      .from(user)
      .where(eq(user.email, email))

    if (userExists.length > 0) {
      await authClient.requestPasswordReset({
        email: email,
        redirectTo: '/sign-in/reset-password',
      })
    }

    // Always return success to prevent user enumeration
    return {
      success: true,
      message:
        'If an account exists with this email, a password reset link has been sent',
    }
  })
