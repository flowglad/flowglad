import { z } from 'zod'
import {
  authenticatedProcedureComprehensiveTransaction,
  authenticatedProcedureTransaction,
} from '@/db/authenticatedTransaction'
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
      async ({
        input,
        transaction,
        userId,
        livemode,
        organizationId,
        invalidateCache,
      }) => {
        try {
          const { usageMeter } = await createUsageMeterTransaction(
            {
              usageMeter: input.usageMeter,
              price: input.price,
            },
            {
              transaction,
              userId,
              livemode,
              organizationId,
              invalidateCache,
            }
          )
          return { result: { usageMeter } }
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
      async ({ input, transaction }) => {
        return selectUsageMetersPaginated(input, transaction)
      }
    )
  )

const updateUsageMeter = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editUsageMeterSchema)
  .output(z.object({ usageMeter: usageMetersClientSelectSchema }))
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction }) => {
        try {
          const usageMeter = await updateUsageMeterDB(
            {
              ...input.usageMeter,
              id: input.id,
            },
            transaction
          )
          return { usageMeter }
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
      async ({ input, transaction }) => {
        const usageMeter = await selectUsageMeterById(
          input.id,
          transaction
        )
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
      selectUsageMetersCursorPaginated
    )
  )

export const usageMetersRouter = router({
  get: getUsageMeter,
  create: createUsageMeter,
  update: updateUsageMeter,
  list: listUsageMetersProcedure,
  getTableRows: getTableRowsProcedure,
})
