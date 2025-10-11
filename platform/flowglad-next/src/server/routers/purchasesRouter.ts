import { z } from 'zod'
import {
  authenticatedProcedureTransaction,
  authenticatedTransaction,
} from '@/db/authenticatedTransaction'
import {
  selectPurchasesTableRowData,
  selectPurchaseById,
} from '@/db/tableMethods/purchaseMethods'
import {
  purchasesTableRowDataSchema,
  purchaseClientSelectSchema,
} from '@/db/schema/purchases'
import { protectedProcedure, router } from '@/server/trpc'
import { createPurchase } from '@/server/mutations/createPurchase'
import { editCheckoutSession } from '@/server/mutations/editCheckoutSession'
import { confirmCheckoutSession } from '@/server/mutations/confirmCheckoutSession'
import { requestPurchaseAccessSession } from '@/server/mutations/requestPurchaseAccessSession'
import { PurchaseStatus } from '@/types'
import {
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
  idInputSchema,
} from '@/db/tableUtils'
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
    const purchase = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectPurchaseById(input.id, transaction)
      },
      {
        apiKey: ctx.apiKey,
      }
    )
    return { purchase }
  })

const getTableRows = protectedProcedure
  .input(
    createPaginatedTableRowInputSchema(
      z.object({
        status: z.nativeEnum(PurchaseStatus).optional(),
        customerId: z.string().optional(),
        organizationId: z.string().optional(),
      })
    )
  )
  .output(
    createPaginatedTableRowOutputSchema(purchasesTableRowDataSchema)
  )
  .query(
    authenticatedProcedureTransaction(selectPurchasesTableRowData)
  )

export const purchasesRouter = router({
  // Get single purchase
  get: getPurchaseProcedure,
  // Create purchase
  create: createPurchase,
  // Purchase session management
  updateSession: editCheckoutSession,
  confirmSession: confirmCheckoutSession,
  requestAccess: requestPurchaseAccessSession,
  // Table rows for internal UI
  getTableRows,
})
