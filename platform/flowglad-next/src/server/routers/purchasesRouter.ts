import { z } from 'zod'
import {
  authenticatedProcedureTransaction,
  authenticatedTransaction,
} from '@/db/authenticatedTransaction'
import {
  purchaseClientSelectSchema,
  purchasesTableRowDataSchema,
} from '@/db/schema/purchases'
import {
  selectPurchaseById,
  selectPurchasesTableRowData,
} from '@/db/tableMethods/purchaseMethods'
import {
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
  idInputSchema,
} from '@/db/tableUtils'
import { protectedProcedure, router } from '@/server/trpc'
import { PurchaseStatus } from '@/types'
import { generateOpenApiMetas } from '@/utils/openapi'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'Purchase',
  tags: ['Purchases'],
})

export const purchasesRouteConfigs = routeConfigs

const getPurchaseProcedure = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(z.object({ purchase: purchaseClientSelectSchema }))
  .query(async ({ ctx, input }) => {
    const purchase = (
      await authenticatedTransaction(
        async ({ transaction }) => {
          return selectPurchaseById(input.id, transaction)
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    ).unwrap()
    return { purchase }
  })

const getTableRows = protectedProcedure
  .input(
    createPaginatedTableRowInputSchema(
      z.object({
        status: z.enum(PurchaseStatus).optional(),
        customerId: z.string().optional(),
        organizationId: z.string().optional(),
      })
    )
  )
  .output(
    createPaginatedTableRowOutputSchema(purchasesTableRowDataSchema)
  )
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        return selectPurchasesTableRowData({ input, transaction })
      }
    )
  )

export const purchasesRouter = router({
  // Get single purchase
  get: getPurchaseProcedure,
  // Table rows for internal UI
  getTableRows,
})
