/**
 * Stripe Utils Mock for DB Tests
 *
 * Mocks @/utils/stripe to provide configurable mock implementations for db tests.
 * Tests can configure mock behavior per-test via globalThis variables.
 *
 * This follows the pattern established by unkey-utils-mock.ts:
 * - Create mock functions using bun:test's mock()
 * - Store them in globalThis for per-test configuration
 * - Export all functions (mocked + pure) as stripeUtilsMockExports
 */
import { mock } from 'bun:test'
import { Result } from 'better-result'
import type Stripe from 'stripe'

// Also re-export types
export type {
  BillingRunStripeIntentMetadata,
  CheckoutSessionStripeIntentMetadata,
  FeeMetadata,
  StripeAccountOnboardingStatus,
  StripeIntent,
  StripeIntentMetadata,
} from '@/utils/stripe'
// Re-export actual pure functions and types from @/utils/stripe
// These don't make API calls and can be used directly
// Re-export schemas
export {
  billingRunIntentMetadataSchema,
  buildFeeMetadata,
  calculatePlatformApplicationFee,
  checkoutSessionIntentMetadataSchema,
  countableCurrencyAmountToRawStringAmount,
  dateFromStripeTimestamp,
  defaultCurrencyForCountry,
  feeMetadataSchema,
  formatBillingPeriod,
  getCurrencyParts,
  IntentMetadataType,
  isCurrencySupported,
  isCurrencyZeroDecimal,
  paymentMethodFromStripeCharge,
  rawStringAmountToCountableCurrencyAmount,
  stripeCurrencyAmountToHumanReadableCurrencyAmount,
  stripeCurrencyAmountToShortReadableCurrencyAmount,
  stripeIdFromObjectOrId,
  stripeIntentMetadataSchema,
  stripeSupportedCurrencies,
  unitedStatesBankAccountPaymentMethodOptions,
  zeroDecimalCurrencies,
} from '@/utils/stripe'

// ---------------------------------------------------------------------------
// Mock Functions - These are the Stripe API-calling functions that need mocking
// ---------------------------------------------------------------------------

// createPaymentIntentForBillingRun
const mockCreatePaymentIntentForBillingRun =
  mock<
    (params: {
      amount: number
      currency: string
      stripeCustomerId: string
      stripePaymentMethodId: string
      billingPeriodId: string
      billingRunId: string
      feeCalculation: unknown
      organization: unknown
      livemode: boolean
    }) => Promise<
      Result<Stripe.Response<Stripe.PaymentIntent>, Error>
    >
  >()
mockCreatePaymentIntentForBillingRun.mockResolvedValue(
  Result.err(
    new Error(
      '[Test] mockCreatePaymentIntentForBillingRun not configured. Call globalThis.__mockCreatePaymentIntentForBillingRun.mockResolvedValue() in your test.'
    )
  )
)

// confirmPaymentIntentForBillingRun
const mockConfirmPaymentIntentForBillingRun =
  mock<
    (
      paymentIntentId: string,
      livemode: boolean
    ) => Promise<Stripe.Response<Stripe.PaymentIntent>>
  >()
mockConfirmPaymentIntentForBillingRun.mockRejectedValue(
  new Error(
    '[Test] mockConfirmPaymentIntentForBillingRun not configured. Call globalThis.__mockConfirmPaymentIntentForBillingRun.mockResolvedValue() in your test.'
  )
)

// getPaymentIntent
const mockGetPaymentIntent =
  mock<(paymentIntentId: string) => Promise<Stripe.PaymentIntent>>()
mockGetPaymentIntent.mockRejectedValue(
  new Error(
    '[Test] mockGetPaymentIntent not configured. Call globalThis.__mockGetPaymentIntent.mockResolvedValue() in your test.'
  )
)

// getStripeCharge
const mockGetStripeCharge =
  mock<(chargeId: string) => Promise<Stripe.Charge>>()
mockGetStripeCharge.mockRejectedValue(
  new Error(
    '[Test] mockGetStripeCharge not configured. Call globalThis.__mockGetStripeCharge.mockResolvedValue() in your test.'
  )
)

// listRefundsForCharge
const mockListRefundsForCharge =
  mock<
    (
      chargeId: string,
      livemode: boolean
    ) => Promise<Stripe.ApiList<Stripe.Refund>>
  >()
