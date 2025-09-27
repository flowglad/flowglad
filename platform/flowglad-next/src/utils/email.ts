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
import { OrganizationInvitationEmail } from '@/email-templates/organization/organization-invitation'
import {
  OrganizationPaymentFailedNotificationEmail,
  OrganizationPaymentFailedNotificationEmailProps,
} from '@/email-templates/organization/organization-payment-failed'
import { ForgotPasswordEmail } from '@/email-templates/forgot-password'
import { CustomerBillingPortalMagicLinkEmail } from '@/email-templates/customer-billing-portal-magic-link'

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
  core.IS_PROD
    ? email
    : core.envVariable('DEV_EMAIL_REDIRECT') ||
      'agree.ahmed@flowglad.com'

export const sendReceiptEmail = async (params: {
  to: string[]
  invoice: Invoice.Record
  invoiceLineItems: InvoiceLineItem.Record[]
  organizationName: string
  organizationLogoUrl?: string
  organizationId: string
  customerId: string
  replyTo?: string | null
  discountInfo?: {
    discountName: string
    discountCode: string
    discountAmount: number
    discountAmountType: string
  } | null
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
  /**
   * Don't send for test mode invoices
   */
  if (!invoice.livemode) {
    return
  }
  return safeSend({
    from: `${params.organizationName} Billing <${kebabCase(params.organizationName)}-notifications@flowglad.com>`,
    bcc: [core.envVariable('NOTIF_UAT_EMAIL')],
    to: params.to.map(safeTo),
    replyTo: params.replyTo ?? undefined,
    subject: `${params.organizationName} Order Receipt: #${invoice.invoiceNumber}`,
    attachments,
    react: await OrderReceiptEmail({
      invoiceNumber: invoice.invoiceNumber,
      orderDate: core.formatDate(invoice.createdAt!),
      invoice: {
        subtotal: invoice.subtotal,
        taxAmount: invoice.taxAmount,
        currency: invoice.currency,
      },
      lineItems: params.invoiceLineItems.map((item) => ({
        name: item.description ?? '',
        price: item.price,
        quantity: item.quantity,
      })),
      organizationName: params.organizationName,
      organizationLogoUrl: params.organizationLogoUrl,
      organizationId: invoice.organizationId,
      customerId: params.customerId,
      discountInfo: params.discountInfo,
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
    /**
     * NOTE: await needed to prevent
     * `Uncaught TypeError: reactDOMServer.renderToPipeableStream is not a function`
     * @see
     * https://www.reddit.com/r/reactjs/comments/1hdzwop/i_need_help_with_rendering_reactemail_as_html/
     * https://github.com/resend/react-email/issues/868
     */
    react: await OrganizationPaymentNotificationEmail(params),
  })
}

export const sendPurchaseAccessSessionTokenEmail = async (params: {
  to: string[]
  magicLink: string
  replyTo?: string | null
}) => {
  return safeSend({
    from: 'notifications@flowglad.com',
    to: params.to.map(safeTo),
    bcc: [core.envVariable('NOTIF_UAT_EMAIL')],
    replyTo: params.replyTo ?? undefined,
    subject: 'Your Order Link',
    /**
     * NOTE: await needed to prevent
     * `Uncaught TypeError: reactDOMServer.renderToPipeableStream is not a function`
     * @see
     * https://www.reddit.com/r/reactjs/comments/1hdzwop/i_need_help_with_rendering_reactemail_as_html/
     * https://github.com/resend/react-email/issues/868
     */
    react: await SendPurchaseAccessSessionTokenEmail(params),
  })
}

export const sendPaymentFailedEmail = async (params: {
  to: string[]
  organizationName: string
  organizationLogoUrl?: string
  invoiceNumber: string
  orderDate: Date
  invoice: {
    subtotal: number | null
    taxAmount: number | null
    currency: CurrencyCode
  }
  lineItems: {
    name: string
    price: number
    quantity: number
  }[]
  retryDate?: Date
  replyTo?: string | null
  discountInfo?: {
    discountName: string
    discountCode: string
    discountAmount: number
    discountAmountType: string
  } | null
  failureReason?: string
  customerPortalUrl?: string
}) => {
  return safeSend({
    from: 'notifications@flowglad.com',
    to: params.to.map(safeTo),
    bcc: [core.envVariable('NOTIF_UAT_EMAIL')],
    replyTo: params.replyTo ?? undefined,
    subject: 'Payment Unsuccessful',
    react: await PaymentFailedEmail({
      invoiceNumber: params.invoiceNumber,
      orderDate: new Date(params.orderDate),
      invoice: params.invoice,
      organizationName: params.organizationName,
      organizationLogoUrl: params.organizationLogoUrl,
      lineItems: params.lineItems,
      retryDate: params.retryDate,
      discountInfo: params.discountInfo,
      failureReason: params.failureReason,
      customerPortalUrl: params.customerPortalUrl,
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
  customerName,
}: {
  to: string[]
  organizationName: string
  invoiceNumber: string
  orderDate: Date
  amount: number
  customerId: string
  customerName: string
  currency: CurrencyCode
}) => {
  return safeSend({
    from: 'notifications@flowglad.com',
    to: to.map(safeTo),
    subject: 'Awaiting Payment Confirmation',
    /**
     * NOTE: await needed to prevent
     * `Uncaught TypeError: reactDOMServer.renderToPipeableStream is not a function`
     * @see
     * https://www.reddit.com/r/reactjs/comments/1hdzwop/i_need_help_with_rendering_reactemail_as_html/
     * https://github.com/resend/react-email/issues/868
     */
    react: await OrganizationPaymentConfirmationEmail({
      organizationName,
      amount,
      invoiceNumber,
      customerId,
      currency,
      customerName: customerName,
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
  replyTo,
  discountInfo,
}: {
  to: string[]
  cc?: string[]
  invoice: Invoice.Record
  invoiceLineItems: InvoiceLineItem.Record[]
  organizationName: string
  organizationLogoUrl?: string
  replyTo?: string | null
  discountInfo?: {
    discountName: string
    discountCode: string
    discountAmount: number
    discountAmountType: string
  } | null
}) => {
  return safeSend({
    from: 'notifs@flowglad.com',
    to: to.map(safeTo),
    cc: cc?.map(safeTo),
    replyTo: replyTo ?? undefined,
    subject: `${organizationName} Invoice Reminder: #${invoice.invoiceNumber}`,
    /**
     * NOTE: await needed to prevent
     * `Uncaught TypeError: reactDOMServer.renderToPipeableStream is not a function`
     * @see
     * https://www.reddit.com/r/reactjs/comments/1hdzwop/i_need_help_with_rendering_reactemail_as_html/
     * https://github.com/resend/react-email/issues/868
     */
    react: await InvoiceReminderEmail({
      invoice,
      invoiceLineItems,
      organizationName,
      organizationLogoUrl,
      discountInfo,
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
  replyTo,
  discountInfo,
}: {
  to: string[]
  cc?: string[]
  invoice: Invoice.Record
  invoiceLineItems: InvoiceLineItem.Record[]
  organizationName: string
  organizationLogoUrl?: string
  replyTo?: string | null
  discountInfo?: {
    discountName: string
    discountCode: string
    discountAmount: number
    discountAmountType: string
  } | null
}) => {
  return safeSend({
    from: 'notifs@flowglad.com',
    to: to.map(safeTo),
    cc: cc?.map(safeTo),
    replyTo: replyTo ?? undefined,
    subject: `${organizationName} New Invoice: #${invoice.invoiceNumber}`,
    /**
     * NOTE: await needed to prevent
     * `Uncaught TypeError: reactDOMServer.renderToPipeableStream is not a function`
     * @see
     * https://www.reddit.com/r/reactjs/comments/1hdzwop/i_need_help_with_rendering_reactemail_as_html/
     * https://github.com/resend/react-email/issues/868
     */
    react: await InvoiceNotificationEmail({
      invoice,
      invoiceLineItems,
      organizationName,
      organizationLogoUrl,
      discountInfo,
    }),
  })
}

export const sendOrganizationInvitationEmail = async ({
  to,
  organizationName,
  inviterName,
}: {
  to: string[]
  organizationName: string
  inviterName?: string
}) => {
  return safeSend({
    from: 'notifications@flowglad.com',
    to: to.map(safeTo),
    subject: `You've been invited to join ${organizationName}`,
    react: await OrganizationInvitationEmail({
      organizationName,
      inviterName,
    }),
  })
}

export const sendOrganizationPaymentFailedNotificationEmail = async (
  params: OrganizationPaymentFailedNotificationEmailProps & {
    to: string[]
  }
) => {
  return safeSend({
    from: `Flowglad <notifications@flowglad.com>`,
    to: params.to.map(safeTo),
    bcc: [core.envVariable('NOTIF_UAT_EMAIL')],
    subject: `${params.organizationName} payment failed from ${params.customerName}`,
    /**
     * NOTE: await needed to prevent React 18 renderToPipeableStream error when used with Resend
     */
    react: await OrganizationPaymentFailedNotificationEmail(params),
  })
}

export const sendForgotPasswordEmail = async ({
  to,
  url,
}: {
  to: string[]
  url: string
}) => {
  return safeSend({
    from: 'notifications@flowglad.com',
    to: to.map(safeTo),
    subject: 'Reset your password',
    react: await ForgotPasswordEmail({
      user: to[0],
      url,
    }),
  })
}

export const sendCustomerBillingPortalMagicLink = async ({
  to,
  url,
  customerName,
  organizationName,
}: {
  to: string[]
  url: string
  customerName?: string
  organizationName?: string
}) => {
  return safeSend({
    from: 'notifications@flowglad.com',
    to: to.map(safeTo),
    subject: `Sign in to your ${organizationName ? `${organizationName}` : ''} billing portal`,
    react: await CustomerBillingPortalMagicLinkEmail({
      email: to[0],
      url,
      customerName,
      organizationName,
    }),
  })
}
