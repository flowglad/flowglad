import {
  bulkInsertUsageEventsSchema,
  usageEventPaginatedListSchema,
  usageEventPaginatedSelectSchema,
  usageEventsClientSelectSchema,
  usageEventsPaginatedTableRowInputSchema,
  usageEventsPaginatedTableRowOutputSchema,
} from '@db-core/schema/usageEvents'

import { idInputSchema } from '@db-core/tableUtils'
import { Result } from 'better-result'
import { z } from 'zod'
import {
  authenticatedProcedureComprehensiveTransaction,
  authenticatedProcedureTransaction,
  authenticatedTransaction,
} from '@/db/authenticatedTransaction'
import {
  selectUsageEventById,
  selectUsageEventsPaginated,
  selectUsageEventsTableRowData,
} from '@/db/tableMethods/usageEventMethods'
import { protectedProcedure } from '@/server/trpc'
import {
  generateOpenApiMetas,
  type RouteConfig,
} from '@/utils/openapi'
import { unwrapOrThrow } from '@/utils/resultHelpers'
import { bulkInsertUsageEventsTransaction } from '@/utils/usage/bulkInsertUsageEventsTransaction'
import {
  createUsageEventWithSlugSchema,
  ingestAndProcessUsageEvent,
  resolveUsageEventInput,
} from '@/utils/usage/usageEventHelpers'
import { router } from '../trpc'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'usageEvent',
  tags: ['Usage Events'],
})

export const usageEventsRouteConfigs = routeConfigs

export const usageEventsBulkRouteConfig: Record<string, RouteConfig> =
  {
    'POST /usage-events/bulk': {
      procedure: 'usageEvents.bulkInsert',
      pattern: /^usage-events\/bulk$/,
      mapParams: (_, body) => body,
    },
  }

export const createUsageEvent = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createUsageEventWithSlugSchema)
  .output(z.object({ usageEvent: usageEventsClientSelectSchema }))
  .mutation(
    authenticatedProcedureComprehensiveTransaction(
      async ({ input, ctx, transactionCtx }) => {
        const {
          transaction,
          cacheRecomputationContext,
          emitEvent,
          invalidateCache,
          enqueueLedgerCommand,
          enqueueTriggerTask,
        } = transactionCtx
        const resolvedInputResult = await resolveUsageEventInput(
          input,
          transaction
        )

        // Unwrap at router boundary - converts Result errors to thrown errors for TRPC
        const resolvedInput = resolvedInputResult.unwrap()

        // Return Result directly - wrapper handles error conversion
        return ingestAndProcessUsageEvent(
          { input: resolvedInput, livemode: ctx.livemode },
          {
            transaction,
            cacheRecomputationContext,
            emitEvent,
            invalidateCache,
            enqueueLedgerCommand,
            enqueueTriggerTask,
          }
        )
      }
    )
  )

export const getUsageEvent = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(z.object({ usageEvent: usageEventsClientSelectSchema }))
  .query(async ({ input, ctx }) => {
    const usageEvent = unwrapOrThrow(
      await authenticatedTransaction(
        async ({ transaction }) => {
          return Result.ok(
            (
              await selectUsageEventById(input.id, transaction)
            ).unwrap()
          )
        },
        { apiKey: ctx.apiKey }
      )
    )
    return { usageEvent }
  })

export const bulkInsertUsageEventsProcedure = protectedProcedure
  .meta({
    openapi: {
      method: 'POST',
      path: '/api/v1/usage-events/bulk',
      summary: 'Bulk Insert Usage Events',
      description:
        'Create multiple usage events in a single request. Supports priceId, priceSlug, usageMeterId, or usageMeterSlug for each event. Exactly one identifier type must be provided per event.',
      tags: ['Usage Events'],
    },
  })
  .input(bulkInsertUsageEventsSchema)
  .output(
    z.object({ usageEvents: z.array(usageEventsClientSelectSchema) })
  )
  .mutation(
    authenticatedProcedureComprehensiveTransaction(
      async ({ input, ctx, transactionCtx }) => {
        return bulkInsertUsageEventsTransaction(
          {
            input,
            livemode: ctx.livemode,
          },
          transactionCtx
        )
      }
    )
  )

// List usage events with pagination
const listUsageEventsProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(usageEventPaginatedSelectSchema)
  .output(usageEventPaginatedListSchema)
  .query(async ({ input, ctx }) => {
    return (
      await authenticatedTransaction(
        async ({ transaction }) => {
          const result = await selectUsageEventsPaginated(
            input,
            transaction
          )
          return Result.ok({
            data: result.data,
            total: result.total,
            hasMore: result.hasMore,
            currentCursor: result.currentCursor,
            nextCursor: result.nextCursor,
          })
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    ).unwrap()
  })

// Get table rows for usage events with joins
const getTableRowsProcedure = protectedProcedure
  .input(usageEventsPaginatedTableRowInputSchema)
  .output(usageEventsPaginatedTableRowOutputSchema)
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        return selectUsageEventsTableRowData({ input, transaction })
      }
    )
  )

export const usageEventsRouter = router({
  get: getUsageEvent,
  create: createUsageEvent,
  bulkInsert: bulkInsertUsageEventsProcedure,
  list: listUsageEventsProcedure,
  getTableRows: getTableRowsProcedure,
})
