import { TRPCError } from '@trpc/server'
import { Result } from 'better-result'
import { z } from 'zod'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import {
  createUsageMeterSchema,
  editUsageMeterSchema,
  usageMeterPaginatedListSchema,
  usageMeterPaginatedSelectSchema,
  usageMetersClientSelectSchema,
  usageMetersTableRowDataSchema,
} from '@/db/schema/usageMeters'
import {
  selectUsageMeterById,
  selectUsageMetersCursorPaginated,
  selectUsageMetersPaginated,
  updateUsageMeter as updateUsageMeterDB,
} from '@/db/tableMethods/usageMeterMethods'
import {
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
  idInputSchema,
} from '@/db/tableUtils'
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
  .mutation(async ({ input, ctx }) => {
    const { livemode, organizationId } = ctx
    if (!organizationId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Organization ID is required for this operation.',
      })
    }
    const result = await authenticatedTransaction(
      async (params) => {
        try {
          const { usageMeter } = await createUsageMeterTransaction(
            {
              usageMeter: input.usageMeter,
              price: input.price,
            },
            {
              ...params,
              livemode,
              organizationId,
            }
          )
          return Result.ok({ usageMeter })
        } catch (error) {
          errorHandlers.usageMeter.handle(error, {
            operation: 'create',
          })
          throw error
        }
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

const listUsageMetersProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(usageMeterPaginatedSelectSchema)
  .output(usageMeterPaginatedListSchema)
  .query(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const data = await selectUsageMetersPaginated(
          input,
          transaction
        )
        return Result.ok(data)
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

const updateUsageMeter = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editUsageMeterSchema)
  .output(z.object({ usageMeter: usageMetersClientSelectSchema }))
  .mutation(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async (params) => {
        const { invalidateCache } = params
        try {
          const usageMeter = await updateUsageMeterDB(
            {
              ...input.usageMeter,
              id: input.id,
            },
            params
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
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

const getUsageMeter = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(z.object({ usageMeter: usageMetersClientSelectSchema }))
  .query(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const usageMeter = (
          await selectUsageMeterById(input.id, transaction)
        ).unwrap()
        return Result.ok({ usageMeter })
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

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
  .query(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const data = await selectUsageMetersCursorPaginated({
          input,
          transaction,
        })
        return Result.ok(data)
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

export const usageMetersRouter = router({
  get: getUsageMeter,
  create: createUsageMeter,
  update: updateUsageMeter,
  list: listUsageMetersProcedure,
  getTableRows: getTableRowsProcedure,
})
