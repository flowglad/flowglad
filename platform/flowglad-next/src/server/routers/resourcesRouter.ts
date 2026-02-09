import {
  createResourceSchema,
  editResourceSchema,
  resourcesClientSelectSchema,
} from '@db-core/schema/resources'

import {
  createPaginatedListQuerySchema,
  createPaginatedSelectSchema,
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
  idInputSchema,
} from '@db-core/tableUtils'
import { TRPCError } from '@trpc/server'
import { Result } from 'better-result'
import { z } from 'zod'
import {
  authenticatedProcedureTransaction,
  authenticatedTransaction,
} from '@/db/authenticatedTransaction'
import {
  insertResource,
  resourcesTableRowOutputSchema,
  selectResourceById,
  selectResources,
  selectResourcesPaginated,
  selectResourcesTableRowData,
  updateResource,
} from '@/db/tableMethods/resourceMethods'
import { protectedProcedure, router } from '@/server/trpc'
import { generateOpenApiMetas, trpcToRest } from '@/utils/openapi'
import { unwrapOrThrow } from '@/utils/resultHelpers'

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
  .input(z.object({}))
  .output(
    z.object({
      resources: z.array(resourcesClientSelectSchema),
    })
  )
  .query(
    authenticatedProcedureTransaction(
      async ({ ctx, transactionCtx }) => {
        const { transaction } = transactionCtx
        const pricingModelId = ctx.isApi
          ? ctx.apiKeyPricingModelId
          : ctx.focusedPricingModelId
        if (!pricingModelId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Unable to determine pricing model scope. Ensure your API key is associated with a pricing model.',
          })
        }
        const resources = await selectResources(
          {
            pricingModelId,
          },
          transaction
        )
        return { resources }
      }
    )
  )

const getProcedure = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(z.object({ resource: resourcesClientSelectSchema }))
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        const resource = (
          await selectResourceById(input.id, transaction)
        ).unwrap()
        return { resource }
      }
    )
  )

const createProcedure = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createResourceSchema)
  .output(z.object({ resource: resourcesClientSelectSchema }))
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, ctx, transactionCtx }) => {
        const { transaction } = transactionCtx
        const { livemode, organizationId } = ctx
        if (!organizationId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Organization ID is required for this operation.',
          })
        }
        const pricingModelId = ctx.isApi
          ? ctx.apiKeyPricingModelId
          : ctx.focusedPricingModelId
        if (!pricingModelId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Unable to determine pricing model scope. Ensure your API key is associated with a pricing model.',
          })
        }
        const resource = await insertResource(
          {
            ...input.resource,
            organizationId,
            livemode,
            pricingModelId,
          },
          transaction
        )
        return { resource }
      }
    )
  )

const updateProcedure = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editResourceSchema)
  .output(z.object({ resource: resourcesClientSelectSchema }))
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
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

const listPaginatedProcedure = protectedProcedure
  .input(resourcesPaginatedSelectSchema)
  .output(resourcesPaginatedListSchema)
  .query(async ({ input, ctx }) => {
    return (
      await authenticatedTransaction(
        async ({ transaction }) => {
          return Result.ok(
            await selectResourcesPaginated(input, transaction)
          )
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    ).unwrap()
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
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        return selectResourcesTableRowData({ input, transaction })
      }
    )
  )

export const resourcesRouter = router({
  get: getProcedure,
  create: createProcedure,
  update: updateProcedure,
  list: listProcedure,
  listPaginated: listPaginatedProcedure,
  getTableRows: getTableRowsProcedure,
})
