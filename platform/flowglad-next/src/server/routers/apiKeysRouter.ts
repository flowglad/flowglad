import { z } from 'zod'
import {
  authenticatedProcedureTransaction,
  authenticatedTransaction,
} from '@/db/authenticatedTransaction'
import {
  apiKeysClientSelectSchema,
  createApiKeyInputSchema,
} from '@/db/schema/apiKeys'
import {
  selectApiKeyById,
  selectApiKeys,
  selectApiKeysTableRowData,
} from '@/db/tableMethods/apiKeyMethods'
import {
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
  idInputSchema,
} from '@/db/tableUtils'
import { FlowgladApiKeyType } from '@/types'
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
        const apiKey = await selectApiKeyById(input.id, transaction)
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
        type: z.nativeEnum(FlowgladApiKeyType).optional(),
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
      })
    )
  )
  .query(authenticatedProcedureTransaction(selectApiKeysTableRowData))

export const createApiKey = protectedProcedure
  .input(createApiKeyInputSchema)
  .mutation(async ({ input }) => {
    const result = await authenticatedTransaction(
      async ({ transaction, userId, livemode, organizationId }) => {
        return createSecretApiKeyTransaction(input, {
          transaction,
          userId,
          livemode,
          organizationId,
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
      ({ transaction, userId, livemode, organizationId }) =>
        deleteSecretApiKeyTransaction(input, {
          transaction,
          userId,
          livemode,
          organizationId,
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
