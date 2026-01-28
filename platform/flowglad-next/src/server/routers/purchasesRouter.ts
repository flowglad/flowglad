import { Result } from 'better-result'
import { z } from 'zod'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
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
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const purchase = (
          await selectPurchaseById(input.id, transaction)
        ).unwrap()
        return Result.ok({ purchase })
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
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
  .query(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const data = await selectPurchasesTableRowData({
          input,
          transaction,
        })
        return Result.ok(data)
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

export const purchasesRouter = router({
  // Get single purchase
  get: getPurchaseProcedure,
  // Table rows for internal UI
  getTableRows,
})
