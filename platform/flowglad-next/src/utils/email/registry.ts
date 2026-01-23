import type * as React from 'react'
import type { CurrencyCode, IntervalUnit } from '@/types'

/**
 * Email recipient types for determining appropriate branding.
 *
 * - `customer`: End users interacting with a merchant's product. Use org branding.
 * - `organization`: Merchants/platform users. Use Flowglad branding.
 * - `internal`: System/alert emails. Use Flowglad branding.
 */
export type EmailRecipientType =
  | 'customer'
  | 'organization'
  | 'internal'

/**
 * Email categories for organizational purposes.
 */
export type EmailCategory =
  | 'subscription'
  | 'payment'
  | 'auth'
  | 'notification'
  | 'export'
  | 'trial'

/**
 * Registry entry for a single email type.
 */
export interface EmailRegistryEntry<TProps = unknown> {
  /** The React component that renders the email */
  template: (
    props: TProps
  ) => Promise<React.ReactElement> | React.ReactElement
  /** Default subject line, can be a string or function that receives props */
  defaultSubject: string | ((props: TProps) => string)
  /** Who receives this email */
  recipientType: EmailRecipientType
  /** Category for organizational purposes */
  category: EmailCategory
  /** Human-readable description */
  description: string
  /**
   * Whether the template requires await (all React Email templates do).
   * This is mainly for documentation; in practice all should be awaited.
   */
  requiresAwait: boolean
}

// ============================================================================
// Props interfaces for all email types
// ============================================================================

// Customer Subscription Emails
export interface CustomerSubscriptionCreatedProps {
  customerName: string
  organizationName: string
  organizationLogoUrl?: string
  organizationId: string
  customerExternalId: string
  planName: string
  price: number
  currency: CurrencyCode
  interval?: IntervalUnit
  nextBillingDate?: Date
  paymentMethodLast4?: string
  trial?: {
    trialEndDate: Date
    trialDurationDays: number
  }
  dateConfirmed?: Date
}

export interface CustomerSubscriptionCanceledProps {
  customerName: string
  organizationName: string
  organizationLogoUrl?: string
  organizationId: string
  customerId: string
  subscriptionName: string
  cancellationDate: Date
  livemode: boolean
}

export interface CustomerSubscriptionCancellationScheduledProps {
  customerName: string
  organizationName: string
  organizationLogoUrl?: string
  organizationId: string
  customerId: string
  subscriptionName: string
  scheduledCancellationDate: Date
  livemode: boolean
}

export interface CustomerSubscriptionAdjustedProps {
  customerName: string
  organizationName: string
  organizationLogoUrl?: string
  organizationId: string
  adjustmentType: 'upgrade' | 'downgrade'
  previousItems: Array<{
    name: string
    unitPrice: number
    quantity: number
  }>
  newItems: Array<{
    name: string
    unitPrice: number
    quantity: number
  }>
  previousTotalPrice: number
  newTotalPrice: number
  currency: CurrencyCode
  interval?: IntervalUnit
  prorationAmount: number | null
  effectiveDate: Date
  nextBillingDate?: Date
}

export interface CustomerSubscriptionUpgradedProps {
  customerName: string
  organizationName: string
  organizationLogoUrl?: string
  organizationId: string
  customerExternalId: string
  previousPlanName: string
  previousPlanPrice: number
  previousPlanCurrency: CurrencyCode
  previousPlanInterval?: IntervalUnit
  newPlanName: string
  price: number
  currency: CurrencyCode
  interval?: IntervalUnit
  nextBillingDate?: Date
  paymentMethodLast4?: string
  trialing?: boolean
  dateConfirmed?: Date
}

// Customer Payment Emails
export interface CustomerOrderReceiptProps {
  invoiceNumber: string
  orderDate: string
  invoice: {
    subtotal: number | null
    taxAmount: number | null
    currency: CurrencyCode
  }
  organizationLogoUrl?: string
  organizationId: string
  customerId: string
  lineItems: Array<{
    name: string
    price: number
    quantity: number
  }>
  organizationName: string
  discountInfo?: {
    discountName: string
    discountCode: string
    discountAmount: number
    discountAmountType: string
  } | null
  livemode: boolean
  isMoR?: boolean
}

