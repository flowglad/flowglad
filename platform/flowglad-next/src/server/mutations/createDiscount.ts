import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { createDiscountInputSchema } from '@/db/schema/discounts'
import { insertDiscount } from '@/db/tableMethods/discountMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { createStripeCouponFromDiscountInsert } from '@/utils/stripe'

export const createDiscount = protectedProcedure
  .input(createDiscountInputSchema)
  .mutation(async ({ input, ctx }) => {
    const discount = await authenticatedTransaction(
      async ({ transaction, userId, livemode }) => {
        const [{ organization }] =
          await selectMembershipAndOrganizations(
            {
              userId,
              focused: true,
            },
            transaction
          )
        const stripeCoupon =
          await createStripeCouponFromDiscountInsert(
            input.discount,
            ctx.environment === 'live'
          )
        return insertDiscount(
          {
            ...input.discount,
            organizationId: organization.id,
            stripeCouponId: stripeCoupon.id,
            livemode,
          },
          transaction
        )
      }
    )
    return { data: { discount } }
  })
