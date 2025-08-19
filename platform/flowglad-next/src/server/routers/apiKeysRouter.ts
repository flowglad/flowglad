import { protectedProcedure, router } from '../trpc'
import {
  authenticatedProcedureTransaction,
  authenticatedTransaction,
} from '@/db/authenticatedTransaction'
import { apiKeysClientSelectSchema } from '@/db/schema/apiKeys'
import {
  selectApiKeyById,
  selectApiKeys,
  selectApiKeysTableRowData,
} from '@/db/tableMethods/apiKeyMethods'
import {
  createPaginatedTableRowOutputSchema,
  createPaginatedTableRowInputSchema,
  idInputSchema,
} from '@/db/tableUtils'
import { generateOpenApiMetas, trpcToRest } from '@/utils/openapi'
import { z } from 'zod'
import { FlowgladApiKeyType } from '@/types'
import { createApiKeyInputSchema } from '@/db/schema/apiKeys'
import { createSecretApiKeyTransaction } from '@/utils/apiKeyHelpers'
import { rotateApiKeyProcedure } from '../mutations/rotateApiKey'

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

export const apiKeysRouter = router({
  // list: listApiKeysProcedure,
  get: getApiKeyProcedure,
  getTableRows: getTableRowsProcedure,
  rotate: rotateApiKeyProcedure,
  create: createApiKey,
})
