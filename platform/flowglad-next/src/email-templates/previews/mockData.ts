import { CurrencyCode, IntervalUnit } from '@db-core/enums'
import type { EmailType, EmailTypeMap } from '@/utils/email/registry'

// ============================================================================
// Constants
// ============================================================================

/**
 * Fixed reference date for consistent preview rendering.
 * Using a fixed date prevents visual regression test flakiness.
 *
 * MAINTENANCE NOTE: Update this date annually to stay ~1 year in the future.
 * Last updated: January 2026 → Set to January 2027
 */
const REFERENCE_YEAR = 2027
export const PREVIEW_REFERENCE_DATE = new Date(
  `${REFERENCE_YEAR}-01-15T12:00:00Z`
)

/** Time constants in milliseconds */
const TIME_MS = {
  ONE_DAY: 24 * 60 * 60 * 1000,
}

/** Calculate a future date relative to the reference date */
const getFutureDate = (daysFromNow: number): Date => {
  return new Date(
    PREVIEW_REFERENCE_DATE.getTime() + daysFromNow * TIME_MS.ONE_DAY
  )
}

/** Mock prices in cents */
const MOCK_PRICES = {
  FREE: 0,
  BASIC_PLAN: 1900, // $19.00
  PRO_PLAN: 2900, // $29.00
  PRORATION_AMOUNT: 1000, // $10.00
  ORDER_ITEM_1: 4900, // $49.00
  ORDER_ITEM_2: 5000, // $50.00
  TAX_AMOUNT: 232, // $2.32
}

// ============================================================================
// Mock Entities
// ============================================================================

const mockOrganization = {
  name: 'Acme Corp',
  id: 'org_mock123',
  logoUrl: undefined,
}

const mockCustomer = {
  name: 'John Doe',
  email: 'john@example.com',
  id: 'cus_mock123',
  externalId: 'ext_cus_123',
}

// ============================================================================
// Preview Data Type
// ============================================================================

/**
 * Email previews mapped by email type, with variants for each type.
 * Each email type has at least a 'default' variant.
 */
export type EmailPreviewData = {
  [K in EmailType]: Record<string, EmailTypeMap[K]>
}

// ============================================================================
// Preview Data
// ============================================================================

