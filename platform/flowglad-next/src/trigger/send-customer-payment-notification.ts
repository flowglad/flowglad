import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectInvoiceLineItemsAndInvoicesByInvoiceWhere } from '@/db/tableMethods/invoiceLineItemMethods'
import { adminTransaction } from '@/db/adminTransaction'
import { selectPaymentById } from '@/db/tableMethods/paymentMethods'
import { sendReceiptEmail } from '@/utils/email'
import { logger, task, wait } from '@trigger.dev/sdk/v3'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'

export const sendCustomerPaymentNotificationTask = task({
  id: 'send-customer-payment-notification',
  run: async (payload: { paymentId: string }, { ctx }) => {
    const { invoice, invoiceLineItems, customer, organization } =
      await adminTransaction(async ({ transaction }) => {
        const payment = await selectPaymentById(
          payload.paymentId,
          transaction
        )
        const [{ invoice, invoiceLineItems }] =
          await selectInvoiceLineItemsAndInvoicesByInvoiceWhere(
            { id: payment.invoiceId },
            transaction
          )
        const customer = await selectCustomerById(
          payment.customerId,
          transaction
        )
        const organization = await selectOrganizationById(
          customer.organizationId,
          transaction
        )
        return {
          payment,
          invoice,
          invoiceLineItems,
          customer,
          organization,
        }
      })

    await sendReceiptEmail({
      invoice,
      invoiceLineItems,
      organizationName: organization.name,
      to: [customer.email],
    })

    return {
      message: 'Hello, world!',
    }
  },
})