export interface CustomerPaymentFailedProps {
  invoiceNumber: string
  orderDate: Date
  invoice: {
    subtotal: number | null
    taxAmount: number | null
    currency: CurrencyCode
  }
  organizationName: string
  organizationLogoUrl?: string
  lineItems: Array<{
    name: string
    price: number
    quantity: number
  }>
  retryDate?: Date
  discountInfo?: {
    discountName: string
    discountCode: string
    discountAmount: number
    discountAmountType: string
  } | null
  failureReason?: string
  customerPortalUrl?: string
  livemode: boolean
}

// Customer Trial Emails
export interface CustomerTrialExpiredNoPaymentProps {
  customerName: string
  organizationName: string
  organizationLogoUrl?: string
  organizationId: string
  customerId: string
  planName: string
  livemode: boolean
}

// Customer Auth Emails
export interface CustomerBillingPortalMagicLinkProps {
  customerName?: string
  email: string
  url: string
  organizationName: string
  livemode: boolean
}

export interface CustomerBillingPortalOTPProps {
  customerName?: string
  email: string
  otp: string
  organizationName: string
  livemode: boolean
}

export interface ForgotPasswordProps {
  user: string
  url: string
}

export interface PurchaseAccessSessionTokenProps {
  magicLink?: string
  livemode: boolean
}

// Organization Subscription Emails
export interface OrganizationSubscriptionCreatedProps {
  organizationName: string
  subscriptionName: string
  customerId: string
  customerName: string
  customerEmail: string
  livemode: boolean
}

export interface OrganizationSubscriptionCanceledProps {
  organizationName: string
  subscriptionName: string
  customerId: string
  customerName: string
  customerEmail: string
  cancellationDate: Date
  livemode: boolean
}

export interface OrganizationSubscriptionCancellationScheduledProps {
  organizationName: string
  subscriptionName: string
  customerId: string
  customerName: string
  customerEmail: string
  scheduledCancellationDate: Date
  livemode: boolean
}

export interface OrganizationSubscriptionAdjustedProps {
  organizationName: string
  customerName: string
  customerEmail: string | null
  customerId: string
  adjustmentType: 'upgrade' | 'downgrade'
  previousItems: Array<{
    name: string
    unitPrice: number
    quantity: number
  }>
  newItems: Array<{
    name: string
    unitPrice: number
    quantity: number
  }>
  previousTotalPrice: number
  newTotalPrice: number
  currency: CurrencyCode
  prorationAmount: number | null
  effectiveDate: Date
  livemode: boolean
}

// Organization Payment Emails
export interface OrganizationPaymentSucceededProps {
  organizationName: string
  amount: number
  invoiceNumber?: string
  currency: CurrencyCode
  customerId: string
  customerName: string
  customerEmail: string
  livemode: boolean
}

export interface OrganizationPaymentFailedProps {
  organizationName: string
  amount: number
  invoiceNumber?: string
  currency: CurrencyCode
  customerId: string
  customerName: string
  failureReason?: string
  livemode: boolean
}

export interface OrganizationPaymentAwaitingConfirmationProps {
  organizationName: string
  amount: number
  invoiceNumber?: string
  customerId: string
  currency: CurrencyCode
  customerName: string
  livemode: boolean
}

// Organization Notification Emails
export interface OrganizationPayoutsEnabledProps {
  organizationName: string
}

export interface OrganizationOnboardingCompletedProps {
  organizationName: string
}

export interface OrganizationInvitationProps {
  organizationName: string
  inviterName?: string
}

export interface CustomersCsvExportReadyProps {
  organizationName: string
  livemode: boolean
}

// ============================================================================
// Email Registry
// ============================================================================

/**
 * Type definition for all email types and their props.
 * Maps email type keys to their corresponding props interface.
 */
export interface EmailTypeMap {
  // Customer Subscription
  'customer.subscription.created': CustomerSubscriptionCreatedProps
  'customer.subscription.canceled': CustomerSubscriptionCanceledProps
  'customer.subscription.cancellation-scheduled': CustomerSubscriptionCancellationScheduledProps
  'customer.subscription.adjusted': CustomerSubscriptionAdjustedProps
  'customer.subscription.upgraded': CustomerSubscriptionUpgradedProps

  // Customer Payment
  'customer.payment.receipt': CustomerOrderReceiptProps
  'customer.payment.failed': CustomerPaymentFailedProps

  // Customer Trial
  'customer.trial.expired-no-payment': CustomerTrialExpiredNoPaymentProps