export const EMAIL_PREVIEWS: EmailPreviewData = {
  // =========================================================================
  // Customer Subscription Emails
  // =========================================================================

  'customer.subscription.created': {
    default: {
      customerName: mockCustomer.name,
      organizationName: mockOrganization.name,
      organizationLogoUrl: mockOrganization.logoUrl,
      organizationId: mockOrganization.id,
      customerExternalId: mockCustomer.externalId,
      planName: 'Pro Plan',
      price: MOCK_PRICES.PRO_PLAN,
      currency: CurrencyCode.USD,
      interval: IntervalUnit.Month,
      nextBillingDate: getFutureDate(30),
      paymentMethodLast4: '4242',
      dateConfirmed: PREVIEW_REFERENCE_DATE,
    },
    withTrial: {
      customerName: mockCustomer.name,
      organizationName: mockOrganization.name,
      organizationLogoUrl: mockOrganization.logoUrl,
      organizationId: mockOrganization.id,
      customerExternalId: mockCustomer.externalId,
      planName: 'Pro Plan',
      price: MOCK_PRICES.PRO_PLAN,
      currency: CurrencyCode.USD,
      interval: IntervalUnit.Month,
      paymentMethodLast4: '4242',
      trial: {
        trialEndDate: getFutureDate(14),
        trialDurationDays: 14,
      },
      dateConfirmed: PREVIEW_REFERENCE_DATE,
    },
    yearly: {
      customerName: mockCustomer.name,
      organizationName: mockOrganization.name,
      organizationId: mockOrganization.id,
      customerExternalId: mockCustomer.externalId,
      planName: 'Enterprise Plan',
      price: 29900,
      currency: CurrencyCode.USD,
      interval: IntervalUnit.Year,
      nextBillingDate: getFutureDate(365),
      paymentMethodLast4: '1234',
      dateConfirmed: PREVIEW_REFERENCE_DATE,
    },
  },

  'customer.subscription.canceled': {
    default: {
      customerName: mockCustomer.name,
      organizationName: mockOrganization.name,
      organizationLogoUrl: mockOrganization.logoUrl,
      organizationId: mockOrganization.id,
      customerId: mockCustomer.id,
      subscriptionName: 'Pro Plan',
      cancellationDate: PREVIEW_REFERENCE_DATE,
      livemode: true,
    },
  },

  'customer.subscription.cancellation-scheduled': {
    default: {
      customerName: mockCustomer.name,
      organizationName: mockOrganization.name,
      organizationLogoUrl: mockOrganization.logoUrl,
      organizationId: mockOrganization.id,
      customerId: mockCustomer.id,
      subscriptionName: 'Pro Plan',
      scheduledCancellationDate: getFutureDate(30),
      livemode: true,
    },
  },

  'customer.subscription.adjusted': {
    default: {
      customerName: mockCustomer.name,
      organizationName: mockOrganization.name,
      organizationLogoUrl: mockOrganization.logoUrl,
      organizationId: mockOrganization.id,
      adjustmentType: 'upgrade',
      previousItems: [
        {
          name: 'Basic Plan',
          unitPrice: MOCK_PRICES.BASIC_PLAN,
          quantity: 1,
        },
      ],
      newItems: [
        {
          name: 'Pro Plan',
          unitPrice: MOCK_PRICES.PRO_PLAN,
          quantity: 1,
        },
      ],
      previousTotalPrice: MOCK_PRICES.BASIC_PLAN,
      newTotalPrice: MOCK_PRICES.PRO_PLAN,
      currency: CurrencyCode.USD,
      interval: IntervalUnit.Month,
      prorationAmount: MOCK_PRICES.PRORATION_AMOUNT,
      effectiveDate: PREVIEW_REFERENCE_DATE,
      nextBillingDate: getFutureDate(30),
    },
    upgrade: {
      customerName: mockCustomer.name,
      organizationName: mockOrganization.name,
      organizationLogoUrl: mockOrganization.logoUrl,
      organizationId: mockOrganization.id,
      adjustmentType: 'upgrade',
      previousItems: [
        {
          name: 'Basic Plan',
          unitPrice: MOCK_PRICES.BASIC_PLAN,
          quantity: 1,
        },
      ],
      newItems: [
        {
          name: 'Pro Plan',
          unitPrice: MOCK_PRICES.PRO_PLAN,
          quantity: 1,
        },
      ],
      previousTotalPrice: MOCK_PRICES.BASIC_PLAN,
      newTotalPrice: MOCK_PRICES.PRO_PLAN,
      currency: CurrencyCode.USD,
      interval: IntervalUnit.Month,
      prorationAmount: MOCK_PRICES.PRORATION_AMOUNT,
      effectiveDate: PREVIEW_REFERENCE_DATE,
      nextBillingDate: getFutureDate(30),
    },
    downgrade: {
      customerName: mockCustomer.name,
      organizationName: mockOrganization.name,
      organizationLogoUrl: mockOrganization.logoUrl,
      organizationId: mockOrganization.id,
      adjustmentType: 'downgrade',
      previousItems: [
        {
          name: 'Pro Plan',
          unitPrice: MOCK_PRICES.PRO_PLAN,
          quantity: 1,
        },
      ],
      newItems: [
        {
          name: 'Basic Plan',
          unitPrice: MOCK_PRICES.BASIC_PLAN,
          quantity: 1,
        },
      ],
      previousTotalPrice: MOCK_PRICES.PRO_PLAN,
      newTotalPrice: MOCK_PRICES.BASIC_PLAN,
      currency: CurrencyCode.USD,
      interval: IntervalUnit.Month,
      prorationAmount: null,
      effectiveDate: getFutureDate(30),
      nextBillingDate: getFutureDate(30),
    },
  },

  'customer.subscription.upgraded': {
    default: {
      customerName: mockCustomer.name,
      organizationName: mockOrganization.name,
      organizationLogoUrl: mockOrganization.logoUrl,
      organizationId: mockOrganization.id,
      customerExternalId: mockCustomer.externalId,
      previousPlanName: 'Free Plan',
      previousPlanPrice: MOCK_PRICES.FREE,
      previousPlanCurrency: CurrencyCode.USD,
      newPlanName: 'Pro Plan',
      price: MOCK_PRICES.PRO_PLAN,
      currency: CurrencyCode.USD,
      interval: IntervalUnit.Month,
      nextBillingDate: getFutureDate(30),
      paymentMethodLast4: '4242',
      dateConfirmed: PREVIEW_REFERENCE_DATE,
    },
    withTrial: {
      customerName: mockCustomer.name,
      organizationName: mockOrganization.name,
      organizationId: mockOrganization.id,
      customerExternalId: mockCustomer.externalId,
      previousPlanName: 'Free Plan',
      previousPlanPrice: MOCK_PRICES.FREE,
      previousPlanCurrency: CurrencyCode.USD,
      newPlanName: 'Pro Plan',
      price: MOCK_PRICES.PRO_PLAN,
      currency: CurrencyCode.USD,
      interval: IntervalUnit.Month,
      nextBillingDate: getFutureDate(14),
      paymentMethodLast4: '4242',
      trialing: true,
      dateConfirmed: PREVIEW_REFERENCE_DATE,
    },
  },

  // =========================================================================
  // Customer Payment Emails
  // =========================================================================

  'customer.payment.receipt': {
    default: {
      invoiceNumber: 'INV-2027-001',
      orderDate: 'January 15, 2027',
      invoice: {
        subtotal: MOCK_PRICES.ORDER_ITEM_1 + MOCK_PRICES.ORDER_ITEM_2,
        taxAmount: MOCK_PRICES.TAX_AMOUNT,
        currency: CurrencyCode.USD,
      },
      organizationLogoUrl: mockOrganization.logoUrl,
      organizationId: mockOrganization.id,
      customerId: mockCustomer.id,
      lineItems: [
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
      ],
      organizationName: mockOrganization.name,
      livemode: true,
    },
    merchantOfRecord: {
      invoiceNumber: 'INV-2027-002',
      orderDate: 'January 15, 2027',
      invoice: {
        subtotal: MOCK_PRICES.PRO_PLAN,
        taxAmount: MOCK_PRICES.TAX_AMOUNT,
        currency: CurrencyCode.USD,
      },
      organizationId: mockOrganization.id,
      customerId: mockCustomer.id,
      lineItems: [
        {
          name: 'Pro Plan Subscription',
          price: MOCK_PRICES.PRO_PLAN,
          quantity: 1,
        },
      ],
      organizationName: mockOrganization.name,
      livemode: true,
      isMoR: true,
    },
  },

  'customer.payment.failed': {
    default: {
      invoiceNumber: 'INV-2027-003',
      orderDate: PREVIEW_REFERENCE_DATE,
      invoice: {
        subtotal: MOCK_PRICES.PRO_PLAN,
        taxAmount: MOCK_PRICES.TAX_AMOUNT,
        currency: CurrencyCode.USD,
      },
      organizationName: mockOrganization.name,
      organizationLogoUrl: mockOrganization.logoUrl,
      lineItems: [
        {
          name: 'Pro Plan Subscription',
          price: MOCK_PRICES.PRO_PLAN,
          quantity: 1,
        },
      ],
      retryDate: getFutureDate(3),
      failureReason: 'Your card was declined.',
      customerPortalUrl: 'https://billing.example.com/portal',
      livemode: true,
    },
    noRetry: {
      invoiceNumber: 'INV-2027-004',
      orderDate: PREVIEW_REFERENCE_DATE,
      invoice: {
        subtotal: MOCK_PRICES.PRO_PLAN,
        taxAmount: MOCK_PRICES.TAX_AMOUNT,
        currency: CurrencyCode.USD,
      },
      organizationName: mockOrganization.name,
      lineItems: [
        {
          name: 'Pro Plan Subscription',
          price: MOCK_PRICES.PRO_PLAN,
          quantity: 1,
        },
      ],
      failureReason: 'Card expired.',
      customerPortalUrl: 'https://billing.example.com/portal',
      livemode: true,
    },
  },

  // =========================================================================
  // Customer Trial Emails
  // =========================================================================

  'customer.trial.expired-no-payment': {
    default: {
      customerName: mockCustomer.name,
      organizationName: mockOrganization.name,
      organizationLogoUrl: mockOrganization.logoUrl,
      organizationId: mockOrganization.id,
      customerId: mockCustomer.id,
      productName: 'Pro Plan',
      livemode: true,
    },
  },

  // =========================================================================
  // Customer Auth Emails
  // =========================================================================

  'customer.auth.billing-portal-magic-link': {
    default: {
      customerName: mockCustomer.name,
      email: mockCustomer.email,
      url: 'https://billing.example.com/auth/abc123',
      organizationName: mockOrganization.name,
      livemode: true,
    },
    noCustomerName: {
      email: mockCustomer.email,
      url: 'https://billing.example.com/auth/abc123',
      organizationName: mockOrganization.name,
      livemode: true,
    },
  },

  'customer.auth.billing-portal-otp': {
    default: {
      customerName: mockCustomer.name,
      email: mockCustomer.email,
      otp: '123456',
      organizationName: mockOrganization.name,
      livemode: true,
    },
    noCustomerName: {
      email: mockCustomer.email,
      otp: '987654',
      organizationName: mockOrganization.name,
      livemode: true,
    },
  },

  'customer.auth.forgot-password': {
    default: {
      user: mockCustomer.email,
      url: 'https://app.flowglad.com/reset-password?token=abc123',
    },
  },

  'customer.auth.purchase-access-token': {
    default: {
      magicLink: 'https://app.flowglad.com/purchase/access/abc123',
      livemode: true,
    },
  },

  // =========================================================================
  // Organization Subscription Emails
  // =========================================================================

  'organization.subscription.created': {
    default: {
      organizationName: mockOrganization.name,
      subscriptionName: 'Pro Plan',
      customerId: mockCustomer.id,
      customerName: mockCustomer.name,
      customerEmail: mockCustomer.email,
      livemode: true,
    },
  },

  'organization.subscription.canceled': {
    default: {
      organizationName: mockOrganization.name,
      subscriptionName: 'Pro Plan',
      customerId: mockCustomer.id,
      customerName: mockCustomer.name,
      customerEmail: mockCustomer.email,
      cancellationDate: PREVIEW_REFERENCE_DATE,
      livemode: true,
    },
  },

  'organization.subscription.cancellation-scheduled': {
    default: {
      organizationName: mockOrganization.name,
      subscriptionName: 'Pro Plan',
      customerId: mockCustomer.id,
      customerName: mockCustomer.name,
      customerEmail: mockCustomer.email,
      scheduledCancellationDate: getFutureDate(30),
      livemode: true,
    },
  },

  'organization.subscription.adjusted': {
    default: {
      organizationName: mockOrganization.name,
      customerName: mockCustomer.name,
      customerEmail: mockCustomer.email,
      customerId: mockCustomer.id,
      adjustmentType: 'upgrade',
      previousItems: [
        {
          name: 'Basic Plan',
          unitPrice: MOCK_PRICES.BASIC_PLAN,
          quantity: 1,
        },
      ],
      newItems: [
        {
          name: 'Pro Plan',
          unitPrice: MOCK_PRICES.PRO_PLAN,
          quantity: 1,
        },
      ],
      previousTotalPrice: MOCK_PRICES.BASIC_PLAN,
      newTotalPrice: MOCK_PRICES.PRO_PLAN,
      currency: CurrencyCode.USD,
      prorationAmount: MOCK_PRICES.PRORATION_AMOUNT,
      effectiveDate: PREVIEW_REFERENCE_DATE,
      livemode: true,
    },
    upgrade: {
      organizationName: mockOrganization.name,
      customerName: mockCustomer.name,
      customerEmail: mockCustomer.email,
      customerId: mockCustomer.id,
      adjustmentType: 'upgrade',
      previousItems: [
        {
          name: 'Basic Plan',
          unitPrice: MOCK_PRICES.BASIC_PLAN,
          quantity: 1,
        },
      ],
      newItems: [
        {
          name: 'Pro Plan',
          unitPrice: MOCK_PRICES.PRO_PLAN,
          quantity: 1,
        },
      ],
      previousTotalPrice: MOCK_PRICES.BASIC_PLAN,
      newTotalPrice: MOCK_PRICES.PRO_PLAN,
      currency: CurrencyCode.USD,
      prorationAmount: MOCK_PRICES.PRORATION_AMOUNT,
      effectiveDate: PREVIEW_REFERENCE_DATE,
      livemode: true,
    },
    downgrade: {
      organizationName: mockOrganization.name,
      customerName: mockCustomer.name,
      customerEmail: mockCustomer.email,
      customerId: mockCustomer.id,
      adjustmentType: 'downgrade',
      previousItems: [
        {
          name: 'Pro Plan',
          unitPrice: MOCK_PRICES.PRO_PLAN,
          quantity: 1,
        },
      ],
      newItems: [
        {
          name: 'Basic Plan',
          unitPrice: MOCK_PRICES.BASIC_PLAN,
          quantity: 1,
        },
      ],
      previousTotalPrice: MOCK_PRICES.PRO_PLAN,
      newTotalPrice: MOCK_PRICES.BASIC_PLAN,
      currency: CurrencyCode.USD,
      prorationAmount: null,
      effectiveDate: getFutureDate(30),
      livemode: true,
    },
  },

  // =========================================================================
  // Organization Payment Emails
  // =========================================================================

  'organization.payment.succeeded': {
    default: {
      organizationName: mockOrganization.name,
      amount: MOCK_PRICES.PRO_PLAN,
      invoiceNumber: 'INV-2027-001',
      currency: CurrencyCode.USD,
      customerId: mockCustomer.id,
      customerName: mockCustomer.name,
      customerEmail: mockCustomer.email,
      livemode: true,
    },
  },

  'organization.payment.failed': {
    default: {
      organizationName: mockOrganization.name,
      amount: MOCK_PRICES.PRO_PLAN,
      invoiceNumber: 'INV-2027-002',
      currency: CurrencyCode.USD,
      customerId: mockCustomer.id,
      customerName: mockCustomer.name,
      failureReason: 'Card was declined.',
      livemode: true,
    },
    noInvoice: {
      organizationName: mockOrganization.name,
      amount: MOCK_PRICES.PRO_PLAN,
      currency: CurrencyCode.USD,
      customerId: mockCustomer.id,
      customerName: mockCustomer.name,
      livemode: true,
    },
  },

  'organization.payment.awaiting-confirmation': {
    default: {
      organizationName: mockOrganization.name,
      amount: MOCK_PRICES.PRO_PLAN,
      invoiceNumber: 'INV-2027-003',
      customerId: mockCustomer.id,
      currency: CurrencyCode.USD,
      customerName: mockCustomer.name,
      livemode: true,
    },
  },

  // =========================================================================
  // Organization Notification Emails
  // =========================================================================

  'organization.notification.payouts-enabled': {
    default: {
      organizationName: mockOrganization.name,
    },
  },

  'organization.notification.onboarding-completed': {
    default: {
      organizationName: mockOrganization.name,
    },
  },

  'organization.notification.invitation': {
    default: {
      organizationName: mockOrganization.name,
      inviterName: 'Jane Smith',
    },
    noInviter: {
      organizationName: mockOrganization.name,
    },
  },

  'organization.notification.csv-export-ready': {
    default: {
      organizationName: mockOrganization.name,
      livemode: true,
    },
  },
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get all variant names for a specific email type.
 */
export const getVariantsForEmailType = (
  emailType: EmailType
): string[] => {
  return Object.keys(EMAIL_PREVIEWS[emailType])
}

/**
 * Get preview data for a specific email type and variant.
 * Defaults to 'default' variant if not specified.
 */
export const getPreviewData = <T extends EmailType>(
  emailType: T,
  variant = 'default'
): EmailTypeMap[T] | undefined => {
  const previews = EMAIL_PREVIEWS[emailType]
  return previews[variant] as EmailTypeMap[T] | undefined
}

/**
 * Get all email types that have preview data.
 */
export const getAllEmailTypesWithPreviews = (): EmailType[] => {
  return Object.keys(EMAIL_PREVIEWS) as EmailType[]
}
