import { router, protectedProcedure } from '../trpc'
import {
  editUsageMeterSchema,
  usageMeterPaginatedListSchema,
  usageMeterPaginatedSelectSchema,
  createUsageMeterSchema,
  usageMetersTableRowDataSchema,
} from '@/db/schema/usageMeters'
import {
  selectUsageMeterById,
  updateUsageMeter as updateUsageMeterDB,
  selectUsageMetersPaginated,
  selectUsageMetersCursorPaginated,
} from '@/db/tableMethods/usageMeterMethods'
import { generateOpenApiMetas } from '@/utils/openapi'
import { usageMetersClientSelectSchema } from '@/db/schema/usageMeters'

import { authenticatedProcedureTransaction } from '@/db/authenticatedTransaction'
import { insertUsageMeter } from '@/db/tableMethods/usageMeterMethods'
import {
  idInputSchema,
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
} from '@/db/tableUtils'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { z } from 'zod'
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
    authenticatedProcedureTransaction(
      async ({ input, transaction, userId, livemode }) => {
        try {
          const [{ organization }] =
            await selectMembershipAndOrganizations(
              {
                userId,
                focused: true,
              },
              transaction
            )
          const usageMeter = await insertUsageMeter(
            {
              ...input.usageMeter,
              organizationId: organization.id,
              livemode,
            },
            transaction
          )
          return { usageMeter }
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
