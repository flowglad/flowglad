import * as R from 'ramda'
import { publicProcedure } from '@/server/trpc'
import { adminTransaction } from '@/db/databaseMethods'
import { attemptDiscountCodeInputSchema } from '@/db/schema/discounts'
import { selectDiscounts } from '@/db/tableMethods/discountMethods'
import { selectProducts } from '@/db/tableMethods/productMethods'
import { selectPurchaseById } from '@/db/tableMethods/purchaseMethods'
import {
  findCheckoutSession,
  CheckoutSessionCookieNameParams,
} from '@/utils/checkoutSessionState'
import { editCheckoutSession } from '@/utils/bookkeeping/checkoutSessions'
import { CheckoutSessionType } from '@/types'

export const attemptDiscountCode = publicProcedure
  .input(attemptDiscountCodeInputSchema)
  .mutation(async ({ input }) => {
    const isValid = await adminTransaction(
      async ({ transaction }) => {
        // Find active discounts with matching code
        const matchingDiscounts = await selectDiscounts(
          {
            code: input.code,
          },
          transaction
        )

        if (matchingDiscounts.length === 0) {
          return false
        }

        const discount = matchingDiscounts[0]

        if (!discount.active) {
          return false
        }

        // Check if product or purchase exists and get its organizationId
        let organizationId: string | null = null
        if ('invoiceId' in input) {
          throw new Error(
            `Invoice checkout flow does not support discount codes. Invoice id: ${input.invoiceId}`
          )
        } else if ('productId' in input) {
          const products = await selectProducts(
            {
              id: input.productId,
            },
            transaction
          )
          organizationId = products[0]?.organizationId
        } else if ('purchaseId' in input) {
          const purchase = await selectPurchaseById(
            input.purchaseId,
            transaction
          )
          organizationId = purchase?.organizationId
        }

        if (!organizationId) {
          return false
        }
        if ('invoiceId' in input) {
          throw new Error(
            `Invoice checkout flow does not support discount codes. Invoice id: ${input.invoiceId}`
          )
        }
        const findInput: CheckoutSessionCookieNameParams =
          'productId' in input
            ? {
                productId: input.productId,
                type: CheckoutSessionType.Product,
              }
            : {
                purchaseId: input.purchaseId,
                type: CheckoutSessionType.Purchase,
              }
        const checkoutSession = await findCheckoutSession(
          findInput,
          transaction
        )

        if (!checkoutSession) {
          return false
        }

        await editCheckoutSession(
          {
            checkoutSession: {
              ...checkoutSession,
              discountId: matchingDiscounts[0].id,
            },
            purchaseId: R.propOr(null, 'purchaseId', input),
          },
          transaction
        )
        // Verify organization matches
        return matchingDiscounts[0].organizationId === organizationId
      }
    )

    return { isValid }
  })