mockListRefundsForCharge.mockResolvedValue({
  object: 'list',
  data: [],
  has_more: false,
  url: '/v1/refunds',
})

// reverseStripeTaxTransaction
const mockReverseStripeTaxTransaction =
  mock<
    (params: {
      stripeTaxTransactionId: string
      reference: string
      livemode: boolean
      mode: 'full' | 'partial'
      flatAmount?: number
    }) => Promise<Stripe.Tax.Transaction | null>
  >()
mockReverseStripeTaxTransaction.mockResolvedValue(null)

// refundPayment
const mockRefundPayment =
  mock<
    (
      stripePaymentIntentId: string,
      partialAmount: number | null,
      livemode: boolean
    ) => Promise<Result<Stripe.Refund, Error>>
  >()
mockRefundPayment.mockResolvedValue(
  Result.err(
    new Error(
      '[Test] mockRefundPayment not configured. Call globalThis.__mockRefundPayment.mockResolvedValue() in your test.'
    )
  )
)

// confirmPaymentIntent (non-billing run version)
const mockConfirmPaymentIntent =
  mock<
    (
      paymentIntentId: string,
      livemode: boolean
    ) => Promise<Stripe.Response<Stripe.PaymentIntent>>
  >()
mockConfirmPaymentIntent.mockRejectedValue(
  new Error(
    '[Test] mockConfirmPaymentIntent not configured. Call globalThis.__mockConfirmPaymentIntent.mockResolvedValue() in your test.'
  )
)

// cancelPaymentIntent
const mockCancelPaymentIntent =
  mock<
    (
      paymentIntentId: string,
      livemode: boolean
    ) => Promise<Stripe.Response<Stripe.PaymentIntent>>
  >()
mockCancelPaymentIntent.mockRejectedValue(
  new Error(
    '[Test] mockCancelPaymentIntent not configured. Call globalThis.__mockCancelPaymentIntent.mockResolvedValue() in your test.'
  )
)

// updatePaymentIntent
const mockUpdatePaymentIntent =
  mock<
    (
      paymentIntentId: string,
      params: unknown,
      livemode: boolean
    ) => Promise<Stripe.Response<Stripe.PaymentIntent>>
  >()
mockUpdatePaymentIntent.mockRejectedValue(
  new Error(
    '[Test] mockUpdatePaymentIntent not configured. Call globalThis.__mockUpdatePaymentIntent.mockResolvedValue() in your test.'
  )
)

// getSetupIntent
const mockGetSetupIntent =
  mock<(setupIntentId: string) => Promise<Stripe.SetupIntent>>()
mockGetSetupIntent.mockRejectedValue(
  new Error(
    '[Test] mockGetSetupIntent not configured. Call globalThis.__mockGetSetupIntent.mockResolvedValue() in your test.'
  )
)

// updateSetupIntent
const mockUpdateSetupIntent =
  mock<
    (
      setupIntentId: string,
      params: unknown,
      livemode: boolean
    ) => Promise<Stripe.SetupIntent>
  >()
mockUpdateSetupIntent.mockRejectedValue(
  new Error(
    '[Test] mockUpdateSetupIntent not configured. Call globalThis.__mockUpdateSetupIntent.mockResolvedValue() in your test.'
  )
)

// createStripeCustomer
const mockCreateStripeCustomer =
  mock<
    (params: {
      email: string
      name: string
      organizationId: string
      livemode: boolean
      createdBy: string
    }) => Promise<Stripe.Customer>
  >()
mockCreateStripeCustomer.mockRejectedValue(
  new Error(
    '[Test] mockCreateStripeCustomer not configured. Call globalThis.__mockCreateStripeCustomer.mockResolvedValue() in your test.'
  )
)

// createAndConfirmPaymentIntentForBillingRun
const mockCreateAndConfirmPaymentIntentForBillingRun =
  mock<
    (params: {
      amount: number
      currency: string
      stripeCustomerId: string
      stripePaymentMethodId: string
      billingPeriodId: string
      billingRunId: string
      feeCalculation: unknown
      organization: unknown
      livemode: boolean
    }) => Promise<
      Result<Stripe.Response<Stripe.PaymentIntent>, Error>
    >
  >()
