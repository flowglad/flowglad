import { router, usageProcedure } from '../trpc'
import {
  editUsageMeterSchema,
  usageMeterPaginatedListSchema,
  usageMeterPaginatedSelectSchema,
  createUsageMeterSchema,
  usageMetersTableRowDataSchema,
} from '@/db/schema/usageMeters'
import {
  selectUsageMeterById,
  updateUsageMeter,
  selectUsageMetersPaginated,
  selectUsageMeterTableRows,
} from '@/db/tableMethods/usageMeterMethods'
import { generateOpenApiMetas, trpcToRest } from '@/utils/openapi'
import { usageMetersClientSelectSchema } from '@/db/schema/usageMeters'

import { authenticatedTransaction } from '@/db/databaseMethods'
import { insertUsageMeter } from '@/db/tableMethods/usageMeterMethods'
import {
  idInputSchema,
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
} from '@/db/tableUtils'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { z } from 'zod'
import { FeatureFlag } from '@/types'
import { hasFeatureFlag } from '@/utils/organizationHelpers'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'usageMeter',
  tags: ['UsageMeters'],
})

export const usageMetersRouteConfigs = routeConfigs

export const createUsageMeter = usageProcedure
  .meta(openApiMetas.POST)
  .input(createUsageMeterSchema)
  .output(z.object({ usageMeter: usageMetersClientSelectSchema }))
  .mutation(async ({ input, ctx }) => {
    const usageMeter = await authenticatedTransaction(
      async ({ transaction, userId, livemode }) => {
        const [{ organization }] =
          await selectMembershipAndOrganizations(
            {
              userId,
              focused: true,
            },
            transaction
          )
        if (!hasFeatureFlag(organization, FeatureFlag.Usage)) {
          throw new Error(
            `Organization ${organization.id} does not have feature flag ${FeatureFlag.Usage} enabled`
          )
        }
        return insertUsageMeter(
          {
            ...input.usageMeter,
            organizationId: organization.id,
            livemode,
          },
          transaction
        )
      }
    )
    return { usageMeter }
  })

const listUsageMetersProcedure = usageProcedure
  .meta(openApiMetas.LIST)
  .input(usageMeterPaginatedSelectSchema)
  .output(usageMeterPaginatedListSchema)
  .query(async ({ ctx, input }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        return selectUsageMetersPaginated(input, transaction)
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

const editUsageMeter = usageProcedure
  .meta(openApiMetas.PUT)
  .input(editUsageMeterSchema)
  .output(z.object({ usageMeter: usageMetersClientSelectSchema }))
  .mutation(async ({ input, ctx }) => {
    const usageMeter = await authenticatedTransaction(
      async ({ transaction }) => {
        const updatedUsageMeter = await updateUsageMeter(
          {
            ...input.usageMeter,
            id: input.id,
          },
          transaction
        )
        return updatedUsageMeter
      },
      {
        apiKey: ctx.apiKey,
      }
    )
    return { usageMeter }
  })

const getUsageMeter = usageProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(z.object({ usageMeter: usageMetersClientSelectSchema }))
  .query(async ({ input, ctx }) => {
    const usageMeter = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectUsageMeterById(input.id, transaction)
      },
      { apiKey: ctx.apiKey }
    )
    return { usageMeter }
  })

const getTableRowsProcedure = usageProcedure
  .input(
    createPaginatedTableRowInputSchema(
      z.object({
        catalogId: z.string().optional(),
      })
    )
  )
  .output(
    createPaginatedTableRowOutputSchema(usageMetersTableRowDataSchema)
  )
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        const { cursor, limit = 10, filters = {} } = input

        // Use the existing selectUsageMeterTableRows function
        const usageMeterRows = await selectUsageMeterTableRows(
          filters,
          transaction
        )

        // Apply pagination
        const startIndex = cursor ? parseInt(cursor, 10) : 0
        const endIndex = startIndex + limit
        const paginatedRows = usageMeterRows.slice(
          startIndex,
          endIndex
        )
        const hasMore = endIndex < usageMeterRows.length

        return {
          data: paginatedRows,
          currentCursor: cursor || '0',
          nextCursor: hasMore ? endIndex.toString() : undefined,
          hasMore,
          total: usageMeterRows.length,
        }
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

export const usageMetersRouter = router({
  get: getUsageMeter,
  create: createUsageMeter,
  update: editUsageMeter,
  list: listUsageMetersProcedure,
  getTableRows: getTableRowsProcedure,
})
