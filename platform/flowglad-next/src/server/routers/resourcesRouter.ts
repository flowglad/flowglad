import { TRPCError } from '@trpc/server'
import { Result } from 'better-result'
import { z } from 'zod'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import {
  createResourceSchema,
  editResourceSchema,
  resourcesClientSelectSchema,
} from '@/db/schema/resources'
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
import { generateOpenApiMetas } from '@/utils/openapi'

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
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const resources = await selectResources(
          {
            pricingModelId: input.pricingModelId,
          },
          transaction
        )
        return Result.ok({ resources })
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

const getProcedure = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(z.object({ resource: resourcesClientSelectSchema }))
  .query(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const resource = (
          await selectResourceById(input.id, transaction)
        ).unwrap()
        return Result.ok({ resource })
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

const createProcedure = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createResourceSchema)
  .output(z.object({ resource: resourcesClientSelectSchema }))
  .mutation(async ({ input, ctx }) => {
    const { livemode, organizationId } = ctx
    if (!organizationId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Organization ID is required for this operation.',
      })
    }
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const resource = await insertResource(
          {
            ...input.resource,
            organizationId,
            livemode,
          },
          transaction
        )
        return Result.ok({ resource })
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

const updateProcedure = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editResourceSchema)
  .output(z.object({ resource: resourcesClientSelectSchema }))
  .mutation(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const resource = await updateResource(
          {
            ...input.resource,
            id: input.id,
          },
          transaction
        )
        return Result.ok({ resource })
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

const listPaginatedProcedure = protectedProcedure
  .input(resourcesPaginatedSelectSchema)
  .output(resourcesPaginatedListSchema)
  .query(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const data = await selectResourcesPaginated(
          input,
          transaction
        )
        return Result.ok(data)
      },
      {
        apiKey: ctx.apiKey,
      }
    )
    return result.unwrap()
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
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const data = await selectResourcesTableRowData({
          input,
          transaction,
        })
        return Result.ok(data)
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

export const resourcesRouter = router({
  get: getProcedure,
  create: createProcedure,
  update: updateProcedure,
  list: listProcedure,
  listPaginated: listPaginatedProcedure,
  getTableRows: getTableRowsProcedure,
})
