import { Result } from 'better-result'
import { comprehensiveAdminTransaction } from '@/db/adminTransaction'
import { productIdOrPurchaseIdSchema } from '@/db/schema/discounts'
import { publicProcedure } from '@/server/trpc'
import { editCheckoutSession } from '@/utils/bookkeeping/checkoutSessions'
import {
  findProductCheckoutSession,
  findPurchaseCheckoutSession,
} from '@/utils/checkoutSessionState'

export const clearDiscountCode = publicProcedure
  .input(productIdOrPurchaseIdSchema)
  .mutation(async ({ input }) => {
    return comprehensiveAdminTransaction(async (ctx) => {
      const { transaction } = ctx
      // FIXME: find a more elegant way to model this.
      const checkoutSession =
        'productId' in input
          ? await findProductCheckoutSession(
              input.productId,
              transaction
            )
          : await findPurchaseCheckoutSession(
              input.purchaseId,
              transaction
            )
      if (!checkoutSession) {
        return Result.ok(false)
      }
      const maybePurchaseId = (input as { purchaseId: string })
        .purchaseId
      await editCheckoutSession(
        {
          checkoutSession: {
            ...checkoutSession,
            discountId: null,
          },
          purchaseId: maybePurchaseId,
        },
        ctx
      )
      return Result.ok(true)
    })
  })
