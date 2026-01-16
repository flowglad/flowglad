import { CurrencyCode, IntervalUnit } from '@/types'

// ============================================================================
// Constants
// ============================================================================

/** Default currency for all mock data - typed to avoid 'as CurrencyCode' assertions */
export const DEFAULT_CURRENCY = CurrencyCode.USD

/** Time constants in milliseconds */
export const TIME_MS = {
  ONE_DAY: 24 * 60 * 60 * 1000,
  THREE_DAYS: 3 * 24 * 60 * 60 * 1000,
  THIRTY_DAYS: 30 * 24 * 60 * 60 * 1000,
} as const

/** Mock prices in cents */
export const MOCK_PRICES = {
  FREE: 0,
  BASIC_PLAN: 1900, // $19.00
  PRO_PLAN: 2900, // $29.00
  PRORATION_AMOUNT: 1000, // $10.00
  ORDER_ITEM_1: 4900, // $49.00
  ORDER_ITEM_2: 5000, // $50.00
  TAX_AMOUNT: 232, // $2.32
  TAX_AMOUNT_LARGE: 792, // $7.92
} as const

/**
 * Fixed reference date for consistent preview rendering.
 * Using a fixed date prevents visual regression test flakiness.
 *
 * MAINTENANCE NOTE: Update this date annually to stay ~1 year in the future.
 * Last updated: January 2025 → Set to January 2026
 * Next review: January 2026
 */
const REFERENCE_YEAR = 2026
export const PREVIEW_REFERENCE_DATE = new Date(
  `${REFERENCE_YEAR}-01-15T12:00:00Z`
)

/** Calculate a future date relative to the reference date */
export const getFutureDate = (daysFromNow: number): Date => {
  return new Date(
    PREVIEW_REFERENCE_DATE.getTime() + daysFromNow * TIME_MS.ONE_DAY
  )
}

// ============================================================================
// Mock Entities
// ============================================================================

export const mockOrganization = {
  name: 'Acme Corp',
  id: 'org_mock123',
  logoUrl: undefined,
} as const

export const mockCustomer = {
  name: 'John Doe',
  id: 'cus_mock123',
  externalId: 'ext_cus_123',
} as const

// ============================================================================
// Mock Line Items
// ============================================================================

export const mockOrderLineItems = [
  {
    name: 'Pro Plan Subscription',
    price: MOCK_PRICES.ORDER_ITEM_1,
    quantity: 1,
  },
  {
    name: 'Additional API Calls',
    price: MOCK_PRICES.ORDER_ITEM_2,
    quantity: 1,
  },
] as const

export const mockPaymentFailedLineItems = [
  {
    name: 'Pro Plan Subscription',
    price: MOCK_PRICES.PRO_PLAN,
    quantity: 1,
  },
] as const

// ============================================================================
// Mock Subscription Items (for adjusted emails)
// ============================================================================

export const createSubscriptionItems = (isUpgrade: boolean) => ({
  previousItems: [
    {
      name: isUpgrade ? 'Basic Plan' : 'Pro Plan',
      unitPrice: isUpgrade
        ? MOCK_PRICES.BASIC_PLAN
        : MOCK_PRICES.PRO_PLAN,
      quantity: 1,
    },
  ],
  newItems: [
    {
      name: isUpgrade ? 'Pro Plan' : 'Basic Plan',
      unitPrice: isUpgrade
        ? MOCK_PRICES.PRO_PLAN
        : MOCK_PRICES.BASIC_PLAN,
      quantity: 1,
    },
  ],
  previousTotalPrice: isUpgrade
    ? MOCK_PRICES.BASIC_PLAN
    : MOCK_PRICES.PRO_PLAN,
  newTotalPrice: isUpgrade
    ? MOCK_PRICES.PRO_PLAN
    : MOCK_PRICES.BASIC_PLAN,
  prorationAmount: isUpgrade ? MOCK_PRICES.PRORATION_AMOUNT : null,
})

// ============================================================================
// Common Props
// ============================================================================

/** Common organization props used across all email templates */
export const commonOrganizationProps = {
  organizationName: mockOrganization.name,
  organizationLogoUrl: mockOrganization.logoUrl,
  organizationId: mockOrganization.id,
} as const

/** Common customer props used across most email templates */
export const commonCustomerProps = {
  customerName: mockCustomer.name,
  customerId: mockCustomer.id,
  customerExternalId: mockCustomer.externalId,
} as const

