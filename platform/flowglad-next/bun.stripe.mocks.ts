/**
 * Stripe Test Mocks
 *
 * This file provides mocks for Stripe utility functions that need to be controlled
 * in tests that verify conditional API call logic or need specific response behaviors.
 *
 * IMPORTANT: This file must be imported AFTER bun.mocks.ts in stripe test setup.
 *
 * Files that use this setup (*.stripe.test.ts) test scenarios like:
 * - When specific Stripe APIs should/shouldn't be called
 * - What parameters are passed to Stripe APIs
 * - Behavior based on specific Stripe response states (succeeded/failed/pending)
 *
 * If a test only needs Stripe API calls to work (without controlling responses),
 * use *.db.test.ts instead, which routes to stripe-mock.
 */
import { mock } from 'bun:test'

// Import actual stripe module to spread its exports
import * as actualStripe from '@/utils/stripe'

// Create mock functions for all Stripe utilities that tests need to control
export const mockCancelPaymentIntent =
  mock<typeof actualStripe.cancelPaymentIntent>()
export const mockCreateStripeCustomer =
  mock<typeof actualStripe.createStripeCustomer>()
export const mockGetPaymentIntent =
  mock<typeof actualStripe.getPaymentIntent>()
export const mockGetSetupIntent =
  mock<typeof actualStripe.getSetupIntent>()
export const mockUpdatePaymentIntent =
  mock<typeof actualStripe.updatePaymentIntent>()
export const mockUpdateSetupIntent =
  mock<typeof actualStripe.updateSetupIntent>()
export const mockGetStripeCharge =
  mock<typeof actualStripe.getStripeCharge>()
export const mockRefundPayment =
  mock<typeof actualStripe.refundPayment>()
export const mockListRefundsForCharge =
  mock<typeof actualStripe.listRefundsForCharge>()
export const mockReverseStripeTaxTransaction =
  mock<typeof actualStripe.reverseStripeTaxTransaction>()
export const mockConfirmPaymentIntent =
  mock<typeof actualStripe.confirmPaymentIntent>()
export const mockCreatePaymentIntentForBillingRun =
  mock<typeof actualStripe.createPaymentIntentForBillingRun>()
export const mockConfirmPaymentIntentForBillingRun =
  mock<typeof actualStripe.confirmPaymentIntentForBillingRun>()
export const mockCreateAndConfirmPaymentIntentForBillingRun =
  mock<
    typeof actualStripe.createAndConfirmPaymentIntentForBillingRun
  >()

// Register the mock module
mock.module('@/utils/stripe', () => ({
  ...actualStripe,
  cancelPaymentIntent: mockCancelPaymentIntent,
  createStripeCustomer: mockCreateStripeCustomer,
  getPaymentIntent: mockGetPaymentIntent,
  getSetupIntent: mockGetSetupIntent,
  updatePaymentIntent: mockUpdatePaymentIntent,
  updateSetupIntent: mockUpdateSetupIntent,
  getStripeCharge: mockGetStripeCharge,
  refundPayment: mockRefundPayment,
  listRefundsForCharge: mockListRefundsForCharge,
  reverseStripeTaxTransaction: mockReverseStripeTaxTransaction,
  confirmPaymentIntent: mockConfirmPaymentIntent,
  createPaymentIntentForBillingRun:
    mockCreatePaymentIntentForBillingRun,
  confirmPaymentIntentForBillingRun:
    mockConfirmPaymentIntentForBillingRun,
  createAndConfirmPaymentIntentForBillingRun:
    mockCreateAndConfirmPaymentIntentForBillingRun,
}))

/**
 * Reset all Stripe mocks to their default state.
 * Called automatically in afterEach by the setup file.
 */
export function resetAllStripeMocks() {
  mockCancelPaymentIntent.mockReset()
  mockCreateStripeCustomer.mockReset()
  mockGetPaymentIntent.mockReset()
  mockGetSetupIntent.mockReset()
  mockUpdatePaymentIntent.mockReset()
  mockUpdateSetupIntent.mockReset()
  mockGetStripeCharge.mockReset()
  mockRefundPayment.mockReset()
  mockListRefundsForCharge.mockReset()
  mockReverseStripeTaxTransaction.mockReset()
  mockConfirmPaymentIntent.mockReset()
  mockCreatePaymentIntentForBillingRun.mockReset()
  mockConfirmPaymentIntentForBillingRun.mockReset()
  mockCreateAndConfirmPaymentIntentForBillingRun.mockReset()
}
