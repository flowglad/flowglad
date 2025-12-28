import { kebabCase } from 'change-case'
import {
  type CreateEmailOptions,
  type CreateEmailRequestOptions,
  Resend,
} from 'resend'
import { FLOWGLAD_LEGAL_ENTITY } from '@/constants/mor'
import type { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import type { Invoice } from '@/db/schema/invoices'
import { CustomerBillingPortalMagicLinkEmail } from '@/email-templates/customer-billing-portal-magic-link'
import { OrderReceiptEmail } from '@/email-templates/customer-order-receipt'
import { PaymentFailedEmail } from '@/email-templates/customer-payment-failed'
import { ForgotPasswordEmail } from '@/email-templates/forgot-password'
import { InvoiceNotificationEmail } from '@/email-templates/invoice-notification'
import { InvoiceReminderEmail } from '@/email-templates/invoice-reminder'
import { CustomersCsvExportReadyEmail } from '@/email-templates/organization/customers-csv-export-ready'
import { OrganizationInvitationEmail } from '@/email-templates/organization/organization-invitation'
import { OrganizationPaymentConfirmationEmail } from '@/email-templates/organization/organization-payment-awaiting-confirmation'
import {
  OrganizationPaymentFailedNotificationEmail,
  type OrganizationPaymentFailedNotificationEmailProps,
} from '@/email-templates/organization/organization-payment-failed'
import {
  OrganizationPaymentNotificationEmail,
  type OrganizationPaymentNotificationEmailProps,
} from '@/email-templates/organization/organization-payment-succeeded'
import { OrganizationPayoutsEnabledNotificationEmail } from '@/email-templates/organization/organization-payouts-enabled'
import { OrganizationOnboardingCompletedNotificationEmail } from '@/email-templates/organization/payout-notification'
import SendPurchaseAccessSessionTokenEmail from '@/email-templates/send-purchase-access-session-token'
import type { CurrencyCode } from '@/types'
import core from './core'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from './stripe'

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

/**
 * Formats an email subject line, prefixing with [TEST] if livemode is false.
 *
 * All email send functions that accept a `livemode` parameter must use this helper
 * to format their subject line to ensure test mode emails are clearly identifiable.
 *
 * @param subject - The base subject line
 * @param livemode - Whether this is a livemode (production) email
 * @returns The formatted subject line with [TEST] prefix when livemode is false
 */
export const formatEmailSubject = (
  subject: string,
  livemode: boolean
): string => {
  if (livemode) {
    return subject
  }
  return `[TEST] ${subject}`
}

/**
 * Returns the bcc array with NOTIF_UAT_EMAIL only if livemode is true.
 * This ensures UAT notifications are only sent for production events, not test mode events.
 *
 * @param livemode - Whether this is a livemode (production) email
 * @returns Array with NOTIF_UAT_EMAIL if livemode is true, undefined otherwise
 */
export const getBccForLivemode = (
  livemode: boolean
): string[] | undefined => {
  if (!livemode) {
    return undefined
  }
  const notifUatEmail = core.envVariable('NOTIF_UAT_EMAIL')
  return notifUatEmail ? [notifUatEmail] : undefined
}

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
  /** Whether this is a Merchant of Record invoice (Flowglad as seller) */
  isMoR?: boolean
}) => {
  const { invoice, isMoR } = params
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

  const fromAddress = isMoR
    ? `Flowglad Billing <billing@flowglad.com>`
    : `${params.organizationName} Billing <${kebabCase(params.organizationName)}-notifications@flowglad.com>`

  const subject = isMoR
    ? `Order Receipt #${invoice.invoiceNumber} from ${FLOWGLAD_LEGAL_ENTITY.name} for ${params.organizationName}`
    : `${params.organizationName} Order Receipt: #${invoice.invoiceNumber}`

  return safeSend({
    from: fromAddress,
    bcc: getBccForLivemode(invoice.livemode),
    to: params.to.map(safeTo),
    replyTo: params.replyTo ?? undefined,
    subject,
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
      livemode: invoice.livemode,
      isMoR,
    }),
  })
}

