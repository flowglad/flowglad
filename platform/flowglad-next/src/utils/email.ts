import type { CurrencyCode } from '@db-core/enums'
import type { InvoiceLineItem } from '@db-core/schema/invoiceLineItems'
import type { Invoice } from '@db-core/schema/invoices'
import {
  type CreateEmailOptions,
  type CreateEmailRequestOptions,
  type CreateEmailResponse,
  Resend,
} from 'resend'
import { FLOWGLAD_LEGAL_ENTITY } from '@/constants/mor'
import { CustomerBillingPortalMagicLinkEmail } from '@/email-templates/customer-billing-portal-magic-link'
import { CustomerBillingPortalOTPEmail } from '@/email-templates/customer-billing-portal-otp'
import { OrderReceiptEmail } from '@/email-templates/customer-order-receipt'
import { PaymentFailedEmail } from '@/email-templates/customer-payment-failed'
import { ForgotPasswordEmail } from '@/email-templates/forgot-password'
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
import { resendTraced } from '@/utils/tracing'
import core from './core'
import { getFromAddress } from './email/fromAddress'

const resend = () => new Resend(core.envVariable('RESEND_API_KEY'))

interface SafeSendParams {
  email: CreateEmailOptions
  options?: CreateEmailRequestOptions & { templateName?: string }
}

/**
 * Core safeSend logic without tracing.
 */
const safeSendCore = async ({
  email,
  options,
}: SafeSendParams): Promise<CreateEmailResponse | undefined> => {
  if (core.IS_TEST) {
    return undefined
  }
  return resend().emails.send({ ...email }, options)
}

export const safeSend = (
  email: CreateEmailOptions,
  options?: CreateEmailRequestOptions & { templateName?: string }
): Promise<CreateEmailResponse | undefined> => {
  if (core.IS_TEST) {
    return Promise.resolve(undefined)
  }
  const recipientCount = Array.isArray(email.to) ? email.to.length : 1
  return resendTraced(
    'emails.send',
    ({ options: opts }: SafeSendParams) => ({
      'resend.template': opts?.templateName,
      'resend.recipient_count': recipientCount,
    }),
    safeSendCore
  )({ email, options })
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

  // For MoR invoices, use Flowglad branding (no organizationName).
  // For non-MoR invoices, use organization branding.
  const fromAddress = getFromAddress({
    recipientType: 'customer',
    organizationName: isMoR ? undefined : params.organizationName,
  })

  const subject = isMoR
    ? `Order Receipt #${invoice.invoiceNumber} from ${FLOWGLAD_LEGAL_ENTITY.name} for ${params.organizationName}`
    : `${params.organizationName} Order Receipt: #${invoice.invoiceNumber}`

  return safeSend(
    {
      from: fromAddress,
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
    },
    { templateName: 'order-receipt' }
  )
}

