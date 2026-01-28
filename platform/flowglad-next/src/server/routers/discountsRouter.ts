import { Result } from 'better-result'
import { z } from 'zod'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
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
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
  idInputSchema,
} from '@/db/tableUtils'
import { attemptDiscountCode } from '@/server/mutations/attemptDiscountCode'
import { clearDiscountCode } from '@/server/mutations/clearDiscountCode'
import { protectedProcedure } from '@/server/trpc'
import { validateAndResolvePricingModelId } from '@/utils/discountValidation'
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
    const result = await authenticatedTransaction(
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
        const pricingModelId = await validateAndResolvePricingModelId(
          {
            pricingModelId: input.discount.pricingModelId,
            organizationId: organization.id,
            livemode,
            transaction,
          }
        )

        const discount = await insertDiscount(
          {
            ...input.discount,
            pricingModelId,
            organizationId: organization.id,
            livemode,
          },
          transaction
        )
        return Result.ok({ discount })
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
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
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const paginatedResult = await selectDiscountsPaginated(
          input,
          transaction
        )
        const enriched = await enrichDiscountsWithRedemptionCounts(
          paginatedResult.data,
          transaction
        )
        return Result.ok({
          ...paginatedResult,
          data: enriched,
        })
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
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
  .query(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const data = await selectDiscountsTableRowData({
          input,
          transaction,
        })
        return Result.ok(data)
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

export const updateDiscount = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editDiscountInputSchema)
  .output(z.object({ discount: discountClientSelectSchema }))
  .mutation(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const discount = await updateDiscountDB(
          {
            ...input.discount,
            id: input.id,
          },
          transaction
        )
        return Result.ok({ discount })
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

export const deleteDiscount = protectedProcedure
  .input(idInputSchema)
  .mutation(async ({ input, ctx }) => {
    const { id } = input
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        await deleteDiscountMethod(id, transaction)
        return Result.ok({ success: true })
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

export const getDiscount = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(z.object({ discount: discountWithRedemptionsSchema }))
  .query(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const discountRecord = (
          await selectDiscountById(input.id, transaction)
        ).unwrap()
        const [enriched] = await enrichDiscountsWithRedemptionCounts(
          [discountRecord],
          transaction
        )
        return Result.ok({ discount: enriched })
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
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