export const sendOrganizationPaymentNotificationEmail = async (
  params: OrganizationPaymentNotificationEmailProps & { to: string[] }
) => {
  return safeSend({
    from: `Flowglad <notifications@flowglad.com>`,
    to: params.to.map(safeTo),
    bcc: getBccForLivemode(params.livemode),
    subject: formatEmailSubject(
      `You just made ${stripeCurrencyAmountToHumanReadableCurrencyAmount(
        params.currency,
        params.amount
      )} from ${params.organizationName}!`,
      params.livemode
    ),
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
  livemode: boolean
}) => {
  return safeSend({
    from: 'notifications@flowglad.com',
    to: params.to.map(safeTo),
    bcc: getBccForLivemode(params.livemode),
    replyTo: params.replyTo ?? undefined,
    subject: formatEmailSubject('Your Order Link', params.livemode),
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
  orderDate: Date | number
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
  retryDate?: Date | number
  replyTo?: string | null
  discountInfo?: {
    discountName: string
    discountCode: string
    discountAmount: number
    discountAmountType: string
  } | null
  failureReason?: string
  customerPortalUrl?: string
  livemode: boolean
}) => {
  return safeSend({
    from: 'notifications@flowglad.com',
    to: params.to.map(safeTo),
    bcc: getBccForLivemode(params.livemode),
    replyTo: params.replyTo ?? undefined,
    subject: formatEmailSubject(
      'Payment Unsuccessful',
      params.livemode
    ),
    react: await PaymentFailedEmail({
      invoiceNumber: params.invoiceNumber,
      orderDate: new Date(params.orderDate),
      invoice: params.invoice,
      organizationName: params.organizationName,
      organizationLogoUrl: params.organizationLogoUrl,
      lineItems: params.lineItems,
      retryDate: params.retryDate
        ? new Date(params.retryDate)
        : undefined,
      discountInfo: params.discountInfo,
      failureReason: params.failureReason,
      customerPortalUrl: params.customerPortalUrl,
      livemode: params.livemode,
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
  livemode,
}: {
  to: string[]
  organizationName: string
  invoiceNumber: string
  amount: number
  customerId: string
  customerName: string
  currency: CurrencyCode
  livemode: boolean
}) => {
  return safeSend({
    from: 'notifications@flowglad.com',
    to: to.map(safeTo),
    subject: formatEmailSubject(
      'Awaiting Payment Confirmation',
      livemode
    ),
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
      livemode,
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
  isMoR,
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
  /** Whether this is a Merchant of Record invoice (Flowglad as seller) */
  isMoR?: boolean
}) => {
  const fromAddress = isMoR
    ? `Flowglad Billing <billing@flowglad.com>`
    : `${organizationName} Billing <${kebabCase(organizationName)}-notifications@flowglad.com>`

  const subject = isMoR
    ? `Invoice Reminder #${invoice.invoiceNumber} from ${FLOWGLAD_LEGAL_ENTITY.name} for ${organizationName}`
    : `${organizationName} Invoice Reminder: #${invoice.invoiceNumber}`

  return safeSend({
    from: fromAddress,
    to: to.map(safeTo),
    cc: cc?.map(safeTo),
    replyTo: replyTo ?? undefined,
    subject: formatEmailSubject(subject, invoice.livemode),
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
      livemode: invoice.livemode,
      isMoR,
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
  isMoR,
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
  /** Whether this is a Merchant of Record invoice (Flowglad as seller) */
  isMoR?: boolean
}) => {
  const fromAddress = isMoR
    ? `Flowglad Billing <billing@flowglad.com>`
    : `${organizationName} Billing <${kebabCase(organizationName)}-notifications@flowglad.com>`

  const subject = isMoR
    ? `Invoice #${invoice.invoiceNumber} from ${FLOWGLAD_LEGAL_ENTITY.name} for ${organizationName}`
    : `${organizationName} New Invoice: #${invoice.invoiceNumber}`

  return safeSend({
    from: fromAddress,
    to: to.map(safeTo),
    cc: cc?.map(safeTo),
    replyTo: replyTo ?? undefined,
    subject: formatEmailSubject(subject, invoice.livemode),
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
      livemode: invoice.livemode,
      isMoR,
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
    bcc: getBccForLivemode(params.livemode),
    subject: formatEmailSubject(
      `${params.organizationName} payment failed from ${params.customerName}`,
      params.livemode
    ),
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
  livemode,
}: {
  to: string[]
  url: string
  customerName?: string
  organizationName: string
  livemode: boolean
}) => {
  return safeSend({
    from: 'notifications@flowglad.com',
    to: to.map(safeTo),
    subject: formatEmailSubject(
      `Sign in to your ${organizationName} billing portal`,
      livemode
    ),
    react: await CustomerBillingPortalMagicLinkEmail({
      email: to[0],
      url,
      customerName,
      organizationName,
      livemode,
    }),
  })
}

export const sendOrganizationOnboardingCompletedNotificationEmail =
  async ({
    to,
    organizationName,
  }: {
    to: string[]
    organizationName: string
  }) => {
    return safeSend({
      from: 'Flowglad <notifications@flowglad.com>',
      to: to.map(safeTo),
      bcc: getBccForLivemode(true),
      subject: `Live payments pending review for ${organizationName}`,
      react: await OrganizationOnboardingCompletedNotificationEmail({
        organizationName,
      }),
    })
  }

export const sendOrganizationPayoutsEnabledNotificationEmail =
  async ({
    to,
    organizationName,
  }: {
    to: string[]
    organizationName: string
  }) => {
    return safeSend({
      from: 'Flowglad <notifications@flowglad.com>',
      to: to.map(safeTo),
      bcc: getBccForLivemode(true),
      subject: `Payouts Enabled for ${organizationName}`,
      /**
       * NOTE: await needed to prevent
       * `Uncaught TypeError: reactDOMServer.renderToPipeableStream is not a function`
       * @see
       * https://www.reddit.com/r/reactjs/comments/1hdzwop/i_need_help_with_rendering_reactemail_as_html/
       * https://github.com/resend/react-email/issues/868
       */
      react: await OrganizationPayoutsEnabledNotificationEmail({
        organizationName,
      }),
    })
  }

export const sendCustomersCsvExportReadyEmail = async ({
  to,
  organizationName,
  csvContent,
  filename,
  livemode,
}: {
  to: string[]
  organizationName: string
  csvContent: string
  filename: string
  livemode: boolean
}) => {
  return safeSend({
    from: 'Flowglad <notifications@flowglad.com>',
    to: to.map(safeTo),
    subject: formatEmailSubject(
      'Your customers CSV export is ready',
      livemode
    ),
    react: await CustomersCsvExportReadyEmail({
      organizationName,
      livemode,
    }),
    attachments: [
      {
        filename,
        content: Buffer.from(csvContent, 'utf-8'),
        contentType: 'text/csv',
      },
    ],
  })
}
