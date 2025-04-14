import { protectedProcedure, router } from '../trpc'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { apiKeyClientSelectSchema } from '@/db/schema/apiKeys'
import {
  selectApiKeyById,
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
    createPaginatedTableRowOutputSchema(apiKeyClientSelectSchema)
  )
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        const { cursor, limit = 10 } = input

        // Get the user's organization
        const organizationId = ctx.organizationId

        // Use the existing selectApiKeysTableRowData function
        const apiKeyRows = await selectApiKeysTableRowData(
          organizationId || '',
          transaction
        )

        // Apply pagination
        const startIndex = cursor ? parseInt(cursor, 10) : 0
        const endIndex = startIndex + limit
        const paginatedRows = apiKeyRows.slice(startIndex, endIndex)
        const hasMore = endIndex < apiKeyRows.length

        return {
          data: paginatedRows.map((row) => ({
            ...row.apiKey,
            type: row.apiKey.type as FlowgladApiKeyType,
          })),
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
  .output(z.object({ apiKey: apiKeyClientSelectSchema }))
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        const apiKey = await selectApiKeyById(input.id, transaction)
        return {
          apiKey: {
            ...apiKey,
            type: apiKey.type as FlowgladApiKeyType,
          },
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
        apiKey: apiKeyClientSelectSchema,
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
          data: paginatedRows.map((row) => ({
            ...row,
            apiKey: {
              ...row.apiKey,
              type: row.apiKey.type as FlowgladApiKeyType,
            },
          })),
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

export const apiKeysRouter = router({
  list: listApiKeysProcedure,
  get: getApiKeyProcedure,
  getTableRows: getTableRowsProcedure,
})
