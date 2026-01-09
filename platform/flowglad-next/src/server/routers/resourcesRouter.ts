import { z } from 'zod'
import {
  authenticatedProcedureTransaction,
  authenticatedTransaction,
} from '@/db/authenticatedTransaction'
import {
  createResourceSchema,
  editResourceSchema,
  resourcesClientSelectSchema,
} from '@/db/schema/resources'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import {
  insertResource,
  resourcesTableRowOutputSchema,
  selectResourceById,
  selectResources,
  selectResourcesPaginated,
  selectResourcesTableRowData,
  updateResource,
} from '@/db/tableMethods/resourceMethods'
import {
  createPaginatedListQuerySchema,
  createPaginatedSelectSchema,
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
  idInputSchema,
} from '@/db/tableUtils'
import { devOnlyProcedure, router } from '@/server/trpc'

const resourcesPaginatedSelectSchema = createPaginatedSelectSchema(
  resourcesClientSelectSchema
)
const resourcesPaginatedListSchema = createPaginatedListQuerySchema(
  resourcesClientSelectSchema
)

const listProcedure = devOnlyProcedure
  .input(z.object({ pricingModelId: z.string() }))
  .output(
    z.object({
      resources: z.array(resourcesClientSelectSchema),
    })
  )
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transaction }) => {
        const resources = await selectResources(
          {
            pricingModelId: input.pricingModelId,
          },
          transaction
        )
        return { resources }
      }
    )
  )

const getProcedure = devOnlyProcedure
  .input(idInputSchema)
  .output(z.object({ resource: resourcesClientSelectSchema }))
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transaction }) => {
        const resource = await selectResourceById(
          input.id,
          transaction
        )
        return { resource }
      }
    )
  )

const createProcedure = devOnlyProcedure
  .input(createResourceSchema)
  .output(z.object({ resource: resourcesClientSelectSchema }))
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
        const resource = await insertResource(
          {
            ...input.resource,
            organizationId: organization.id,
            livemode,
          },
          transaction
        )
        return { resource }
      }
    )
  )

const updateProcedure = devOnlyProcedure
  .input(editResourceSchema)
  .output(z.object({ resource: resourcesClientSelectSchema }))
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction }) => {
        const resource = await updateResource(
          {
            ...input.resource,
            id: input.id,
          },
          transaction
        )
        return { resource }
      }
    )
  )

const listPaginatedProcedure = devOnlyProcedure
  .input(resourcesPaginatedSelectSchema)
  .output(resourcesPaginatedListSchema)
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        return selectResourcesPaginated(input, transaction)
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

const getTableRowsProcedure = devOnlyProcedure
  .input(
    createPaginatedTableRowInputSchema(
      z.object({
        pricingModelId: z.string().optional(),
        active: z.boolean().optional(),
      })
    )
  )
  .output(
    createPaginatedTableRowOutputSchema(resourcesTableRowOutputSchema)
  )
  .query(
    authenticatedProcedureTransaction(selectResourcesTableRowData)
  )

export const resourcesRouter = router({
  get: getProcedure,
  create: createProcedure,
  update: updateProcedure,
  list: listProcedure,
  listPaginated: listPaginatedProcedure,
  getTableRows: getTableRowsProcedure,
})
