import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { createDiscountInputSchema } from '@/db/schema/discounts'
import { insertDiscount } from '@/db/tableMethods/discountMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { protectedProcedure } from '@/server/trpc'
import { validateAndResolvePricingModelId } from '@/utils/discountValidation'

export const createDiscount = protectedProcedure
  .input(createDiscountInputSchema)
  .mutation(async ({ input, ctx }) => {
    const discount = (
      await authenticatedTransaction(
        async ({ transaction, userId, livemode }) => {
          const [{ organization }] =
            await selectMembershipAndOrganizations(
              {
                userId,
                focused: true,
              },
              transaction
            )

          // Validate and resolve pricingModelId (uses default if not provided)
          const pricingModelId =
            await validateAndResolvePricingModelId({
              pricingModelId: input.discount.pricingModelId,
              organizationId: organization.id,
              livemode,
              transaction,
            })

          return insertDiscount(
            {
              ...input.discount,
              pricingModelId,
              organizationId: organization.id,
              livemode,
            },
            transaction
          )
        }
      )
    ).unwrap()
    return { data: { discount } }
  })
