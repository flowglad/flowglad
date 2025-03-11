import { publicProcedure } from '@/server/trpc'
import {
  findProductPurchaseSession,
  findPurchasePurchaseSession,
  findInvoicePurchaseSession,
} from '@/utils/purchaseSessionState'
import { editPurchaseSession } from '@/utils/bookkeeping/purchaseSessions'
import { adminTransaction } from '@/db/databaseMethods'
import { productIdOrPurchaseIdSchema } from '@/db/schema/discounts'

export const clearDiscountCode = publicProcedure
  .input(productIdOrPurchaseIdSchema)
  .mutation(async ({ input }) => {
    return adminTransaction(async ({ transaction }) => {
      // TODO: find a more elegant way to model this.
      const purchaseSession =
        'productId' in input
          ? await findProductPurchaseSession(
              input.productId,
              transaction
            )
          : await findPurchasePurchaseSession(
              input.purchaseId,
              transaction
            )
      if (!purchaseSession) {
        return false
      }
      const maybePurchaseId = (input as { purchaseId: string })
        .purchaseId
      return editPurchaseSession(
        {
          purchaseSession: {
            ...purchaseSession,
            DiscountId: null,
          },
          purchaseId: maybePurchaseId,
        },
        transaction
      )
    })
  })
