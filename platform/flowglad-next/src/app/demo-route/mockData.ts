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
 */
export const PREVIEW_REFERENCE_DATE = new Date('2024-06-15T12:00:00Z')

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
