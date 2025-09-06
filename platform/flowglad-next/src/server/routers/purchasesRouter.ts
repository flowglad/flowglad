import { z } from 'zod'
import {
  authenticatedProcedureTransaction,
  authenticatedTransaction,
} from '@/db/authenticatedTransaction'
import { selectPurchasesTableRowData } from '@/db/tableMethods/purchaseMethods'
import { purchasesTableRowDataSchema } from '@/db/schema/purchases'
import { protectedProcedure, router } from '@/server/trpc'
import { createPurchase } from '@/server/mutations/createPurchase'
import { setCheckoutSessionCookie } from '@/server/mutations/setCheckoutSessionCookie'
import { editCheckoutSession } from '@/server/mutations/editCheckoutSession'
import { confirmCheckoutSession } from '@/server/mutations/confirmCheckoutSession'
import { requestPurchaseAccessSession } from '@/server/mutations/requestPurchaseAccessSession'
import { PurchaseStatus } from '@/types'
import {
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
} from '@/db/tableUtils'

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
  create: createPurchase,
  // Purchase session management
  createSession: setCheckoutSessionCookie,
  updateSession: editCheckoutSession,
  confirmSession: confirmCheckoutSession,
  requestAccess: requestPurchaseAccessSession,
  getTableRows,
})
