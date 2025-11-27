import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectOrganizationAndFirstMemberByOrganizationId } from '@/db/tableMethods/organizationMethods'
import { selectPurchaseById } from '@/db/tableMethods/purchaseMethods'
import { publicProcedure } from '@/server/trpc'
import { PurchaseAccessSessionSource } from '@/types'
import core from '@/utils/core'
import { sendPurchaseAccessSessionTokenEmail } from '@/utils/email'
import { createPurchaseAccessSession } from '@/utils/purchaseAccessSessionState'

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

      const customer = await selectCustomerById(
        purchase.customerId,
        transaction
      )

      const orgAndFirstMember =
        await selectOrganizationAndFirstMemberByOrganizationId(
          customer.organizationId,
          transaction
        )

      const verificationURL =
        core.safeUrl(
          `/purchase/verify/${purchase.id}`,
          core.NEXT_PUBLIC_APP_URL
        ) + `?token=${purchaseAccessSession.token}`

      await sendPurchaseAccessSessionTokenEmail({
        to: [customer.email!],
        magicLink: verificationURL,
        replyTo: orgAndFirstMember?.user.email,
        livemode: purchase.livemode,
      })

      return {
        success: true,
      }
    })
  })
