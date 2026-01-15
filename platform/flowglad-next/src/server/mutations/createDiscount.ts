import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { createDiscountInputSchema } from '@/db/schema/discounts'
import { insertDiscount } from '@/db/tableMethods/discountMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import {
  selectDefaultPricingModel,
  selectPricingModels,
} from '@/db/tableMethods/pricingModelMethods'
import { protectedProcedure } from '@/server/trpc'

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

        // Get pricingModelId from input or use default
        let pricingModelId = input.discount.pricingModelId
        if (pricingModelId) {
          // Validate that the provided pricingModelId belongs to this organization and livemode
          const [validPricingModel] = await selectPricingModels(
            {
              id: pricingModelId,
              organizationId: organization.id,
              livemode,
            },
            transaction
          )
          if (!validPricingModel) {
            throw new Error(
              'Invalid pricing model: the specified pricing model does not exist or does not belong to this organization'
            )
          }
        } else {
          const defaultPM = await selectDefaultPricingModel(
            { organizationId: organization.id, livemode },
            transaction
          )
          if (!defaultPM) {
            throw new Error(
              'No default pricing model found for organization'
            )
          }
          pricingModelId = defaultPM.id
        }

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
    return { data: { discount } }
  })