/** Default interval for subscription emails */
export const DEFAULT_INTERVAL = IntervalUnit.Month

// ============================================================================
// Type Definitions for Email Preview Config
// ============================================================================

export const EMAIL_TYPES = [
  'order-receipt',
  'subscription-created',
  'subscription-upgraded',
  'subscription-adjusted-upgrade',
  'subscription-adjusted-downgrade',
  'subscription-canceled',
  'subscription-cancellation-scheduled',
  'payment-failed',
  'billing-portal-otp',
  'billing-portal-magic-link',
  'forgot-password',
  // Organization notifications (internal/admin facing)
  'org-subscription-created',
  'org-subscription-canceled',
  'org-subscription-cancellation-scheduled',
  // Purchase access
  'purchase-access-token',
  // Trial-related emails
  'trial-ending-soon',
  'trial-expired-no-payment',
] as const

export type EmailType = (typeof EMAIL_TYPES)[number]

/** Type guard to validate email type from query params */
export const isValidEmailType = (
  value: unknown
): value is EmailType => {
  return EMAIL_TYPES.includes(value as EmailType)
}

/** Get validated email type with fallback */
export const getEmailType = (value: unknown): EmailType => {
  return isValidEmailType(value) ? value : 'order-receipt'
}

// ============================================================================
// View Types (for distinguishing between email previews and components)
// ============================================================================

export const VIEW_TYPES = ['emails', 'pricing-table'] as const

export type ViewType = (typeof VIEW_TYPES)[number]

/** Type guard to validate view type from query params */
export const isValidViewType = (
  value: unknown
): value is ViewType => {
  return VIEW_TYPES.includes(value as ViewType)
}

/** Get validated view type with fallback */
export const getViewType = (value: unknown): ViewType => {
  return isValidViewType(value) ? value : 'emails'
}

// ============================================================================
// Parsed Search Params (shared across page.tsx and DemoAppSidebar.tsx)
// ============================================================================

/**
 * Parsed and validated search params used throughout the demo route.
 * Exported to avoid type duplication.
 */
export interface ParsedParams {
  isMoR: boolean
  emailType: EmailType
  isTrialing: boolean
  livemode: boolean
  hasRetry: boolean
  viewType: ViewType
  hasPaymentMethod: boolean
}

// ============================================================================
// Trigger Documentation Types & Data
// ============================================================================

export interface TriggerInfo {
  /** Webhook event name (e.g., "subscription.created") */
  event: string
  /** Human-readable description of when this email is sent */
  description: string
  /** Conditions that must be met for the email to send */
  conditions?: string[]
  /** Related webhook events that may also fire */
  relatedEvents?: string[]
  /** Link to API documentation */
  docsUrl?: string
  /** Sample webhook payload (JSON string) */
  samplePayload: string
}

