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
        return insertDiscount(
          {
            ...input.discount,
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
