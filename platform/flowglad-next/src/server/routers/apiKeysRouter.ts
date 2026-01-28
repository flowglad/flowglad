import { Result } from 'better-result'
import { z } from 'zod'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import {
  apiKeysClientSelectSchema,
  createApiKeyInputSchema,
} from '@/db/schema/apiKeys'
import {
  selectApiKeyById,
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
import { generateOpenApiMetas } from '@/utils/openapi'
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
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const apiKey = (
          await selectApiKeyById(input.id, transaction)
        ).unwrap()
        return Result.ok({ apiKey })
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
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
      })
    )
  )
  .query(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const data = await selectApiKeysTableRowData({
          input,
          transaction,
        })
        return Result.ok(data)
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

export const createApiKey = protectedProcedure
  .input(createApiKeyInputSchema)
  .mutation(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async (params) => {
        const data = await createSecretApiKeyTransaction(
          input,
          params
        )
        return Result.ok(data)
      },
      { apiKey: ctx.apiKey }
    )
    const { apiKey, shownOnlyOnceKey } = result.unwrap()
    return { apiKey, shownOnlyOnceKey }
  })

export const deleteApiKey = protectedProcedure
  .input(idInputSchema)
  .mutation(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async (params) => {
        await deleteSecretApiKeyTransaction(input, params)
        return Result.ok({ success: true })
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

export const apiKeysRouter = router({
  get: getApiKeyProcedure,
  getTableRows: getTableRowsProcedure,
  rotate: rotateApiKeyProcedure,
  create: createApiKey,
  delete: deleteApiKey,
})