export const TRIGGER_DOCS: Record<EmailType, TriggerInfo> = {
  'subscription-created': {
    event: 'subscription.created',
    description:
      'Sent immediately when a customer successfully subscribes to a paid plan and their payment method is confirmed.',
    conditions: [
      'Customer has a valid payment method on file',
      'Subscription status is "active"',
      'This is a new subscription (not a reactivation)',
    ],
    relatedEvents: ['invoice.paid', 'payment_method.attached'],
    docsUrl:
      'https://docs.flowglad.com/webhooks/subscription-created',
    samplePayload: JSON.stringify(
      {
        id: 'evt_1abc123',
        type: 'subscription.created',
        data: {
          object: {
            id: 'sub_1xyz789',
            customer: 'cus_abc123',
            status: 'active',
            plan: {
              id: 'plan_pro',
              name: 'Pro Plan',
              amount: 2900,
              currency: 'usd',
              interval: 'month',
            },
            current_period_end: '2024-02-15T00:00:00Z',
            default_payment_method: 'pm_card_visa',
          },
        },
        created: '2024-01-15T12:00:00Z',
      },
      null,
      2
    ),
  },

  'subscription-upgraded': {
    event: 'subscription.updated',
    description:
      'Sent when a customer upgrades from a free plan to a paid plan, or starts a trial on a paid plan.',
    conditions: [
      'Previous plan was free ($0) or null',
      'New plan has a price greater than $0',
      'Payment method is valid (or trial is active)',
    ],
    relatedEvents: ['subscription.created', 'invoice.created'],
    docsUrl:
      'https://docs.flowglad.com/webhooks/subscription-updated',
    samplePayload: JSON.stringify(
      {
        id: 'evt_2def456',
        type: 'subscription.updated',
        data: {
          object: {
            id: 'sub_1xyz789',
            customer: 'cus_abc123',
            status: 'active',
            plan: {
              id: 'plan_pro',
              name: 'Pro Plan',
              amount: 2900,
              currency: 'usd',
            },
          },
          previous_attributes: {
            plan: {
              id: 'plan_free',
              name: 'Free Plan',
              amount: 0,
            },
          },
        },
      },
      null,
      2
    ),
  },

  'subscription-adjusted-upgrade': {
    event: 'subscription.updated',
    description:
      'Sent when a customer changes from one paid plan to a higher-priced paid plan.',
    conditions: [
      'Both previous and new plans are paid (price > $0)',
      'New plan price is greater than previous plan price',
      'Proration is calculated and applied',
    ],
    relatedEvents: ['invoice.created', 'invoice.paid'],
    docsUrl:
      'https://docs.flowglad.com/webhooks/subscription-updated',
    samplePayload: JSON.stringify(
      {
        id: 'evt_3ghi789',
        type: 'subscription.updated',
        data: {
          object: {
            id: 'sub_1xyz789',
            plan: { name: 'Enterprise Plan', amount: 9900 },
          },
          previous_attributes: {
            plan: { name: 'Pro Plan', amount: 2900 },
          },
        },
      },
      null,
      2
    ),
  },

  'subscription-adjusted-downgrade': {
    event: 'subscription.updated',
    description:
      'Sent when a customer changes from one paid plan to a lower-priced paid plan.',
    conditions: [
      'Both previous and new plans are paid (price > $0)',
      'New plan price is less than previous plan price',
      'Change typically takes effect at end of billing period',
    ],
    relatedEvents: ['subscription.pending_update_applied'],
    docsUrl:
      'https://docs.flowglad.com/webhooks/subscription-updated',
    samplePayload: JSON.stringify(
      {
        id: 'evt_4jkl012',
        type: 'subscription.updated',
        data: {
          object: {
            id: 'sub_1xyz789',
            plan: { name: 'Starter Plan', amount: 900 },
            pending_update: null,
          },
          previous_attributes: {
            plan: { name: 'Pro Plan', amount: 2900 },
          },
        },
      },
      null,
      2
    ),
  },

  'subscription-canceled': {
    event: 'subscription.canceled',
    description:
      'Sent when a subscription is immediately canceled (not scheduled for end of period).',
    conditions: [
      'Subscription status changes to "canceled"',
      'cancel_at_period_end is false (immediate cancellation)',
      'Access is revoked immediately',
    ],
    relatedEvents: ['customer.subscription.deleted'],
    docsUrl:
      'https://docs.flowglad.com/webhooks/subscription-canceled',
    samplePayload: JSON.stringify(
      {
        id: 'evt_5mno345',
        type: 'subscription.canceled',
        data: {
          object: {
            id: 'sub_1xyz789',
            customer: 'cus_abc123',
            status: 'canceled',
            canceled_at: '2024-01-15T12:00:00Z',
            cancel_at_period_end: false,
          },
        },
      },
      null,
      2
    ),
  },

  'subscription-cancellation-scheduled': {
    event: 'subscription.updated',
    description:
      'Sent when a customer schedules their subscription to cancel at the end of the current billing period.',
    conditions: [
      'cancel_at_period_end is set to true',
      'Subscription remains active until period end',
      'Customer retains access until scheduled date',
    ],
    relatedEvents: [
      'subscription.canceled (fires on the scheduled date)',
    ],
    docsUrl:
      'https://docs.flowglad.com/webhooks/subscription-updated',
    samplePayload: JSON.stringify(
      {
        id: 'evt_6pqr678',
        type: 'subscription.updated',
        data: {
          object: {
            id: 'sub_1xyz789',
            status: 'active',
            cancel_at_period_end: true,
            cancel_at: '2024-02-15T00:00:00Z',
            current_period_end: '2024-02-15T00:00:00Z',
          },
          previous_attributes: {
            cancel_at_period_end: false,
          },
        },
      },
      null,
      2
    ),
  },

  'payment-failed': {
    event: 'invoice.payment_failed',
    description: 'Sent when a payment attempt fails for an invoice.',
    conditions: [
      'Payment attempt was made and declined',
      'Invoice status is "open" or "past_due"',
      'Automatic retry may be scheduled',
    ],
    relatedEvents: ['charge.failed', 'payment_intent.payment_failed'],
    docsUrl:
      'https://docs.flowglad.com/webhooks/invoice-payment-failed',
    samplePayload: JSON.stringify(
      {
        id: 'evt_7stu901',
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'inv_abc123',
            customer: 'cus_abc123',
            amount_due: 2900,
            currency: 'usd',
            status: 'open',
            next_payment_attempt: '2024-01-18T12:00:00Z',
            last_payment_error: {
              code: 'card_declined',
              message: 'Your card was declined.',
            },
          },
        },
      },
      null,
      2
    ),
  },

  'order-receipt': {
    event: 'invoice.paid',
    description: 'Sent when an invoice is successfully paid.',
    conditions: [
      'Payment was successful',
      'Invoice status is "paid"',
      'Applies to both one-time and recurring charges',
    ],
    relatedEvents: ['charge.succeeded', 'payment_intent.succeeded'],
    docsUrl: 'https://docs.flowglad.com/webhooks/invoice-paid',
    samplePayload: JSON.stringify(
      {
        id: 'evt_8vwx234',
        type: 'invoice.paid',
        data: {
          object: {
            id: 'inv_abc123',
            customer: 'cus_abc123',
            amount_paid: 2900,
            currency: 'usd',
            status: 'paid',
            paid_at: '2024-01-15T12:00:00Z',
          },
        },
      },
      null,
      2
    ),
  },

  'billing-portal-otp': {
    event: 'billing_portal.otp_requested',
    description:
      'Sent when a customer requests a one-time password to access the billing portal.',
    conditions: [
      'Customer email is verified',
      'OTP authentication is enabled for the organization',
      'Request originates from billing portal login',
    ],
    docsUrl:
      'https://docs.flowglad.com/billing-portal/authentication',
    samplePayload: JSON.stringify(
      {
        id: 'evt_9yza567',
        type: 'billing_portal.otp_requested',
        data: {
          customer_id: 'cus_abc123',
          email: 'john@example.com',
          expires_at: '2024-01-15T12:10:00Z',
        },
      },
      null,
      2
    ),
  },

  'billing-portal-magic-link': {
    event: 'billing_portal.magic_link_requested',
    description:
      'Sent when a customer requests a magic link to access the billing portal.',
    conditions: [
      'Customer email is verified',
      'Magic link authentication is enabled',
      'Link expires after 15 minutes',
    ],
    docsUrl:
      'https://docs.flowglad.com/billing-portal/authentication',
    samplePayload: JSON.stringify(
      {
        id: 'evt_0bcd890',
        type: 'billing_portal.magic_link_requested',
        data: {
          customer_id: 'cus_abc123',
          email: 'john@example.com',
          expires_at: '2024-01-15T12:15:00Z',
        },
      },
      null,
      2
    ),
  },

  'forgot-password': {
    event: 'user.password_reset_requested',
    description: 'Sent when a user requests to reset their password.',
    conditions: [
      'Email matches an existing user account',
      'Account is not locked or disabled',
      'Reset link expires after 1 hour',
    ],
    docsUrl:
      'https://docs.flowglad.com/authentication/password-reset',
    samplePayload: JSON.stringify(
      {
        id: 'evt_1efg123',
        type: 'user.password_reset_requested',
        data: {
          user_id: 'usr_abc123',
          email: 'john@example.com',
          expires_at: '2024-01-15T13:00:00Z',
        },
      },
      null,
      2
    ),
  },

  'org-subscription-created': {
    event: 'subscription.created',
    description:
      'Internal notification sent to organization admins when a new customer subscribes.',
    conditions: [
      'Organization notifications are enabled',
      'At least one admin email is configured',
      'New subscription is created (not updated)',
    ],
    relatedEvents: ['subscription.created (customer-facing)'],
    docsUrl: 'https://docs.flowglad.com/notifications/organization',
    samplePayload: JSON.stringify(
      {
        id: 'evt_2hij456',
        type: 'subscription.created',
        data: {
          object: {
            id: 'sub_1xyz789',
            customer: {
              id: 'cus_abc123',
              name: 'John Doe',
              email: 'john@example.com',
            },
            plan: { name: 'Pro Plan' },
          },
        },
        _internal: { notification_type: 'organization_admin' },
      },
      null,
      2
    ),
  },

  'org-subscription-canceled': {
    event: 'subscription.canceled',
    description:
      'Internal notification sent to organization admins when a customer cancels.',
    conditions: [
      'Organization notifications are enabled',
      'Subscription is immediately canceled',
    ],
    docsUrl: 'https://docs.flowglad.com/notifications/organization',
    samplePayload: JSON.stringify(
      {
        id: 'evt_3klm789',
        type: 'subscription.canceled',
        data: {
          object: {
            customer: { name: 'John Doe', email: 'john@example.com' },
            plan: { name: 'Pro Plan' },
            canceled_at: '2024-01-15T12:00:00Z',
          },
        },
        _internal: { notification_type: 'organization_admin' },
      },
      null,
      2
    ),
  },

  'org-subscription-cancellation-scheduled': {
    event: 'subscription.updated',
    description:
      'Internal notification sent to organization admins when a customer schedules cancellation.',
    conditions: [
      'Organization notifications are enabled',
      'cancel_at_period_end changed to true',
    ],
    docsUrl: 'https://docs.flowglad.com/notifications/organization',
    samplePayload: JSON.stringify(
      {
        id: 'evt_4nop012',
        type: 'subscription.updated',
        data: {
          object: {
            customer: { name: 'John Doe' },
            cancel_at_period_end: true,
            cancel_at: '2024-02-15T00:00:00Z',
          },
        },
        _internal: { notification_type: 'organization_admin' },
      },
      null,
      2
    ),
  },

  'purchase-access-token': {
    event: 'purchase.access_requested',
    description:
      'Sent when a customer requests access to a previous purchase via magic link.',
    conditions: [
      'Email matches a previous purchase',
      'Purchase is still accessible',
      'Magic link expires after 15 minutes',
    ],
    docsUrl: 'https://docs.flowglad.com/purchases/access',
    samplePayload: JSON.stringify(
      {
        id: 'evt_5qrs345',
        type: 'purchase.access_requested',
        data: {
          purchase_id: 'pur_abc123',
          email: 'john@example.com',
          expires_at: '2024-01-15T12:15:00Z',
        },
      },
      null,
      2
    ),
  },

  'trial-ending-soon': {
    event: 'subscription.trial_will_end',
    description:
      'Sent when a trial subscription is about to end, typically 3 days before expiration.',
    conditions: [
      'Subscription has an active trial',
      'Trial end date is within the reminder window (e.g., 3 days)',
      'Customer has not yet been notified for this trial period',
    ],
    relatedEvents: ['subscription.updated', 'subscription.canceled'],
    docsUrl: 'https://docs.flowglad.com/webhooks/subscription-trial-will-end',
    samplePayload: JSON.stringify(
      {
        id: 'evt_6tuv678',
        type: 'subscription.trial_will_end',
        data: {
          object: {
            id: 'sub_1xyz789',
            customer: 'cus_abc123',
            status: 'trialing',
            trial_end: '2024-01-18T00:00:00Z',
            plan: {
              id: 'plan_pro',
              name: 'Pro Plan',
              amount: 2900,
              currency: 'usd',
              interval: 'month',
            },
            default_payment_method: 'pm_card_visa',
          },
        },
        created: '2024-01-15T12:00:00Z',
      },
      null,
      2
    ),
  },

  'trial-expired-no-payment': {
    event: 'subscription.updated',
    description:
      'Sent when a trial expires and the customer has no payment method on file.',
    conditions: [
      'Trial period has ended',
      'No payment method is attached to the subscription',
      'Subscription status changes to inactive or past_due',
    ],
    relatedEvents: ['subscription.canceled', 'customer.subscription.paused'],
    docsUrl: 'https://docs.flowglad.com/webhooks/subscription-trial-expired',
    samplePayload: JSON.stringify(
      {
        id: 'evt_7wxy901',
        type: 'subscription.updated',
        data: {
          object: {
            id: 'sub_1xyz789',
            customer: 'cus_abc123',
            status: 'past_due',
            trial_end: '2024-01-15T00:00:00Z',
            plan: {
              id: 'plan_pro',
              name: 'Pro Plan',
              amount: 2900,
              currency: 'usd',
            },
            default_payment_method: null,
          },
          previous_attributes: {
            status: 'trialing',
          },
        },
        created: '2024-01-15T00:00:01Z',
      },
      null,
      2
    ),
  },
}
