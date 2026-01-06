import * as R from 'ramda'
import { adminTransaction } from '@/db/adminTransaction'
import { attemptDiscountCodeInputSchema } from '@/db/schema/discounts'
import { selectDiscounts } from '@/db/tableMethods/discountMethods'
import { selectProducts } from '@/db/tableMethods/productMethods'
import { selectPurchaseById } from '@/db/tableMethods/purchaseMethods'
import { publicProcedure } from '@/server/trpc'
import { CheckoutSessionType } from '@/types'
import { editCheckoutSession } from '@/utils/bookkeeping/checkoutSessions'
import {
  type CheckoutSessionCookieNameParams,
  findCheckoutSession,
} from '@/utils/checkoutSessionState'

export const attemptDiscountCode = publicProcedure
  .input(attemptDiscountCodeInputSchema)
  .mutation(async ({ input }) => {
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

    const isValid = await adminTransaction(
      async ({ transaction }) => {
        if ('invoiceId' in input) {
          throw new Error(
            `Invoice checkout flow does not support discount codes. Invoice id: ${input.invoiceId}`
          )
        }
        const checkoutSession = await findCheckoutSession(
          findInput,
          transaction
        )

        if (!checkoutSession) {
          return false
        }

        // Find active discounts with matching code
        const matchingDiscounts = await selectDiscounts(
          {
            code: input.code,
            organizationId: checkoutSession.organizationId,
            livemode: checkoutSession.livemode,
          },
          transaction
        )
        const updateCheckoutSessionDiscount = (
          discountId: string | null
        ) => {
          return editCheckoutSession(
            {
              checkoutSession: { ...checkoutSession, discountId },
              purchaseId: R.propOr(null, 'purchaseId', input),
            },
            transaction
          )
        }
        const discount = matchingDiscounts[0]

        if (!discount || !discount.active) {
          await updateCheckoutSessionDiscount(null)
          return false
        }

        // Check if product or purchase exists and get its organizationId
        let organizationId: string | null = null
        if ('productId' in input) {
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
          await updateCheckoutSessionDiscount(null)
          return false
        }
        // Verify organization matches
        const applyDiscount =
          matchingDiscounts[0].organizationId === organizationId
        if (!applyDiscount) {
          await updateCheckoutSessionDiscount(null)
          return false
        }
        await updateCheckoutSessionDiscount(matchingDiscounts[0].id)
        return applyDiscount
      },
      { operationName: 'attemptDiscountCode' }
    )

    return { isValid }
  })