mockCreateAndConfirmPaymentIntentForBillingRun.mockResolvedValue(
  Result.err(
    new Error(
      '[Test] mockCreateAndConfirmPaymentIntentForBillingRun not configured. Call globalThis.__mockCreateAndConfirmPaymentIntentForBillingRun.mockResolvedValue() in your test.'
    )
  )
)

// ---------------------------------------------------------------------------
// Global Type Declarations
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var __mockCreatePaymentIntentForBillingRun: typeof mockCreatePaymentIntentForBillingRun
  // eslint-disable-next-line no-var
  var __mockConfirmPaymentIntentForBillingRun: typeof mockConfirmPaymentIntentForBillingRun
  // eslint-disable-next-line no-var
  var __mockGetPaymentIntent: typeof mockGetPaymentIntent
  // eslint-disable-next-line no-var
  var __mockGetStripeCharge: typeof mockGetStripeCharge
  // eslint-disable-next-line no-var
  var __mockListRefundsForCharge: typeof mockListRefundsForCharge
  // eslint-disable-next-line no-var
  var __mockReverseStripeTaxTransaction: typeof mockReverseStripeTaxTransaction
  // eslint-disable-next-line no-var
  var __mockRefundPayment: typeof mockRefundPayment
  // eslint-disable-next-line no-var
  var __mockConfirmPaymentIntent: typeof mockConfirmPaymentIntent
  // eslint-disable-next-line no-var
  var __mockCancelPaymentIntent: typeof mockCancelPaymentIntent
  // eslint-disable-next-line no-var
  var __mockUpdatePaymentIntent: typeof mockUpdatePaymentIntent
  // eslint-disable-next-line no-var
  var __mockGetSetupIntent: typeof mockGetSetupIntent
  // eslint-disable-next-line no-var
  var __mockUpdateSetupIntent: typeof mockUpdateSetupIntent
  // eslint-disable-next-line no-var
  var __mockCreateStripeCustomer: typeof mockCreateStripeCustomer
  // eslint-disable-next-line no-var
  var __mockCreateAndConfirmPaymentIntentForBillingRun: typeof mockCreateAndConfirmPaymentIntentForBillingRun
}

// Store mocks globally for per-test configuration
globalThis.__mockCreatePaymentIntentForBillingRun =
  mockCreatePaymentIntentForBillingRun
globalThis.__mockConfirmPaymentIntentForBillingRun =
  mockConfirmPaymentIntentForBillingRun
globalThis.__mockGetPaymentIntent = mockGetPaymentIntent
globalThis.__mockGetStripeCharge = mockGetStripeCharge
globalThis.__mockListRefundsForCharge = mockListRefundsForCharge
globalThis.__mockReverseStripeTaxTransaction =
  mockReverseStripeTaxTransaction
globalThis.__mockRefundPayment = mockRefundPayment
globalThis.__mockConfirmPaymentIntent = mockConfirmPaymentIntent
globalThis.__mockCancelPaymentIntent = mockCancelPaymentIntent
globalThis.__mockUpdatePaymentIntent = mockUpdatePaymentIntent
globalThis.__mockGetSetupIntent = mockGetSetupIntent
globalThis.__mockUpdateSetupIntent = mockUpdateSetupIntent
globalThis.__mockCreateStripeCustomer = mockCreateStripeCustomer
globalThis.__mockCreateAndConfirmPaymentIntentForBillingRun =
  mockCreateAndConfirmPaymentIntentForBillingRun

// ---------------------------------------------------------------------------
// Exports - combines mocked functions with re-exported pure functions
// ---------------------------------------------------------------------------

