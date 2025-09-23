import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { createDiscountInputSchema } from '@/db/schema/discounts'
import { insertDiscount } from '@/db/tableMethods/discountMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'

export const createDiscount = protectedProcedure
  .input(createDiscountInputSchema)
  .mutation(async ({ input, ctx: _ctx }) => {
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
        return insertDiscount(
          {
            ...input.discount,
            organizationId: organization.id,
            livemode,
          },
          transaction
        )
      }
    )
    return { data: { discount } }
  })
