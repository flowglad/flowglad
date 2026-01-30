import { FlowgladApiKeyType } from '@db-core/enums'
import {
  apiKeysClientSelectSchema,
  createApiKeyInputSchema,
} from '@db-core/schema/apiKeys'
import {
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
  idInputSchema,
} from '@db-core/tableUtils'
import { z } from 'zod'
import {
  authenticatedProcedureTransaction,
  authenticatedTransaction,
} from '@/db/authenticatedTransaction'
import {
  selectApiKeyById,
  selectApiKeys,
  selectApiKeysTableRowData,
} from '@/db/tableMethods/apiKeyMethods'
import {
  createSecretApiKeyTransaction,
  deleteSecretApiKeyTransaction,
} from '@/utils/apiKeyHelpers'
import { generateOpenApiMetas, trpcToRest } from '@/utils/openapi'
import { rotateApiKeyProcedure } from '../mutations/rotateApiKey'
import { protectedProcedure, router } from '../trpc'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'apiKey',
  tags: ['API Keys'],
})

export const apiKeysRouteConfigs = [...routeConfigs]

const getApiKeyProcedure = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(z.object({ apiKey: apiKeysClientSelectSchema }))
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        const apiKey = (
          await selectApiKeyById(input.id, transaction)
        ).unwrap()
        return {
          apiKey,
        }
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

const getTableRowsProcedure = protectedProcedure
  .input(
    createPaginatedTableRowInputSchema(
      z.object({
        type: z.enum(FlowgladApiKeyType).optional(),
      })
    )
  )
  .output(
    createPaginatedTableRowOutputSchema(
      z.object({
        apiKey: apiKeysClientSelectSchema,
        organization: z.object({
          id: z.string(),
          name: z.string(),
        }),
        pricingModel: z.object({
          id: z.string(),
          name: z.string(),
        }),
      })
    )
  )
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        return selectApiKeysTableRowData({ input, transaction })
      }
    )
  )

export const createApiKey = protectedProcedure
  .input(createApiKeyInputSchema)
  .mutation(async ({ input }) => {
    const result = await authenticatedTransaction(
      async ({
        transaction,
        userId,
        livemode,
        organizationId,
        cacheRecomputationContext,
      }) => {
        return createSecretApiKeyTransaction(input, {
          transaction,
          userId,
          livemode,
          organizationId,
          cacheRecomputationContext,
        })
      }
    )

    return {
      apiKey: result.apiKey,
      shownOnlyOnceKey: result.shownOnlyOnceKey,
    }
  })

export const deleteApiKey = protectedProcedure
  .input(idInputSchema)
  .mutation(async ({ input, ctx }) => {
    await authenticatedTransaction(
      ({
        transaction,
        userId,
        livemode,
        organizationId,
        cacheRecomputationContext,
      }) =>
        deleteSecretApiKeyTransaction(input, {
          transaction,
          userId,
          livemode,
          organizationId,
          cacheRecomputationContext,
        })
    )
    return { success: true }
  })

export const apiKeysRouter = router({
  // list: listApiKeysProcedure,
  get: getApiKeyProcedure,
  getTableRows: getTableRowsProcedure,
  rotate: rotateApiKeyProcedure,
  create: createApiKey,
  delete: deleteApiKey,
})
