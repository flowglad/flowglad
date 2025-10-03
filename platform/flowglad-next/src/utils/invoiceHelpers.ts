import { insertInvoiceLineItem } from '@/db/tableMethods/invoiceLineItemMethods'
import {
  EditInvoiceInput,
  InvoiceLineItem,
  invoiceLineItemsUpdateSchema,
} from '@/db/schema/invoiceLineItems'
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
import { deleteIncompleteCheckoutSessionsForInvoice } from '@/db/tableMethods/checkoutSessionMethods'
import { SubscriptionItemType } from '@/types'

/**
 * This function updates an invoice and its line items.
 * If the invoice is in a terminal state, it throws an error.
 *
 * If the invoice has line items in the database but they
 * are not present in the input, they are deleted.
 *
 * If the invoice has line items in the input that don't
 * exist in the database, they are created.
 *
 * If the input provides line items that do not have an id,
 * those are created and attached to the invoice.
 *
 * It also deletes any incomplete purchase sessions for the invoice,
 * even if the update doesn't have any billing impacts.
 *
 * @param params
 * @param livemode
 * @param transaction
 * @returns
 */
export const updateInvoiceTransaction = async (
  { invoice, invoiceLineItems, id }: EditInvoiceInput,
  livemode: boolean,
  transaction: DbTransaction
) => {
  const existingInvoice = await selectInvoiceById(id, transaction)
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
      invoiceId: updatedInvoice.id,
    },
    transaction
  )
  const providedInvoiceLineItemsById = new Map(
    invoiceLineItems
      .filter((item) => 'id' in item)
      .map((invoiceLineItem) => [invoiceLineItem.id, invoiceLineItem])
  )
  const lineItemsToDelete = existingInvoiceLineItems.filter(
    (invoiceLineItem) =>
      !providedInvoiceLineItemsById.has(invoiceLineItem.id)
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
        if (invoiceLineItem.type === SubscriptionItemType.Usage) {
          throw new Error(
            'Usage invoice line items are not supported'
          )
        }
        const update =
          invoiceLineItemsUpdateSchema.parse(invoiceLineItem)
        return updateInvoiceLineItem(update, transaction)
      } else {
        if (invoiceLineItem.type === SubscriptionItemType.Usage) {
          throw new Error(
            'Usage invoice line items are not supported'
          )
        }
        return insertInvoiceLineItem(
          {
            ...invoiceLineItem,
            livemode,
            invoiceId: updatedInvoice.id,
            ledgerAccountCredit: null,
            ledgerAccountId: null,
            billingRunId: null,
          } as InvoiceLineItem.Insert,
          transaction
        )
      }
    })
  )
  const updatedInvoiceLineItems = await selectInvoiceLineItems(
    {
      invoiceId: updatedInvoice.id,
    },
    transaction
  )

  /**
   * Eagerly delete any incomplete purchase sessions for the invoice,
   * even if the update doesn't have any billing impacts.
   * It's too hard to determine whether the update has billing impacts,
   * and it's better to err on the side of caution.
   */
  await deleteIncompleteCheckoutSessionsForInvoice(
    updatedInvoice.id,
    transaction
  )

  return {
    invoice: updatedInvoice,
    /**
     * Sort the invoice line items by createdAt
     * ascending to consistent ordering of the line items
     */
    invoiceLineItems: updatedInvoiceLineItems
      .slice()
      .sort((a, b) =>
        a.createdAt < b.createdAt
          ? -1
          : a.createdAt > b.createdAt
            ? 1
            : 0
      ),
  }
}
