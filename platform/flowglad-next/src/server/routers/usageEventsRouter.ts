import { Result } from 'better-result'
import { z } from 'zod'
import {
  authenticatedTransaction,
  comprehensiveAuthenticatedTransaction,
} from '@/db/authenticatedTransaction'
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
    const result = (
      await comprehensiveAuthenticatedTransaction(
        async ({
          transaction,
          emitEvent,
          invalidateCache,
          enqueueLedgerCommand,
        }) => {
          const resolvedInput = await resolveUsageEventInput(
            input,
            transaction
          )

          const usageEventResult = await ingestAndProcessUsageEvent(
            { input: resolvedInput, livemode: ctx.livemode },
            {
              transaction,
              emitEvent,
              invalidateCache,
              enqueueLedgerCommand,
            }
          )
          return Result.ok(usageEventResult)
        },
        { apiKey: ctx.apiKey }
      )
    ).unwrap()
    return result
  })

export const getUsageEvent = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(z.object({ usageEvent: usageEventsClientSelectSchema }))
  .query(async ({ input, ctx }) => {
    const usageEvent = (
      await authenticatedTransaction(
        async ({ transaction }) => {
          return selectUsageEventById(input.id, transaction)
        },
        { apiKey: ctx.apiKey }
      )
    ).unwrap()
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
  .mutation(async ({ input, ctx }) => {
    const result = (
      await comprehensiveAuthenticatedTransaction(
        async ({
          transaction,
          emitEvent,
          invalidateCache,
          enqueueLedgerCommand,
        }) => {
          return bulkInsertUsageEventsTransaction(
            {
              input,
              livemode: ctx.livemode,
            },
            {
              transaction,
              emitEvent,
              invalidateCache,
              enqueueLedgerCommand,
            }
          )
        },
        { apiKey: ctx.apiKey }
      )
    ).unwrap()
    return result
  })

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
          return {
            items: result.data,
            total: result.total,
            hasMore: result.hasMore,
            nextCursor: result.nextCursor,
          }
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
  .query(async ({ input, ctx }) => {
    const result = (
      await authenticatedTransaction(
        async ({ transaction }) => {
          return selectUsageEventsTableRowData({ input, transaction })
        },
        { apiKey: ctx.apiKey }
      )
    ).unwrap()
    return result
  })

export const usageEventsRouter = router({
  get: getUsageEvent,
  create: createUsageEvent,
  bulkInsert: bulkInsertUsageEventsProcedure,
  list: listUsageEventsProcedure,
  getTableRows: getTableRowsProcedure,
})
