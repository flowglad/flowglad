import { createDiscountInputSchema } from '@db-core/schema/discounts'
import { TRPCError } from '@trpc/server'
import { Result } from 'better-result'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { insertDiscount } from '@/db/tableMethods/discountMethods'
import { protectedProcedure } from '@/server/trpc'

export const createDiscount = protectedProcedure
  .input(createDiscountInputSchema)
  .mutation(async ({ input, ctx }) => {
    const pricingModelId = ctx.isApi
      ? ctx.apiKeyPricingModelId
      : ctx.focusedPricingModelId
    if (!pricingModelId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'Unable to determine pricing model scope. Ensure your API key is associated with a pricing model.',
      })
    }

    const organizationId = ctx.organizationId
    if (!organizationId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'organizationId is required',
      })
    }

    const discount = (
      await authenticatedTransaction(
        async ({ transaction, livemode }) => {
          const discount = await insertDiscount(
            {
              ...input.discount,
              pricingModelId,
              organizationId,
              livemode,
            },
            transaction
          )
          return Result.ok(discount)
        }
      )
    ).unwrap()
    return { data: { discount } }
  })
