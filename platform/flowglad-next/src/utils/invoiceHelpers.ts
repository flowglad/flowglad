import { insertInvoiceLineItem } from '@/db/tableMethods/invoiceLineItemMethods'
import { EditInvoiceInput } from '@/db/schema/invoiceLineItems'
import {
  deleteInvoiceLineItems,
  updateInvoiceLineItem,
} from '@/db/tableMethods/invoiceLineItemMethods'
import { selectInvoiceLineItems } from '@/db/tableMethods/invoiceLineItemMethods'
import {
  invoiceIsInTerminalState,
  selectInvoiceById,
  updateInvoice,
} from '@/db/tableMethods/invoiceMethods'
import { DbTransaction } from '@/db/types'
import { deleteIncompletePurchaseSessionsForInvoice } from '@/db/tableMethods/purchaseSessionMethods'

export const updateInvoiceTransaction = async (
  { invoice, invoiceLineItems }: EditInvoiceInput,
  livemode: boolean,
  transaction: DbTransaction
) => {
  const existingInvoice = await selectInvoiceById(
    invoice.id,
    transaction
  )
  if (invoiceIsInTerminalState(existingInvoice)) {
    throw new Error(
      `Invoice ${existingInvoice.id} has status ${existingInvoice.status}, which is terminal. You cannot update invoices that are in a terminal state.`
    )
  }
  const updatedInvoice = await updateInvoice(invoice, transaction)
  if (invoiceIsInTerminalState(updatedInvoice)) {
    throw new Error('Cannot update a paid invoice')
  }
  const existingInvoiceLineItems = await selectInvoiceLineItems(
    {
      InvoiceId: updatedInvoice.id,
    },
    transaction
  )

  const lineItemsToDelete = existingInvoiceLineItems.filter(
    (invoiceLineItem) => !invoiceLineItems.includes(invoiceLineItem)
  )

  await deleteInvoiceLineItems(
    lineItemsToDelete.map((invoiceLineItem) => ({
      id: invoiceLineItem.id,
    })),
    transaction
  )
  await Promise.all(
    invoiceLineItems.map(async (invoiceLineItem) => {
      if ('id' in invoiceLineItem) {
        return updateInvoiceLineItem(invoiceLineItem, transaction)
      } else {
        return insertInvoiceLineItem(
          {
            ...invoiceLineItem,
            livemode,
          },
          transaction
        )
      }
    })
  )
  const updatedInvoiceLineItems = await selectInvoiceLineItems(
    {
      InvoiceId: updatedInvoice.id,
    },
    transaction
  )

  /**
   * Eagerly delete any incomplete purchase sessions for the invoice,
   * even if the update doesn't have any billing impacts.
   * It's too hard to determine whether the update has billing impacts,
   * and it's better to err on the side of caution.
   */
  await deleteIncompletePurchaseSessionsForInvoice(
    updatedInvoice.id,
    transaction
  )

  return {
    invoice: updatedInvoice,
    invoiceLineItems: updatedInvoiceLineItems,
  }
}
