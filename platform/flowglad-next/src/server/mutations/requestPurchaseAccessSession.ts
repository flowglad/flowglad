import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { publicProcedure } from '@/server/trpc'
import { adminTransaction } from '@/db/databaseMethods'
import {
  selectPurchaseById,
  selectPurchases,
} from '@/db/tableMethods/purchaseMethods'
import { createPurchaseAccessSession } from '@/utils/purchaseAccessSessionState'
import { selectCustomerProfileById } from '@/db/tableMethods/customerProfileMethods'
import core from '@/utils/core'
import { PurchaseAccessSessionSource } from '@/types'
import { sendPurchaseAccessSessionTokenEmail } from '@/utils/email'

export const requestPurchaseAccessSession = publicProcedure
  .input(
    z.object({
      purchaseId: z.string(),
      livemode: z.boolean(),
    })
  )
  .mutation(async ({ input }) => {
    return adminTransaction(async ({ transaction }) => {
      // Find purchase by id
      const purchase = await selectPurchaseById(
        input.purchaseId,
        transaction
      )

      if (!purchase) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Purchase not found',
        })
      }

      const purchaseAccessSession = await createPurchaseAccessSession(
        {
          purchaseId: purchase.id,
          source: PurchaseAccessSessionSource.EmailVerification,
          autoGrant: false,
          livemode: purchase.livemode,
        },
        transaction
      )

      const customerProfile = await selectCustomerProfileById(
        purchase.customerProfileId,
        transaction
      )

      const verificationURL =
        core.safeUrl(
          `/purchase/verify/${purchase.id}`,
          core.envVariable('NEXT_PUBLIC_APP_URL')
        ) + `?token=${purchaseAccessSession.token}`

      await sendPurchaseAccessSessionTokenEmail({
        to: [customerProfile.email!],
        magicLink: verificationURL,
      })

      return {
        success: true,
      }
    })
  })
