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
} from '@/email-templates/organization-payment-succeeded'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from './stripe'
import { CurrencyCode } from '@/types'
import SendPurchaseAccessSessionTokenEmail from '@/email-templates/send-purchase-access-session-token'
import { DemoOfferEmail } from '@/email-templates/demo-offer-email'
import { PaymentFailedEmail } from '@/email-templates/customer-payment-failed'
import { OrganizationPaymentConfirmationEmail } from '@/email-templates/organization-payment-awaiting-confirmation'

const resend = () => new Resend(core.envVariable('RESEND_API_KEY'))

const safeSend = (
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
  return safeSend({
    from: 'notifs@send.flowglad.com',
    to: params.to.map(safeTo),
    subject: `${params.organizationName} Order Receipt: #${params.invoice.invoiceNumber}`,
    react: OrderReceiptEmail({
      invoiceNumber: params.invoice.invoiceNumber,
      orderDate: core.formatDate(params.invoice.createdAt!),
      lineItems: params.invoiceLineItems.map((item) => ({
        name: item.description ?? '',
        price: item.price,
        quantity: item.quantity,
      })),
      currency: params.invoice.currency,
      organizationName: params.organizationName,
      organizationLogoUrl: params.organizationLogoUrl,
    }),
  })
}

export const sendOrganizationPaymentNotificationEmail = async (
  params: OrganizationPaymentNotificationEmailProps & { to: string[] }
) => {
  return safeSend({
    from: `${params.organizationName} (via Flowglad) <notifications@flowglad.com>`,
    to: params.to.map(safeTo),
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

export const sendAwaitingPaymentConfirmationEmail = async (params: {
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
    to: params.to.map(safeTo),
    subject: 'Awaiting Payment Confirmation',
    react: OrganizationPaymentConfirmationEmail({
      organizationName: params.organizationName,
      amount: params.amount,
      invoiceNumber: params.invoiceNumber,
      customerId: params.customerId,
      currency: params.currency,
    }),
  })
}

export const sendInvoiceReminderEmail = async (params: {
  to: string[]
  cc?: string[]
  invoice: Invoice.Record
  invoiceLineItems: InvoiceLineItem.Record[]
  organizationName: string
  organizationLogoUrl?: string
}) => {
  return safeSend({
    from: 'notifs@flowglad.com',
    to: params.to.map(safeTo),
    cc: params.cc?.map(safeTo),
    subject: `${params.organizationName} Invoice Reminder: #${params.invoice.invoiceNumber}`,
    react: InvoiceReminderEmail({
      invoice: params.invoice,
      invoiceLineItems: params.invoiceLineItems,
      organizationName: params.organizationName,
      organizationLogoUrl: params.organizationLogoUrl,
    }),
  })
}

export const sendInvoiceNotificationEmail = async (params: {
  to: string[]
  cc?: string[]
  invoice: Invoice.Record
  invoiceLineItems: InvoiceLineItem.Record[]
  organizationName: string
  organizationLogoUrl?: string
}) => {
  return safeSend({
    from: 'notifs@flowglad.com',
    to: params.to.map(safeTo),
    cc: params.cc?.map(safeTo),
    subject: `${params.organizationName} New Invoice: #${params.invoice.invoiceNumber}`,
    react: InvoiceNotificationEmail({
      invoice: params.invoice,
      invoiceLineItems: params.invoiceLineItems,
      organizationName: params.organizationName,
      organizationLogoUrl: params.organizationLogoUrl,
    }),
  })
}
