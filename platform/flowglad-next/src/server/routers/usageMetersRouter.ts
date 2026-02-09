import {
  createUsageMeterSchema,
  editUsageMeterSchema,
  usageMeterPaginatedListSchema,
  usageMeterPaginatedSelectSchema,
  usageMetersClientSelectSchema,
  usageMetersTableRowDataSchema,
} from '@db-core/schema/usageMeters'

import {
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
  idInputSchema,
} from '@db-core/tableUtils'
import { TRPCError } from '@trpc/server'
import { Result } from 'better-result'
import { z } from 'zod'
import {
  authenticatedProcedureComprehensiveTransaction,
  authenticatedProcedureTransaction,
} from '@/db/authenticatedTransaction'
import {
  selectUsageMeterById,
  selectUsageMetersCursorPaginated,
  selectUsageMetersPaginated,
  updateUsageMeter as updateUsageMeterDB,
} from '@/db/tableMethods/usageMeterMethods'
import { CacheDependency } from '@/utils/cache'
import { generateOpenApiMetas } from '@/utils/openapi'
import { createUsageMeterTransaction } from '@/utils/usage'
import { protectedProcedure, router } from '../trpc'
import { errorHandlers } from '../trpcErrorHandler'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'usageMeter',
  tags: ['Usage Meters'],
})

export const usageMetersRouteConfigs = routeConfigs

export const createUsageMeter = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createUsageMeterSchema)
  .output(z.object({ usageMeter: usageMetersClientSelectSchema }))
  .mutation(
    authenticatedProcedureComprehensiveTransaction(
      async ({ input, ctx, transactionCtx }) => {
        const {
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
          enqueueTriggerTask,
        } = transactionCtx
        const { livemode, organizationId } = ctx
        if (!organizationId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Organization ID is required for this operation.',
          })
        }
        const pricingModelId = ctx.isApi
          ? ctx.apiKeyPricingModelId
          : ctx.focusedPricingModelId
        if (!pricingModelId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Unable to determine pricing model scope. Ensure your API key is associated with a pricing model.',
          })
        }
        try {
          const { usageMeter } = await createUsageMeterTransaction(
            {
              usageMeter: { ...input.usageMeter, pricingModelId },
              price: input.price,
            },
            {
              transaction,
              cacheRecomputationContext,
              livemode,
              organizationId,
              invalidateCache,
              emitEvent,
              enqueueLedgerCommand,
              enqueueTriggerTask,
            }
          )
          return Result.ok({ usageMeter })
        } catch (error) {
          errorHandlers.usageMeter.handle(error, {
            operation: 'create',
          })
          throw error
        }
      }
    )
  )

const listUsageMetersProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(usageMeterPaginatedSelectSchema)
  .output(usageMeterPaginatedListSchema)
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        return selectUsageMetersPaginated(input, transaction)
      }
    )
  )

const updateUsageMeter = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editUsageMeterSchema)
  .output(z.object({ usageMeter: usageMetersClientSelectSchema }))
  .mutation(
    authenticatedProcedureComprehensiveTransaction(
      async ({ input, transactionCtx }) => {
        const { invalidateCache } = transactionCtx
        try {
          const usageMeter = await updateUsageMeterDB(
            {
              ...input.usageMeter,
              id: input.id,
            },
            transactionCtx
          )

          // Invalidate cache for this specific meter's content change
          // (not pricingModelUsageMeters since set membership hasn't changed)
          invalidateCache(CacheDependency.usageMeter(input.id))

          return Result.ok({ usageMeter })
        } catch (error) {
          errorHandlers.usageMeter.handle(error, {
            operation: 'update',
            id: input.id,
          })
          throw error
        }
      }
    )
  )

const getUsageMeter = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(z.object({ usageMeter: usageMetersClientSelectSchema }))
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        const usageMeter = (
          await selectUsageMeterById(input.id, transaction)
        ).unwrap()
        return { usageMeter }
      }
    )
  )

const getTableRowsProcedure = protectedProcedure
  .input(
    createPaginatedTableRowInputSchema(
      z.object({
        pricingModelId: z.string().optional(),
      })
    )
  )
  .output(
    createPaginatedTableRowOutputSchema(usageMetersTableRowDataSchema)
  )
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        return selectUsageMetersCursorPaginated({
          input,
          transaction,
        })
      }
    )
  )

export const usageMetersRouter = router({
  get: getUsageMeter,
  create: createUsageMeter,
  update: updateUsageMeter,
  list: listUsageMetersProcedure,
  getTableRows: getTableRowsProcedure,
})