export const sendOrganizationPaymentNotificationEmail = async (
  params: OrganizationPaymentNotificationEmailProps & { to: string[] }
) => {
  return safeSend(
    {
      from: `Flowglad <notifications@flowglad.com>`,
      to: params.to.map(safeTo),
      subject: formatEmailSubject(
        `Successful payment from ${params.customerName}!`,
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
    },
    { templateName: 'organization-payment-notification' }
  )
}

export const sendPurchaseAccessSessionTokenEmail = async (params: {
  to: string[]
  magicLink: string
  replyTo?: string | null
  livemode: boolean
  organizationName?: string
}) => {
  return safeSend(
    {
      from: getFromAddress({
        recipientType: 'customer',
        organizationName: params.organizationName,
      }),
      to: params.to.map(safeTo),
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
    },
    { templateName: 'purchase-access-session-token' }
  )
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
  return safeSend(
    {
      from: getFromAddress({
        recipientType: 'customer',
        organizationName: params.organizationName,
      }),
      to: params.to.map(safeTo),
      replyTo: params.replyTo ?? undefined,
      subject: formatEmailSubject(
        'Your Payment Failed',
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
    },
    { templateName: 'payment-failed' }
  )
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
  return safeSend(
    {
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
    },
    { templateName: 'awaiting-payment-confirmation' }
  )
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
  return safeSend(
    {
      from: 'notifications@flowglad.com',
      to: to.map(safeTo),
      subject: `You've been invited to join ${organizationName}`,
      react: await OrganizationInvitationEmail({
        organizationName,
        inviterName,
      }),
    },
    { templateName: 'organization-invitation' }
  )
}

export const sendOrganizationPaymentFailedNotificationEmail = async (
  params: OrganizationPaymentFailedNotificationEmailProps & {
    to: string[]
  }
) => {
  return safeSend(
    {
      from: `Flowglad <notifications@flowglad.com>`,
      to: params.to.map(safeTo),
      subject: formatEmailSubject(
        `Payment Failed from ${params.customerName}`,
        params.livemode
      ),
      /**
       * NOTE: await needed to prevent React 18 renderToPipeableStream error when used with Resend
       */
      react: await OrganizationPaymentFailedNotificationEmail(params),
    },
    { templateName: 'organization-payment-failed-notification' }
  )
}

export const sendForgotPasswordEmail = async ({
  to,
  url,
}: {
  to: string[]
  url: string
}) => {
  return safeSend(
    {
      from: 'notifications@flowglad.com',
      to: to.map(safeTo),
      subject: 'Reset your password',
      react: await ForgotPasswordEmail({
        user: to[0],
        url,
      }),
    },
    { templateName: 'forgot-password' }
  )
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
  return safeSend(
    {
      from: getFromAddress({
        recipientType: 'customer',
        organizationName,
      }),
      to: to.map(safeTo),
      subject: formatEmailSubject(
        `Log in to your ${organizationName} billing portal`,
        livemode
      ),
      react: await CustomerBillingPortalMagicLinkEmail({
        email: to[0],
        url,
        customerName,
        organizationName,
        livemode,
      }),
    },
    { templateName: 'customer-billing-portal-magic-link' }
  )
}

export const sendCustomerBillingPortalOTP = async ({
  to,
  otp,
  customerName,
  organizationName,
  livemode,
}: {
  to: string[]
  otp: string
  customerName?: string
  organizationName: string
  livemode: boolean
}) => {
  return safeSend(
    {
      from: getFromAddress({
        recipientType: 'customer',
        organizationName,
      }),
      to: to.map(safeTo),
      subject: formatEmailSubject(
        `${otp} is your ${organizationName} billing portal code`,
        livemode
      ),
      react: await CustomerBillingPortalOTPEmail({
        email: to[0],
        otp,
        customerName,
        organizationName,
        livemode,
      }),
    },
    { templateName: 'customer-billing-portal-otp' }
  )
}

export const sendOrganizationOnboardingCompletedNotificationEmail =
  async ({
    to,
    organizationName,
  }: {
    to: string[]
    organizationName: string
  }) => {
    return safeSend(
      {
        from: 'Flowglad <notifications@flowglad.com>',
        to: to.map(safeTo),
        subject: `Live payments pending review for ${organizationName}`,
        react: await OrganizationOnboardingCompletedNotificationEmail(
          {
            organizationName,
          }
        ),
      },
      { templateName: 'organization-onboarding-completed' }
    )
  }

export const sendOrganizationPayoutsEnabledNotificationEmail =
  async ({
    to,
    organizationName,
  }: {
    to: string[]
    organizationName: string
  }) => {
    return safeSend(
      {
        from: 'Flowglad <notifications@flowglad.com>',
        to: to.map(safeTo),
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
      },
      { templateName: 'organization-payouts-enabled' }
    )
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
  return safeSend(
    {
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
    },
    { templateName: 'customers-csv-export-ready' }
  )
}

/**
 * Masks an email address for display purposes.
 * Example: "user@example.com" -> "u***@example.com"
 */
export const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@')
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`
  }
  const visibleChars = Math.min(2, Math.floor(local.length / 3))
  const masked =
    local.slice(0, visibleChars) + '***' + local.slice(-1)
  return `${masked}@${domain}`
}
