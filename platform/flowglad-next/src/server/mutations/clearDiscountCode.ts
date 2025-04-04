import { publicProcedure } from '@/server/trpc'
import {
  findProductCheckoutSession,
  findPurchaseCheckoutSession,
  findInvoiceCheckoutSession,
} from '@/utils/checkoutSessionState'
import { editCheckoutSession } from '@/utils/bookkeeping/checkoutSessions'
import { adminTransaction } from '@/db/adminTransaction'
import { productIdOrPurchaseIdSchema } from '@/db/schema/discounts'

export const clearDiscountCode = publicProcedure
  .input(productIdOrPurchaseIdSchema)
  .mutation(async ({ input }) => {
    return adminTransaction(async ({ transaction }) => {
      // TODO: find a more elegant way to model this.
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
        return false
      }
      const maybePurchaseId = (input as { purchaseId: string })
        .purchaseId
      return editCheckoutSession(
        {
          checkoutSession: {
            ...checkoutSession,
            discountId: null,
          },
          purchaseId: maybePurchaseId,
        },
        transaction
      )
    })
  })
