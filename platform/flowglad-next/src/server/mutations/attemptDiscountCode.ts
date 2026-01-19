import { Result } from 'better-result'
import * as R from 'ramda'
import { comprehensiveAdminTransaction } from '@/db/adminTransaction'
import { attemptDiscountCodeInputSchema } from '@/db/schema/discounts'
import { selectDiscounts } from '@/db/tableMethods/discountMethods'
import { selectProducts } from '@/db/tableMethods/productMethods'
import {
  derivePricingModelIdFromPurchase,
  selectPurchaseById,
} from '@/db/tableMethods/purchaseMethods'
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

    const isValid = (
      await comprehensiveAdminTransaction(async (ctx) => {
        const { transaction } = ctx
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
          return Result.ok(false)
        }

        const updateCheckoutSessionDiscount = (
          discountId: string | null
        ) => {
          return editCheckoutSession(
            {
              checkoutSession: { ...checkoutSession, discountId },
              purchaseId: R.propOr(null, 'purchaseId', input),
            },
            ctx
          )
        }

        // Get the pricing model ID for this checkout
        let pricingModelId: string | null = null
        let organizationId: string | null = null

        if ('productId' in input) {
          const products = await selectProducts(
            { id: input.productId },
            transaction
          )
          const product = products[0]
          if (product) {
            pricingModelId = product.pricingModelId
            organizationId = product.organizationId
          }
        } else if ('purchaseId' in input) {
          const purchase = await selectPurchaseById(
            input.purchaseId,
            transaction
          )
          if (purchase) {
            organizationId = purchase.organizationId
            pricingModelId = await derivePricingModelIdFromPurchase(
              input.purchaseId,
              transaction
            )
          }
        }

        if (!pricingModelId || !organizationId) {
          await updateCheckoutSessionDiscount(null)
          return Result.ok(false)
        }

        // Find active discounts with matching code AND pricing model
        const matchingDiscounts = await selectDiscounts(
          {
            code: input.code,
            pricingModelId,
            active: true,
          },
          transaction
        )

        const discount = matchingDiscounts[0]

        if (!discount) {
          await updateCheckoutSessionDiscount(null)
          return Result.ok(false)
        }

        // Verify organization matches
        if (discount.organizationId !== organizationId) {
          await updateCheckoutSessionDiscount(null)
          return Result.ok(false)
        }

        await updateCheckoutSessionDiscount(discount.id)
        return Result.ok(true)
      })
    ).unwrap()

    return { isValid }
  })
