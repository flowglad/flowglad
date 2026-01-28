import { Result } from 'better-result'
import { z } from 'zod'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import {
  bulkInsertUsageEventsSchema,
  usageEventPaginatedListSchema,
  usageEventPaginatedSelectSchema,
  usageEventsClientSelectSchema,
  usageEventsPaginatedTableRowInputSchema,
  usageEventsPaginatedTableRowOutputSchema,
} from '@/db/schema/usageEvents'
import {
  selectUsageEventById,
  selectUsageEventsPaginated,
  selectUsageEventsTableRowData,
} from '@/db/tableMethods/usageEventMethods'
import { idInputSchema } from '@/db/tableUtils'
import { protectedProcedure } from '@/server/trpc'
import {
  generateOpenApiMetas,
  type RouteConfig,
} from '@/utils/openapi'
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
  .mutation(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async (params) => {
        const {
          transaction,
          cacheRecomputationContext,
          emitEvent,
          invalidateCache,
          enqueueLedgerCommand,
        } = params
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
          }
        )
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

export const getUsageEvent = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(z.object({ usageEvent: usageEventsClientSelectSchema }))
  .query(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const usageEvent = (
          await selectUsageEventById(input.id, transaction)
        ).unwrap()
        return Result.ok({ usageEvent })
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
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
  .mutation(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async (params) => {
        return bulkInsertUsageEventsTransaction(
          {
            input,
            livemode: ctx.livemode,
          },
          params
        )
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

// List usage events with pagination
const listUsageEventsProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(usageEventPaginatedSelectSchema)
  .output(usageEventPaginatedListSchema)
  .query(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const paginatedResult = await selectUsageEventsPaginated(
          input,
          transaction
        )
        return Result.ok({
          data: paginatedResult.data,
          total: paginatedResult.total,
          hasMore: paginatedResult.hasMore,
          currentCursor: paginatedResult.currentCursor,
          nextCursor: paginatedResult.nextCursor,
        })
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

// Get table rows for usage events with joins
const getTableRowsProcedure = protectedProcedure
  .input(usageEventsPaginatedTableRowInputSchema)
  .output(usageEventsPaginatedTableRowOutputSchema)
  .query(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const data = await selectUsageEventsTableRowData({
          input,
          transaction,
        })
        return Result.ok(data)
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

export const usageEventsRouter = router({
  get: getUsageEvent,
  create: createUsageEvent,
  bulkInsert: bulkInsertUsageEventsProcedure,
  list: listUsageEventsProcedure,
  getTableRows: getTableRowsProcedure,
})
