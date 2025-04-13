import { z } from 'zod'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { selectPurchasesTableRowData } from '@/db/tableMethods/purchaseMethods'
import { purchasesTableRowDataSchema } from '@/db/schema/purchases'
import { protectedProcedure, router } from '@/server/trpc'
import { createPurchase } from '@/server/mutations/createPurchase'
import { editPurchase } from '@/server/mutations/editPurchase'
import { setCheckoutSessionCookie } from '@/server/mutations/setCheckoutSessionCookie'
import { editCheckoutSession } from '@/server/mutations/editCheckoutSession'
import { confirmCheckoutSession } from '@/server/mutations/confirmCheckoutSession'
import { requestPurchaseAccessSession } from '@/server/mutations/requestPurchaseAccessSession'
import { PurchaseStatus } from '@/types'
import { createPaginatedTableRowOutputSchema } from '@/db/tableUtils'

const getTableRows = protectedProcedure
  .input(
    z.object({
      cursor: z.string().optional(),
      limit: z.number().min(1).max(100).optional(),
      filters: z
        .object({
          status: z.nativeEnum(PurchaseStatus).optional(),
          customerId: z.string().optional(),
          organizationId: z.string().optional(),
        })
        .optional(),
    })
  )
  .output(
    createPaginatedTableRowOutputSchema(purchasesTableRowDataSchema)
  )
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        const { cursor, limit = 10, filters = {} } = input

        // Get the user's organization if not provided in filters
        if (!filters.organizationId && ctx.organizationId) {
          filters.organizationId = ctx.organizationId
        }

        // Use the selectPurchasesTableRowData function
        const purchaseRows = await selectPurchasesTableRowData(
          filters.organizationId || '',
          {
            customerId: filters.customerId,
            status: filters.status,
          },
          transaction
        )

        // Apply pagination
        const startIndex = cursor ? parseInt(cursor, 10) : 0
        const endIndex = startIndex + limit
        const paginatedRows = purchaseRows.slice(startIndex, endIndex)
        const hasMore = endIndex < purchaseRows.length

        return {
          data: paginatedRows,
          currentCursor: cursor || '0',
          nextCursor: hasMore ? endIndex.toString() : undefined,
          hasMore,
          total: purchaseRows.length,
        }
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

export const purchasesRouter = router({
  create: createPurchase,
  update: editPurchase,
  // Purchase session management
  createSession: setCheckoutSessionCookie,
  updateSession: editCheckoutSession,
  confirmSession: confirmCheckoutSession,
  requestAccess: requestPurchaseAccessSession,
  getTableRows,
})
