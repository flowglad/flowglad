import { logger, task } from '@trigger.dev/sdk/v3'

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