// Import pure functions to re-export
import {
  // Schemas
  billingRunIntentMetadataSchema,
  buildFeeMetadata,
  calculatePlatformApplicationFee,
  checkoutSessionIntentMetadataSchema,
  completeStripeOAuthFlow,
  // Additional functions that don't make direct API calls but depend on other code
  constructStripeWebhookEvent,
  countableCurrencyAmountToRawStringAmount,
  createAccountOnboardingLink,
  createConnectedAccount,
  createCustomerSessionForCheckout,
  createPaymentIntentForCheckoutSession,
  createSetupIntentForCheckoutSession,
  createStripeTaxCalculationByPrice,
  createStripeTaxCalculationByPurchase,
  createStripeTaxTransactionFromCalculation,
  dateFromStripeTimestamp,
  defaultCurrencyForCountry,
  feeMetadataSchema,
  formatBillingPeriod,
  getConnectedAccount,
  getConnectedAccountOnboardingStatus,
  getCurrencyParts,
  getLatestChargeForPaymentIntent,
  getStripeInvoiceAndInvoiceLineItemsForPaymentIntent,
  getStripeOAuthUrl,
  getStripePaymentMethod,
  getStripePrice,
  getStripeProduct,
  getStripeSubscription,
  getStripeTaxCalculation,
  IntentMetadataType,
  isCurrencySupported,
  isCurrencyZeroDecimal,
  paymentMethodFromStripeCharge,
  rawStringAmountToCountableCurrencyAmount,
  stripe,
  stripeCurrencyAmountToHumanReadableCurrencyAmount,
  stripeCurrencyAmountToShortReadableCurrencyAmount,
  stripeIdFromObjectOrId,
  stripeIntentMetadataSchema,
  stripeSupportedCurrencies,
  unitedStatesBankAccountPaymentMethodOptions,
  zeroDecimalCurrencies,
} from '@/utils/stripe'

export const stripeUtilsMockExports = {
  // Mocked API-calling functions
  createPaymentIntentForBillingRun:
    mockCreatePaymentIntentForBillingRun,
  confirmPaymentIntentForBillingRun:
    mockConfirmPaymentIntentForBillingRun,
  getPaymentIntent: mockGetPaymentIntent,
  getStripeCharge: mockGetStripeCharge,
  listRefundsForCharge: mockListRefundsForCharge,
  reverseStripeTaxTransaction: mockReverseStripeTaxTransaction,
  refundPayment: mockRefundPayment,
  confirmPaymentIntent: mockConfirmPaymentIntent,
  cancelPaymentIntent: mockCancelPaymentIntent,
  updatePaymentIntent: mockUpdatePaymentIntent,
  getSetupIntent: mockGetSetupIntent,
  updateSetupIntent: mockUpdateSetupIntent,
  createStripeCustomer: mockCreateStripeCustomer,
  createAndConfirmPaymentIntentForBillingRun:
    mockCreateAndConfirmPaymentIntentForBillingRun,

  // Pure functions (no mocking needed)
  buildFeeMetadata,
  calculatePlatformApplicationFee,
  countableCurrencyAmountToRawStringAmount,
  dateFromStripeTimestamp,
  defaultCurrencyForCountry,
  formatBillingPeriod,
  getCurrencyParts,
  IntentMetadataType,
  isCurrencySupported,
  isCurrencyZeroDecimal,
  paymentMethodFromStripeCharge,
  rawStringAmountToCountableCurrencyAmount,
  stripeIdFromObjectOrId,
  stripeCurrencyAmountToHumanReadableCurrencyAmount,
  stripeCurrencyAmountToShortReadableCurrencyAmount,
  stripeSupportedCurrencies,
  unitedStatesBankAccountPaymentMethodOptions,
  zeroDecimalCurrencies,

  // Schemas
  billingRunIntentMetadataSchema,
  checkoutSessionIntentMetadataSchema,
  feeMetadataSchema,
  stripeIntentMetadataSchema,

  // Functions that make API calls but may be used directly in some tests
  // These are included but will use real implementations
  // Tests that need to mock these can configure globalThis mocks
  constructStripeWebhookEvent,
  createConnectedAccount,
  createAccountOnboardingLink,
  createPaymentIntentForCheckoutSession,
  createSetupIntentForCheckoutSession,
  createStripeTaxCalculationByPrice,
  createStripeTaxCalculationByPurchase,
  createStripeTaxTransactionFromCalculation,
  getConnectedAccount,
  getConnectedAccountOnboardingStatus,
  getLatestChargeForPaymentIntent,
  getStripeInvoiceAndInvoiceLineItemsForPaymentIntent,
  getStripeOAuthUrl,
  getStripePaymentMethod,
  getStripePrice,
  getStripeProduct,
  getStripeSubscription,
  getStripeTaxCalculation,
  completeStripeOAuthFlow,
  createCustomerSessionForCheckout,

  // Pass through the real stripe client - MSW will intercept HTTP calls
  stripe,
}
