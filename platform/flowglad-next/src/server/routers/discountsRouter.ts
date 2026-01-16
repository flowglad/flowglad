import { z } from 'zod'
import {
  authenticatedProcedureTransaction,
  authenticatedTransaction,
} from '@/db/authenticatedTransaction'
import {
  createDiscountInputSchema,
  discountClientSelectSchema,
  discountsPaginatedListSchema,
  discountsPaginatedListWithRedemptionsSchema,
  discountsPaginatedSelectSchema,
  discountsTableRowDataSchema,
  discountWithRedemptionsSchema,
  editDiscountInputSchema,
} from '@/db/schema/discounts'
import {
  deleteDiscount as deleteDiscountMethod,
  enrichDiscountsWithRedemptionCounts,
  insertDiscount,
  selectDiscountById,
  selectDiscountsPaginated,
  selectDiscountsTableRowData,
  updateDiscount as updateDiscountDB,
} from '@/db/tableMethods/discountMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import {
  selectDefaultPricingModel,
  selectPricingModels,
} from '@/db/tableMethods/pricingModelMethods'
import {
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
  idInputSchema,
} from '@/db/tableUtils'
import { attemptDiscountCode } from '@/server/mutations/attemptDiscountCode'
import { clearDiscountCode } from '@/server/mutations/clearDiscountCode'
import { protectedProcedure } from '@/server/trpc'
import { generateOpenApiMetas, trpcToRest } from '@/utils/openapi'
import { router } from '../trpc'

const { openApiMetas } = generateOpenApiMetas({
  resource: 'discount',
  tags: ['Discounts'],
})

export const createDiscount = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createDiscountInputSchema)
  .output(z.object({ discount: discountClientSelectSchema }))
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
      },
      {
        apiKey: ctx.apiKey,
      }
    )
    return { discount }
  })

export const discountsRouteConfigs = {
  ...trpcToRest('discounts.create'),
  ...trpcToRest('discounts.update'),
  ...trpcToRest('discounts.get'),
  // ...trpcToRest('discounts.delete'),
  // ...trpcToRest('discounts.attempt'),
  // ...trpcToRest('discounts.clear'),
  ...trpcToRest('discounts.list'),
}

const listDiscountsProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(discountsPaginatedSelectSchema)
  .output(discountsPaginatedListWithRedemptionsSchema)
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        const result = await selectDiscountsPaginated(
          input,
          transaction
        )
        const enriched = await enrichDiscountsWithRedemptionCounts(
          result.data,
          transaction
        )
        return {
          ...result,
          data: enriched,
        }
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

const getTableRowsProcedure = protectedProcedure
  .input(
    createPaginatedTableRowInputSchema(
      z.object({
        active: z.boolean().optional(),
        pricingModelId: z.string().optional(),
      })
    )
  )
  .output(
    createPaginatedTableRowOutputSchema(discountsTableRowDataSchema)
  )
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        return selectDiscountsTableRowData({ input, transaction })
      }
    )
  )

export const updateDiscount = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editDiscountInputSchema)
  .output(z.object({ discount: discountClientSelectSchema }))
  .mutation(async ({ input, ctx }) => {
    const discount = await authenticatedTransaction(
      async ({ transaction }) => {
        const updatedDiscount = await updateDiscountDB(
          {
            ...input.discount,
            id: input.id,
          },
          transaction
        )
        return updatedDiscount
      },
      {
        apiKey: ctx.apiKey,
      }
    )
    return { discount }
  })

export const deleteDiscount = protectedProcedure
  .input(idInputSchema)
  .mutation(async ({ input, ctx }) => {
    const { id } = input
    await authenticatedTransaction(
      ({ transaction }) => deleteDiscountMethod(id, transaction),
      {
        apiKey: ctx.apiKey,
      }
    )
    return { success: true }
  })

export const getDiscount = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(z.object({ discount: discountWithRedemptionsSchema }))
  .query(async ({ input, ctx }) => {
    const discount = await authenticatedTransaction(
      async ({ transaction }) => {
        const discountRecord = await selectDiscountById(
          input.id,
          transaction
        )
        const [enriched] = await enrichDiscountsWithRedemptionCounts(
          [discountRecord],
          transaction
        )
        return enriched
      },
      { apiKey: ctx.apiKey }
    )
    return { discount }
  })

export const discountsRouter = router({
  get: getDiscount,
  create: createDiscount,
  update: updateDiscount,
  delete: deleteDiscount,
  attempt: attemptDiscountCode,
  clear: clearDiscountCode,
  list: listDiscountsProcedure,
  getTableRows: getTableRowsProcedure,
})