  // Customer Auth
  'customer.auth.billing-portal-magic-link': CustomerBillingPortalMagicLinkProps
  'customer.auth.billing-portal-otp': CustomerBillingPortalOTPProps
  'customer.auth.forgot-password': ForgotPasswordProps
  'customer.auth.purchase-access-token': PurchaseAccessSessionTokenProps

  // Organization Subscription
  'organization.subscription.created': OrganizationSubscriptionCreatedProps
  'organization.subscription.canceled': OrganizationSubscriptionCanceledProps
  'organization.subscription.cancellation-scheduled': OrganizationSubscriptionCancellationScheduledProps
  'organization.subscription.adjusted': OrganizationSubscriptionAdjustedProps

  // Organization Payment
  'organization.payment.succeeded': OrganizationPaymentSucceededProps
  'organization.payment.failed': OrganizationPaymentFailedProps
  'organization.payment.awaiting-confirmation': OrganizationPaymentAwaitingConfirmationProps

  // Organization Notification
  'organization.notification.payouts-enabled': OrganizationPayoutsEnabledProps
  'organization.notification.onboarding-completed': OrganizationOnboardingCompletedProps
  'organization.notification.invitation': OrganizationInvitationProps
  'organization.notification.csv-export-ready': CustomersCsvExportReadyProps
}

/**
 * Type for all email types.
 */
export type EmailType = keyof EmailTypeMap

/**
 * Get the props type for a specific email type.
 */
export type EmailPropsFor<T extends EmailType> = EmailTypeMap[T]

// ============================================================================
// Lazy-loaded Email Registry
// ============================================================================

/**
 * The email registry containing configuration for all email types.
 * Templates are loaded lazily to avoid circular dependencies.
 */
