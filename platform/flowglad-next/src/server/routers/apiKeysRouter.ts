import { protectedProcedure, router } from '../trpc'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
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
import { TRPCError } from '@trpc/server'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'apiKey',
  tags: ['API Keys'],
})

export const apiKeysRouteConfigs = [...routeConfigs]

const listApiKeysProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(
    createPaginatedTableRowInputSchema(
      z.object({
        type: z.nativeEnum(FlowgladApiKeyType).optional(),
      })
    )
  )
  .output(
    createPaginatedTableRowOutputSchema(apiKeysClientSelectSchema)
  )
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        const { cursor, limit = 10 } = input

        // Get the user's organization
        const organizationId = ctx.organizationId
        if (!organizationId) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'You are not authorized to access this resource',
          })
        }

        // Use the existing selectApiKeysTableRowData function
        const apiKeyRows = await selectApiKeys(
          { organizationId },
          transaction
        )

        // Apply pagination
        const startIndex = cursor ? parseInt(cursor, 10) : 0
        const endIndex = startIndex + limit
        const paginatedRows = apiKeyRows.slice(startIndex, endIndex)
        const hasMore = endIndex < apiKeyRows.length

        return {
          data: paginatedRows,
          currentCursor: cursor || '0',
          nextCursor: hasMore ? endIndex.toString() : undefined,
          hasMore,
          total: apiKeyRows.length,
        }
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

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
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        const { cursor, limit = 10, filters = {} } = input

        // Use the existing selectApiKeysTableRowData function
        const apiKeyRows = await selectApiKeysTableRowData(
          ctx.organizationId || '',
          transaction
        )

        // Apply filters
        let filteredRows = apiKeyRows
        if (filters.type) {
          filteredRows = filteredRows.filter(
            (row) => row.apiKey.type === filters.type
          )
        }

        // Apply pagination
        const startIndex = cursor ? parseInt(cursor, 10) : 0
        const endIndex = startIndex + limit
        const paginatedRows = filteredRows.slice(startIndex, endIndex)
        const hasMore = endIndex < filteredRows.length

        return {
          data: paginatedRows,
          currentCursor: cursor || '0',
          nextCursor: hasMore ? endIndex.toString() : undefined,
          hasMore,
          total: filteredRows.length,
        }
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

export const createApiKey = protectedProcedure
  .input(createApiKeyInputSchema)
  .mutation(async ({ input }) => {
    const result = await authenticatedTransaction(
      async ({ transaction, userId, livemode }) => {
        return createSecretApiKeyTransaction(input, {
          transaction,
          userId,
          livemode,
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
