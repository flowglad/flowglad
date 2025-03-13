import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { createVariantSchema } from '@/db/schema/variants'
import {
  insertVariant,
  selectVariants,
  updateVariant,
} from '@/db/tableMethods/variantMethods'
import { TRPCError } from '@trpc/server'
import { selectProducts } from '@/db/tableMethods/productMethods'
import { upsertStripePriceFromVariant } from '@/utils/stripe'
import { selectFocusedMembershipAndOrganization } from '@/db/tableMethods/membershipMethods'

export const createVariant = protectedProcedure
  .input(createVariantSchema)
  .mutation(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction, userId }) => {
        const { variant } = input

        // Get all variants for this product to validate default price constraint
        const existingVariants = await selectVariants(
          { productId: variant.productId },
          transaction
        )

        // If we're setting this variant as default, ensure no other variants are default
        const defaultVariants = [...existingVariants, variant].filter(
          (v) => v.isDefault
        )

        if (defaultVariants.length !== 1) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'There must be exactly one default variant per product',
          })
        }
        const focusedMembership =
          await selectFocusedMembershipAndOrganization(
            userId,
            transaction
          )
        const newVariant = await insertVariant(
          {
            ...variant,
            currency: focusedMembership.organization.defaultCurrency,
            stripePriceId: null,
          },
          transaction
        )
        const [product] = await selectProducts(
          { id: variant.productId },
          transaction
        )
        const stripePrice = await upsertStripePriceFromVariant({
          variant: newVariant,
          productStripeId: product.stripeProductId!,
          livemode: product.livemode,
        })
        await updateVariant(
          { ...newVariant, stripePriceId: stripePrice.id },
          transaction
        )
        return {
          data: newVariant,
        }
      }
    )
  })
