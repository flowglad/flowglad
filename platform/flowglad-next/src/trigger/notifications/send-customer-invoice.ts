import { logger, task } from '@trigger.dev/sdk'

// FIXME: Either implement this or remove it
export const sendCustomerInvoice = task({
  id: 'send-customer-invoice',
  run: async (
    {
      customerEmail,
      invoiceNumber,
    }: { customerEmail: string; invoiceNumber: string },
    { ctx }
  ) => {},
})
