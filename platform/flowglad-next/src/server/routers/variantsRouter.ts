import { router } from '@/server/trpc'
import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/databaseMethods'
import {
  editVariantSchema,
  variantsClientSelectSchema,
  variantsPaginatedListSchema,
  variantsPaginatedSelectSchema,
} from '@/db/schema/variants'
import { editVariantTransaction } from '@/utils/catalog'
import { createVariantSchema } from '@/db/schema/variants'
import {
  insertVariant,
  selectVariants,
  selectVariantsPaginated,
  updateVariant,
} from '@/db/tableMethods/variantMethods'
import { TRPCError } from '@trpc/server'
import { selectProducts } from '@/db/tableMethods/productMethods'
import { upsertStripePriceFromVariant } from '@/utils/stripe'
import { generateOpenApiMetas } from '@/utils/openapi'
import { z } from 'zod'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'Variant',
  tags: ['Variants'],
})

export const variantsRouteConfigs = routeConfigs

export const listVariants = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(variantsPaginatedSelectSchema)
  .output(variantsPaginatedListSchema)
  .query(async ({ input }) => {
    return authenticatedTransaction(async ({ transaction }) => {
      return selectVariantsPaginated(input, transaction)
    })
  })

const singleVariantOutputSchema = z.object({
  variant: variantsClientSelectSchema,
})

export const createVariant = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createVariantSchema)
  .output(singleVariantOutputSchema)
  .mutation(async ({ input }) => {
    return authenticatedTransaction(async ({ transaction }) => {
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

      const newVariant = await insertVariant(
        {
          ...variant,
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
        variant: newVariant,
      }
    })
  })

export const editVariant = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editVariantSchema)
  .output(singleVariantOutputSchema)
  .mutation(async ({ input }) => {
    return authenticatedTransaction(
      async ({ transaction, userId }) => {
        const { variant } = input

        const updatedVariant = await editVariantTransaction(
          { variant },
          transaction
        )
        return {
          variant: updatedVariant,
        }
      }
    )
  })

export const variantsRouter = router({
  list: listVariants,
  create: createVariant,
  edit: editVariant,
})
