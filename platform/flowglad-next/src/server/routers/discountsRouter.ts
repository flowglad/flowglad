import {
  createDiscountInputSchema,
  discountClientSelectSchema,
  discountsPaginatedListSchema,
  discountsPaginatedListWithRedemptionsSchema,
  discountsPaginatedSelectSchema,
  discountsTableRowDataSchema,
  discountWithRedemptionsSchema,
  editDiscountInputSchema,
} from '@db-core/schema/discounts'

import {
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
  idInputSchema,
} from '@db-core/tableUtils'
import { Result } from 'better-result'
import { z } from 'zod'
import {
  authenticatedProcedureTransaction,
  authenticatedTransactionWithResult,
} from '@/db/authenticatedTransaction'
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
import { attemptDiscountCode } from '@/server/mutations/attemptDiscountCode'
import { clearDiscountCode } from '@/server/mutations/clearDiscountCode'
import { protectedProcedure } from '@/server/trpc'
import { validateAndResolvePricingModelId } from '@/utils/discountValidation'
import { generateOpenApiMetas, trpcToRest } from '@/utils/openapi'
import { unwrapOrThrow } from '@/utils/resultHelpers'
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
    const discount = (
      await authenticatedTransactionWithResult(
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

          return Result.ok(
            await insertDiscount(
              {
                ...input.discount,
                pricingModelId,
                organizationId: organization.id,
                livemode,
              },
              transaction
            )
          )
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    ).unwrap()
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
    return unwrapOrThrow(
      await authenticatedTransactionWithResult(
        async ({ transaction }) => {
          const result = await selectDiscountsPaginated(
            input,
            transaction
          )
          const enriched = await enrichDiscountsWithRedemptionCounts(
            result.data,
            transaction
          )
          return Result.ok({
            ...result,
            data: enriched,
          })
        },
        {
          apiKey: ctx.apiKey,
        }
      )
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
        return await selectDiscountsTableRowData({
          input,
          transaction,
        })
      }
    )
  )

export const updateDiscount = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editDiscountInputSchema)
  .output(z.object({ discount: discountClientSelectSchema }))
  .mutation(async ({ input, ctx }) => {
    const discount = (
      await authenticatedTransactionWithResult(
        async ({ transaction }) => {
          const updatedDiscount = await updateDiscountDB(
            {
              ...input.discount,
              id: input.id,
            },
            transaction
          )
          return Result.ok(updatedDiscount)
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    ).unwrap()
    return { discount }
  })

export const deleteDiscount = protectedProcedure
  .input(idInputSchema)
  .mutation(async ({ input, ctx }) => {
    const { id } = input
    ;(
      await authenticatedTransactionWithResult(
        async ({ transaction }) => {
          await deleteDiscountMethod(id, transaction)
          return Result.ok(undefined)
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    ).unwrap()
    return { success: true }
  })

export const getDiscount = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(z.object({ discount: discountWithRedemptionsSchema }))
  .query(async ({ input, ctx }) => {
    const discount = unwrapOrThrow(
      await authenticatedTransactionWithResult(
        async ({ transaction }) => {
          const discountRecord = (
            await selectDiscountById(input.id, transaction)
          ).unwrap()
          const [enriched] =
            await enrichDiscountsWithRedemptionCounts(
              [discountRecord],
              transaction
            )
          return Result.ok(enriched)
        },
        { apiKey: ctx.apiKey }
      )
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
