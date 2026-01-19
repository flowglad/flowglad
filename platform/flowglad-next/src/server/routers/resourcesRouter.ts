import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
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
import { protectedProcedure, router } from '@/server/trpc'
import { generateOpenApiMetas, trpcToRest } from '@/utils/openapi'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'resource',
  tags: ['Resources'],
})

export const resourcesRouteConfigs = routeConfigs

const resourcesPaginatedSelectSchema = createPaginatedSelectSchema(
  resourcesClientSelectSchema
)
const resourcesPaginatedListSchema = createPaginatedListQuerySchema(
  resourcesClientSelectSchema
)

const listProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(z.object({ pricingModelId: z.string() }))
  .output(
    z.object({
      resources: z.array(resourcesClientSelectSchema),
    })
  )
  .query(async ({ input, ctx }) => {
    const result = (
      await authenticatedTransaction(
        async ({ transaction }) => {
          const resources = await selectResources(
            {
              pricingModelId: input.pricingModelId,
            },
            transaction
          )
          return { resources }
        },
        { apiKey: ctx.apiKey }
      )
    ).unwrap()
    return result
  })

const getProcedure = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(z.object({ resource: resourcesClientSelectSchema }))
  .query(async ({ input, ctx }) => {
    const result = (
      await authenticatedTransaction(
        async ({ transaction }) => {
          const resource = await selectResourceById(
            input.id,
            transaction
          )
          return { resource }
        },
        { apiKey: ctx.apiKey }
      )
    ).unwrap()
    return result
  })

const createProcedure = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createResourceSchema)
  .output(z.object({ resource: resourcesClientSelectSchema }))
  .mutation(async ({ input, ctx }) => {
    const { livemode } = ctx
    const userId = ctx.user?.id
    if (!userId) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'User authentication required',
      })
    }
    const result = (
      await authenticatedTransaction(
        async ({ transaction }) => {
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
        },
        { apiKey: ctx.apiKey }
      )
    ).unwrap()
    return result
  })

const updateProcedure = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editResourceSchema)
  .output(z.object({ resource: resourcesClientSelectSchema }))
  .mutation(async ({ input, ctx }) => {
    const result = (
      await authenticatedTransaction(
        async ({ transaction }) => {
          const resource = await updateResource(
            {
              ...input.resource,
              id: input.id,
            },
            transaction
          )
          return { resource }
        },
        { apiKey: ctx.apiKey }
      )
    ).unwrap()
    return result
  })

const listPaginatedProcedure = protectedProcedure
  .input(resourcesPaginatedSelectSchema)
  .output(resourcesPaginatedListSchema)
  .query(async ({ input, ctx }) => {
    const result = (
      await authenticatedTransaction(
        async ({ transaction }) => {
          return selectResourcesPaginated(input, transaction)
        },
        { apiKey: ctx.apiKey }
      )
    ).unwrap()
    return result
  })

const getTableRowsProcedure = protectedProcedure
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
  .query(async ({ input, ctx }) => {
    const result = (
      await authenticatedTransaction(
        async ({ transaction }) => {
          return selectResourcesTableRowData({ input, transaction })
        },
        { apiKey: ctx.apiKey }
      )
    ).unwrap()
    return result
  })

export const resourcesRouter = router({
  get: getProcedure,
  create: createProcedure,
  update: updateProcedure,
  list: listProcedure,
  listPaginated: listPaginatedProcedure,
  getTableRows: getTableRowsProcedure,
})
