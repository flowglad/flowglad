import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { createPriceSchema } from '@/db/schema/prices'
import {
  insertPrice,
  selectPrices,
} from '@/db/tableMethods/priceMethods'
import { TRPCError } from '@trpc/server'
import { selectFocusedMembershipAndOrganization } from '@/db/tableMethods/membershipMethods'

export const createPrice = protectedProcedure
  .input(createPriceSchema)
  .mutation(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction, userId }) => {
        const { price } = input

        // Get all prices for this product to validate default price constraint
        const existingPrices = await selectPrices(
          { productId: price.productId },
          transaction
        )

        // If we're setting this price as default, ensure no other prices are default
        const defaultPrices = [...existingPrices, price].filter(
          (v) => v.isDefault
        )

        if (defaultPrices.length !== 1) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'There must be exactly one default price per product',
          })
        }
        const focusedMembership =
          await selectFocusedMembershipAndOrganization(
            userId,
            transaction
          )
        const newPrice = await insertPrice(
          {
            ...price,
            currency: focusedMembership.organization.defaultCurrency,
          },
          transaction
        )
        return {
          data: { price: newPrice },
        }
      }
    )
  })
