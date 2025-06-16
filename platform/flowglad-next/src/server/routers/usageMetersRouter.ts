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
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction, userId, livemode }) => {
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
        const usageMeter = await insertUsageMeter(
          {
            ...input.usageMeter,
            organizationId: organization.id,
            livemode,
          },
          transaction
        )
        return { usageMeter }
      }
    )
  )

const listUsageMetersProcedure = usageProcedure
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

const editUsageMeter = usageProcedure
  .meta(openApiMetas.PUT)
  .input(editUsageMeterSchema)
  .output(z.object({ usageMeter: usageMetersClientSelectSchema }))
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction }) => {
        const usageMeter = await updateUsageMeter(
          {
            ...input.usageMeter,
            id: input.id,
          },
          transaction
        )
        return { usageMeter }
      }
    )
  )

const getUsageMeter = usageProcedure
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
  .query(
    authenticatedProcedureTransaction(
      selectUsageMetersCursorPaginated
    )
  )

export const usageMetersRouter = router({
  get: getUsageMeter,
  create: createUsageMeter,
  update: editUsageMeter,
  list: listUsageMetersProcedure,
  getTableRows: getTableRowsProcedure,
})
