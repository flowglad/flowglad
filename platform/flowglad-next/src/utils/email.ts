import {
  CreateEmailOptions,
  CreateEmailRequestOptions,
  Resend,
} from 'resend'
import core from './core'
import { Invoice } from '@/db/schema/invoices'
import { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import { OrderReceiptEmail } from '@/email-templates/customer-order-receipt'
import { InvoiceReminderEmail } from '@/email-templates/invoice-reminder'
import { InvoiceNotificationEmail } from '@/email-templates/invoice-notification'
import {
  OrganizationPaymentNotificationEmail,
  OrganizationPaymentNotificationEmailProps,
} from '@/email-templates/organization/organization-payment-succeeded'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from './stripe'
import { CurrencyCode } from '@/types'
import SendPurchaseAccessSessionTokenEmail from '@/email-templates/send-purchase-access-session-token'
import { PaymentFailedEmail } from '@/email-templates/customer-payment-failed'
import { OrganizationPaymentConfirmationEmail } from '@/email-templates/organization/organization-payment-awaiting-confirmation'
import { kebabCase } from 'change-case'

const resend = () => new Resend(core.envVariable('RESEND_API_KEY'))

export const safeSend = (
  email: CreateEmailOptions,
  options?: CreateEmailRequestOptions
) => {
  if (core.IS_TEST) {
    return
  }
  return resend().emails.send(
    {
      ...email,
    },
    options
  )
}

const safeTo = (email: string) =>
  core.IS_PROD ? email : 'agree.ahmed@flowglad.com'

export const sendReceiptEmail = async (params: {
  to: string[]
  invoice: Invoice.Record
  invoiceLineItems: InvoiceLineItem.Record[]
  organizationName: string
  organizationLogoUrl?: string
}) => {
  const { invoice } = params
  const attachments: {
    filename: string
    path: string
  }[] = []
  if (invoice.pdfURL) {
    attachments.push({
      filename: `${invoice.invoiceNumber}.pdf`,
      path: invoice.pdfURL,
    })
  }
  if (invoice.receiptPdfURL) {
    attachments.push({
      filename: `${invoice.invoiceNumber}-receipt.pdf`,
      path: invoice.receiptPdfURL,
    })
  }
  return safeSend({
    from: `${params.organizationName} Billing <${kebabCase(params.organizationName)}-notifications@flowglad.com>`,
    bcc: [core.envVariable('NOTIF_UAT_EMAIL')],
    to: params.to.map(safeTo),
    subject: `${params.organizationName} Order Receipt: #${invoice.invoiceNumber}`,
    attachments,
    react: OrderReceiptEmail({
      invoiceNumber: invoice.invoiceNumber,
      orderDate: core.formatDate(invoice.createdAt!),
      lineItems: params.invoiceLineItems.map((item) => ({
        name: item.description ?? '',
        price: item.price,
        quantity: item.quantity,
      })),
      currency: invoice.currency,
      organizationName: params.organizationName,
      organizationLogoUrl: params.organizationLogoUrl,
    }),
  })
}

export const sendOrganizationPaymentNotificationEmail = async (
  params: OrganizationPaymentNotificationEmailProps & { to: string[] }
) => {
  return safeSend({
    from: `Flowglad <notifications@flowglad.com>`,
    to: params.to.map(safeTo),
    bcc: [core.envVariable('NOTIF_UAT_EMAIL')],
    subject: `You just made ${stripeCurrencyAmountToHumanReadableCurrencyAmount(
      params.currency,
      params.amount
    )} from ${params.organizationName}!`,
    react: OrganizationPaymentNotificationEmail(params),
  })
}

export const sendPurchaseAccessSessionTokenEmail = async (params: {
  to: string[]
  magicLink: string
}) => {
  return safeSend({
    from: 'notifications@flowglad.com',
    to: params.to.map(safeTo),
    bcc: [core.envVariable('NOTIF_UAT_EMAIL')],
    subject: 'Your Order Link',
    react: SendPurchaseAccessSessionTokenEmail(params),
  })
}

export const sendPaymentFailedEmail = async (params: {
  to: string[]
  organizationName: string
  organizationLogoUrl?: string
  invoiceNumber: string
  orderDate: Date
  lineItems: {
    name: string
    price: number
    quantity: number
  }[]
  retryDate?: Date
  currency: CurrencyCode
}) => {
  return safeSend({
    from: 'notifications@flowglad.com',
    to: params.to.map(safeTo),
    bcc: [core.envVariable('NOTIF_UAT_EMAIL')],
    subject: 'Payment Unsuccessful',
    react: PaymentFailedEmail({
      invoiceNumber: params.invoiceNumber,
      orderDate: new Date(params.orderDate),
      organizationName: params.organizationName,
      organizationLogoUrl: params.organizationLogoUrl,
      lineItems: params.lineItems,
      retryDate: params.retryDate,
      currency: params.currency,
    }),
  })
}

export const sendAwaitingPaymentConfirmationEmail = async ({
  to,
  organizationName,
  invoiceNumber,
  amount,
  customerId,
  currency,
}: {
  to: string[]
  organizationName: string
  invoiceNumber: string
  orderDate: Date
  amount: number
  customerId: string
  currency: CurrencyCode
}) => {
  return safeSend({
    from: 'notifications@flowglad.com',
    to: to.map(safeTo),
    subject: 'Awaiting Payment Confirmation',
    react: OrganizationPaymentConfirmationEmail({
      organizationName,
      amount,
      invoiceNumber,
      customerId,
      currency,
    }),
  })
}

export const sendInvoiceReminderEmail = async ({
  to,
  cc,
  invoice,
  invoiceLineItems,
  organizationName,
  organizationLogoUrl,
}: {
  to: string[]
  cc?: string[]
  invoice: Invoice.Record
  invoiceLineItems: InvoiceLineItem.Record[]
  organizationName: string
  organizationLogoUrl?: string
}) => {
  return safeSend({
    from: 'notifs@flowglad.com',
    to: to.map(safeTo),
    cc: cc?.map(safeTo),
    subject: `${organizationName} Invoice Reminder: #${invoice.invoiceNumber}`,
    react: InvoiceReminderEmail({
      invoice,
      invoiceLineItems,
      organizationName,
      organizationLogoUrl,
    }),
  })
}

export const sendInvoiceNotificationEmail = async ({
  to,
  cc,
  invoice,
  invoiceLineItems,
  organizationName,
  organizationLogoUrl,
}: {
  to: string[]
  cc?: string[]
  invoice: Invoice.Record
  invoiceLineItems: InvoiceLineItem.Record[]
  organizationName: string
  organizationLogoUrl?: string
}) => {
  return safeSend({
    from: 'notifs@flowglad.com',
    to: to.map(safeTo),
    cc: cc?.map(safeTo),
    subject: `${organizationName} New Invoice: #${invoice.invoiceNumber}`,
    react: InvoiceNotificationEmail({
      invoice,
      invoiceLineItems,
      organizationName,
      organizationLogoUrl,
    }),
  })
}