export const EMAIL_REGISTRY: {
  [K in EmailType]: Omit<
    EmailRegistryEntry<EmailTypeMap[K]>,
    'template'
  > & {
    /** Lazy template loader to avoid circular dependencies */
    getTemplate: () => Promise<
      (
        props: EmailTypeMap[K]
      ) => Promise<React.ReactElement> | React.ReactElement
    >
  }
} = {
  // Customer Subscription Emails
  'customer.subscription.created': {
    getTemplate: async () => {
      const mod = await import(
        '@/email-templates/customer-subscription-created'
      )
      return mod.CustomerSubscriptionCreatedEmail
    },
    defaultSubject: 'Your Subscription is Confirmed',
    recipientType: 'customer',
    category: 'subscription',
    description:
      'Sent when a customer successfully subscribes to a plan',
    requiresAwait: true,
  },
  'customer.subscription.canceled': {
    getTemplate: async () => {
      const mod = await import(
        '@/email-templates/customer-subscription-canceled'
      )
      return mod.CustomerSubscriptionCanceledEmail
    },
    defaultSubject: 'Your subscription has been canceled',
    recipientType: 'customer',
    category: 'subscription',
    description:
      'Sent when a customer subscription is fully canceled',
    requiresAwait: true,
  },
  'customer.subscription.cancellation-scheduled': {
    getTemplate: async () => {
      const mod = await import(
        '@/email-templates/customer-subscription-cancellation-scheduled'
      )
      return mod.CustomerSubscriptionCancellationScheduledEmail
    },
    defaultSubject:
      'Your subscription cancellation has been scheduled',
    recipientType: 'customer',
    category: 'subscription',
    description:
      'Sent when a customer schedules their subscription to cancel at period end',
    requiresAwait: true,
  },
  'customer.subscription.adjusted': {
    getTemplate: async () => {
      const mod = await import(
        '@/email-templates/customer-subscription-adjusted'
      )
      return mod.CustomerSubscriptionAdjustedEmail
    },
    defaultSubject: 'Your Subscription has been Updated',
    recipientType: 'customer',
    category: 'subscription',
    description:
      'Sent when a customer subscription is upgraded or downgraded',
    requiresAwait: true,
  },
  'customer.subscription.upgraded': {
    getTemplate: async () => {
      const mod = await import(
        '@/email-templates/customer-subscription-upgraded'
      )
      return mod.CustomerSubscriptionUpgradedEmail
    },
    defaultSubject: 'Your Subscription is Confirmed',
    recipientType: 'customer',
    category: 'subscription',
    description:
      'Sent when a customer upgrades from a free plan to a paid plan',
    requiresAwait: true,
  },

  // Customer Payment Emails
  'customer.payment.receipt': {
    getTemplate: async () => {
      const mod = await import(
        '@/email-templates/customer-order-receipt'
      )
      return mod.OrderReceiptEmail
    },
    defaultSubject: (props) =>
      props.isMoR
        ? `Order Receipt #${props.invoiceNumber} from Flowglad Inc. for ${props.organizationName}`
        : `${props.organizationName} Order Receipt: #${props.invoiceNumber}`,
    recipientType: 'customer',
    category: 'payment',
    description: 'Sent when a payment is successfully processed',
    requiresAwait: true,
  },
  'customer.payment.failed': {
    getTemplate: async () => {
      const mod = await import(
        '@/email-templates/customer-payment-failed'
      )
      return mod.PaymentFailedEmail
    },
    defaultSubject: 'Your Payment Failed',
    recipientType: 'customer',
    category: 'payment',
    description: 'Sent when a payment fails to process',
    requiresAwait: true,
  },

  // Customer Trial Emails
  'customer.trial.expired-no-payment': {
    getTemplate: async () => {
      const mod = await import(
        '@/email-templates/customer-trial-expired-no-payment'
      )
      return mod.CustomerTrialExpiredNoPaymentEmail
    },
    defaultSubject: 'Action Required: Update Your Payment Method',
    recipientType: 'customer',
    category: 'trial',
    description:
      'Sent when a trial expires and no payment method is on file',
    requiresAwait: true,
  },

  // Customer Auth Emails
  'customer.auth.billing-portal-magic-link': {
    getTemplate: async () => {
      const mod = await import(
        '@/email-templates/customer-billing-portal-magic-link'
      )
      return mod.CustomerBillingPortalMagicLinkEmail
    },
    defaultSubject: (props) =>
      `Sign in to your ${props.organizationName} billing portal`,
    recipientType: 'customer',
    category: 'auth',
    description: 'Magic link for customer billing portal access',
    requiresAwait: true,
  },
  'customer.auth.billing-portal-otp': {
    getTemplate: async () => {
      const mod = await import(
        '@/email-templates/customer-billing-portal-otp'
      )
      return mod.CustomerBillingPortalOTPEmail
    },
    defaultSubject: (props) =>
      `Your ${props.organizationName} billing portal verification code`,
    recipientType: 'customer',
    category: 'auth',
    description: 'OTP code for customer billing portal access',
    requiresAwait: true,
  },
  'customer.auth.forgot-password': {
    getTemplate: async () => {
      const mod = await import('@/email-templates/forgot-password')
      return mod.ForgotPasswordEmail
    },
    defaultSubject: 'Reset your password',
    recipientType: 'customer',
    category: 'auth',
    description: 'Password reset request',
    requiresAwait: true,
  },
  'customer.auth.purchase-access-token': {
    getTemplate: async () => {
      const mod = await import(
        '@/email-templates/send-purchase-access-session-token'
      )
      return mod.SendPurchaseAccessSessionTokenEmail
    },
    defaultSubject: 'Your Order Link',
    recipientType: 'customer',
    category: 'auth',
    description: 'Magic link to access purchase/order',
    requiresAwait: true,
  },

  // Organization Subscription Emails
  'organization.subscription.created': {
    getTemplate: async () => {
      const mod = await import(
        '@/email-templates/organization-subscription-notifications'
      )
      return mod.OrganizationSubscriptionCreatedNotificationEmail
    },
    defaultSubject: (props) =>
      `New Subscription: ${props.customerName} subscribed to ${props.subscriptionName}`,
    recipientType: 'organization',
    category: 'subscription',
    description:
      'Notifies organization when a customer creates a subscription',
    requiresAwait: true,
  },
  'organization.subscription.canceled': {
    getTemplate: async () => {
      const mod = await import(
        '@/email-templates/organization-subscription-notifications'
      )
      return mod.OrganizationSubscriptionCanceledNotificationEmail
    },
    defaultSubject: (props) =>
      `Subscription Cancelled: ${props.customerName} canceled ${props.subscriptionName}`,
    recipientType: 'organization',
    category: 'subscription',
    description:
      'Notifies organization when a customer cancels their subscription',
    requiresAwait: true,
  },
  'organization.subscription.cancellation-scheduled': {
    getTemplate: async () => {
      const mod = await import(
        '@/email-templates/organization-subscription-notifications'
      )
      return mod.OrganizationSubscriptionCancellationScheduledNotificationEmail
    },
    defaultSubject: (props) =>
      `Cancellation Scheduled: ${props.customerName} scheduled cancellation for ${props.subscriptionName}`,
    recipientType: 'organization',
    category: 'subscription',
    description:
      'Notifies organization when a customer schedules a cancellation',
    requiresAwait: true,
  },
  'organization.subscription.adjusted': {
    getTemplate: async () => {
      const mod = await import(
        '@/email-templates/organization/organization-subscription-adjusted'
      )
      return mod.OrganizationSubscriptionAdjustedEmail
    },
    defaultSubject: (props) =>
      `Subscription Updated - ${props.customerName?.trim() || props.customerEmail || 'Customer'}`,
    recipientType: 'organization',
    category: 'subscription',
    description:
      'Notifies organization when a customer adjusts their subscription',
    requiresAwait: true,
  },

  // Organization Payment Emails
  'organization.payment.succeeded': {
    getTemplate: async () => {
      const mod = await import(
        '@/email-templates/organization/organization-payment-succeeded'
      )
      return mod.OrganizationPaymentNotificationEmail
    },
    defaultSubject: (props) =>
      `Successful payment from ${props.customerName}!`,
    recipientType: 'organization',
    category: 'payment',
    description: 'Notifies organization of a successful payment',
    requiresAwait: true,
  },
  'organization.payment.failed': {
    getTemplate: async () => {
      const mod = await import(
        '@/email-templates/organization/organization-payment-failed'
      )
      return mod.OrganizationPaymentFailedNotificationEmail
    },
    defaultSubject: (props) =>
      `Payment Failed from ${props.customerName}`,
    recipientType: 'organization',
    category: 'payment',
    description: 'Notifies organization of a failed payment',
    requiresAwait: true,
  },
  'organization.payment.awaiting-confirmation': {
    getTemplate: async () => {
      const mod = await import(
        '@/email-templates/organization/organization-payment-awaiting-confirmation'
      )
      return mod.OrganizationPaymentConfirmationEmail
    },
    defaultSubject: 'Awaiting Payment Confirmation',
    recipientType: 'organization',
    category: 'payment',
    description:
      'Notifies organization of a payment awaiting confirmation',
    requiresAwait: true,
  },

  // Organization Notification Emails
  'organization.notification.payouts-enabled': {
    getTemplate: async () => {
      const mod = await import(
        '@/email-templates/organization/organization-payouts-enabled'
      )
      return mod.OrganizationPayoutsEnabledNotificationEmail
    },
    defaultSubject: (props) =>
      `Payouts Enabled for ${props.organizationName}`,
    recipientType: 'organization',
    category: 'notification',
    description:
      'Notifies organization when payouts are enabled for their account',
    requiresAwait: true,
  },
  'organization.notification.onboarding-completed': {
    getTemplate: async () => {
      const mod = await import(
        '@/email-templates/organization/payout-notification'
      )
      return mod.OrganizationOnboardingCompletedNotificationEmail
    },
    defaultSubject: (props) =>
      `Live payments pending review for ${props.organizationName}`,
    recipientType: 'organization',
    category: 'notification',
    description:
      'Notifies organization when onboarding is complete and payments are pending review',
    requiresAwait: true,
  },
  'organization.notification.invitation': {
    getTemplate: async () => {
      const mod = await import(
        '@/email-templates/organization/organization-invitation'
      )
      return mod.OrganizationInvitationEmail
    },
    defaultSubject: (props) =>
      `You've been invited to join ${props.organizationName}`,
    recipientType: 'organization',
    category: 'notification',
    description: 'Invitation to join an organization',
    requiresAwait: true,
  },
  'organization.notification.csv-export-ready': {
    getTemplate: async () => {
      const mod = await import(
        '@/email-templates/organization/customers-csv-export-ready'
      )
      return mod.CustomersCsvExportReadyEmail
    },
    defaultSubject: 'Your customers CSV export is ready',
    recipientType: 'organization',
    category: 'export',
    description:
      'Notifies organization when a CSV export is ready for download',
    requiresAwait: true,
  },
}

/**
 * Get the number of registered email types.
 */
export const getEmailTypeCount = (): number =>
  Object.keys(EMAIL_REGISTRY).length
