import { beforeEach, describe, expect, it, vi } from 'vitest'
// Test database setup functions
import {
  setupBillingPeriod,
  setupCustomer,
  setupInvoice,
  setupOrg,
  setupPayment,
  setupPaymentMethod,
  setupSubscription,
  setupSubscriptionItem,
} from '@/../seedDatabase'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { Customer } from '@/db/schema/customers'
import type { Invoice } from '@/db/schema/invoices'
// Schema types
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import { Payment } from '@/db/schema/payments'
import type { Price } from '@/db/schema/prices'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'
// Database query functions
import { selectBillingPeriodItems } from '@/db/tableMethods/billingPeriodItemMethods'
import { updateOrganization } from '@/db/tableMethods/organizationMethods'
import { updateSubscriptionItem } from '@/db/tableMethods/subscriptionItemMethods'
import {
  BillingPeriodStatus,
  FeatureFlag,
  PaymentStatus,
  SubscriptionAdjustmentTiming,
  SubscriptionItemType,
  SubscriptionStatus,
} from '@/types'
import core from '@/utils/core'
import { adjustSubscription } from './adjustSubscription'

// Mock the trigger task - we test that it's called with correct parameters
// The actual billing run execution is tested in billingRunHelpers.test.ts
// Create the mock function inside the factory to avoid hoisting issues
vi.mock('@/trigger/attempt-billing-run', () => {
  const mockTriggerFn = vi
    .fn()
    .mockResolvedValue({ id: 'mock-billing-run-handle-id' })
  // Store reference so we can access it in tests
  ;(globalThis as any).__mockAttemptBillingRunTrigger = mockTriggerFn
  return {
    attemptBillingRunTask: {
      trigger: mockTriggerFn,
    },
  }
})

// Get the mock function for use in tests
const getMockTrigger = () => {
  return (globalThis as any)
    .__mockAttemptBillingRunTrigger as ReturnType<typeof vi.fn>
}

describe('Proration Logic - Payment Status Scenarios', () => {
  // Global test state - will be reset before each test
  let organization: Organization.Record
  let price: Price.Record
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let subscription: Subscription.Record
  let subscriptionItem: SubscriptionItem.Record
  let billingPeriod: BillingPeriod.Record
  let invoice: Invoice.Record

  beforeEach(async () => {
    // Reset the trigger mock before each test
    const mockTrigger = getMockTrigger()
    mockTrigger.mockClear()
    mockTrigger.mockResolvedValue({
      id: 'mock-billing-run-handle-id',
    })

    // Set up organization and price
    const orgData = await setupOrg()
    organization = orgData.organization
    price = orgData.price

    // Enable feature flag for immediate adjustments
    await comprehensiveAdminTransaction(async (ctx) => {
      const { transaction } = ctx
      organization = await updateOrganization(
        {
          id: organization.id,
          featureFlags: {
            [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
          },
        },
        transaction
      )
      return { result: null }
    })

    // Set up customer
    customer = await setupCustomer({
      organizationId: organization.id,
      email: `customer+${core.nanoid()}@test.com`,
      livemode: true,
    })

    // Set up payment method
    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      livemode: true,
    })

    // Set up subscription with billing period centered around current date for 50% split
    const nowMs = Date.now() // FIXME: Refactor to use static date instead of Date.now()
    const billingPeriodStart = nowMs - 30 * 24 * 60 * 60 * 1000 // 30 days ago (epoch ms)
    const billingPeriodEnd = nowMs + 30 * 24 * 60 * 60 * 1000 // 30 days from now (epoch ms)

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      paymentMethodId: paymentMethod.id,
      status: SubscriptionStatus.Active,
      currentBillingPeriodStart: billingPeriodStart,
      currentBillingPeriodEnd: billingPeriodEnd,
      livemode: true,
    })

    // Set up billing period
    billingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: billingPeriodStart,
      endDate: billingPeriodEnd,
      status: BillingPeriodStatus.Active,
      livemode: true,
    })

    // Set up initial subscription item (base plan)
    subscriptionItem = await setupSubscriptionItem({
      subscriptionId: subscription.id,
      priceId: price.id,
      name: 'Base Plan',
      quantity: 1,
      unitPrice: 999, // $9.99
      addedDate: billingPeriodStart,
      type: SubscriptionItemType.Static,
    })

    // Set up invoice for payments to reference
    invoice = await setupInvoice({
      organizationId: organization.id,
      customerId: customer.id,
      billingPeriodId: billingPeriod.id,
      priceId: price.id,
      livemode: true,
    })
  })

  it('should handle processing payment + upgrade mid-cycle with proper proration adjustments', async () => {
    await comprehensiveAdminTransaction(async (ctx) => {
      const { transaction } = ctx
      // Setup: Create payment with Processing status for $9.99
      await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Processing,
        amount: 999, // $9.99
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
        billingPeriodId: billingPeriod.id,
        subscriptionId: subscription.id,
        paymentMethodId: paymentMethod.id,
        livemode: true,
      })

      // Setup: Prepare upgrade to $49.99 plan
      const upgradeItems: SubscriptionItem.Upsert[] = [
        {
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Premium Plan',
          quantity: 1,
          unitPrice: 4999, // $49.99
          addedDate: Date.now(), // FIXME: Refactor to use static date instead of Date.now() - Current date (middle of billing period)
          type: SubscriptionItemType.Static,
          expiredAt: null,
          livemode: true,
          externalId: null,
        },
      ]

      // Execute: Perform subscription adjustment with proration
      const result = await adjustSubscription(
        {
          id: subscription.id,
          adjustment: {
            newSubscriptionItems: upgradeItems,
            timing: SubscriptionAdjustmentTiming.Immediately,
            prorateCurrentBillingPeriod: true,
          },
        },
        organization,
        ctx
      )

      // Verify: Get billing period items to examine proration breakdown
      const bpItems = await selectBillingPeriodItems(
        { billingPeriodId: billingPeriod.id },
        transaction
      )

      // Since we set billing period to be 30 days before and after current date, we're at 50%
      const percentRemaining = 0.5

      // Verify proration items are created
      const correctionItems = bpItems.filter((item) =>
        item.name?.includes('correction')
      )
      if (correctionItems.length > 0) {
        expect(correctionItems[0].name).toContain('Net charge: ')
      }

      // The current logic focuses on the total net charge, not individual proration amounts
      // The correction adjustment ensures the total equals the calculated net charge

      // Verify if billing run was triggered
      const mockTrigger = getMockTrigger()
      const wasBillingRunTriggered = mockTrigger.mock.calls.length > 0

      if (wasBillingRunTriggered) {
        // Net charge > 0: subscription name not updated yet
        expect(result.subscription.name).toBeNull()
      } else {
        // Net charge === 0: subscription name updated immediately
        expect(result.subscription.name).toBe('Premium Plan')
      }

      // Verify proration logic is working (removal credit + addition charge)
      // The exact amounts depend on current date, but we verify the pattern is correct
      const totalProrationAmount = bpItems.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0
      )

      // Should have net positive charge since upgrading from $9.99 to $49.99
      expect(totalProrationAmount).toBeGreaterThan(0)
      return { result: null }
    })
  })

  it('should treat succeeded payment + upgrade mid-cycle the same as processing payment', async () => {
    await comprehensiveAdminTransaction(async (ctx) => {
      const { transaction } = ctx
      // Setup: Create payment with Succeeded status (instead of Processing)
      await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Succeeded, // Only difference from previous test
        amount: 999, // $9.99
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
        billingPeriodId: billingPeriod.id,
        subscriptionId: subscription.id,
        paymentMethodId: paymentMethod.id,
        livemode: true,
      })

      // Setup: Prepare upgrade to $49.99 plan
      const upgradeItems: SubscriptionItem.Upsert[] = [
        {
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Premium Plan',
          quantity: 1,
          unitPrice: 4999, // $49.99
          addedDate: Date.now(), // FIXME: Refactor to use static date instead of Date.now() - Current date (middle of billing period)
          type: SubscriptionItemType.Static,
          expiredAt: null,
          livemode: true,
          externalId: null,
        },
      ]

      // Execute: Perform subscription adjustment with proration
      const result = await adjustSubscription(
        {
          id: subscription.id,
          adjustment: {
            newSubscriptionItems: upgradeItems,
            timing: SubscriptionAdjustmentTiming.Immediately,
            prorateCurrentBillingPeriod: true,
          },
        },
        organization,
        ctx
      )

      // Verify: Get billing period items
      const bpItems = await selectBillingPeriodItems(
        { billingPeriodId: billingPeriod.id },
        transaction
      )

      // Verify: The new logic creates a single net charge adjustment item
      const correctionItems = bpItems.filter((item) =>
        item.name?.includes('Net charge adjustment')
      )

      // Should have exactly one proration adjustment item
      expect(correctionItems).toHaveLength(1)

      // Processing and Succeeded payments should be treated identically
      expect(correctionItems[0].unitPrice).toBeGreaterThan(0)
      expect(correctionItems[0].name).toContain(
        'Net charge adjustment'
      )

      // Verify the specific charge amount
      // Fair value: 50% of $9.99 (old) + 50% of $49.99 (new) = ~$30.00 total
      // Already paid: $9.99
      // Net charge should be: ~$20.00
      expect(correctionItems[0].unitPrice / 100).toBeCloseTo(20, 0) // ~$20.00

      // Verify final charge calculation
      const totalProrationAmount = bpItems.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0
      )
      expect(999 + totalProrationAmount).toBeCloseTo(2999, 2) // Total ~$29.99, allow 2 cent tolerance
      return { result: null }
    })
  })

  it('should ignore failed payment amount when calculating proration for upgrade', async () => {
    await comprehensiveAdminTransaction(async (ctx) => {
      const { transaction } = ctx
      // Setup: Create payment with Failed status
      await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Failed, // Failed payment should be ignored
        amount: 999, // $9.99 (should not count toward existing payments)
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
        billingPeriodId: billingPeriod.id,
        subscriptionId: subscription.id,
        paymentMethodId: paymentMethod.id,
        livemode: true,
      })

      // Setup: Prepare upgrade to $49.99 plan
      const upgradeItems: SubscriptionItem.Upsert[] = [
        {
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Premium Plan',
          quantity: 1,
          unitPrice: 4999, // $49.99
          addedDate: Date.now(), // FIXME: Refactor to use static date instead of Date.now() - Current date (middle of billing period)
          type: SubscriptionItemType.Static,
          expiredAt: null,
          livemode: true,
          externalId: null,
        },
      ]

      // Execute: Perform subscription adjustment with proration
      const result = await adjustSubscription(
        {
          id: subscription.id,
          adjustment: {
            newSubscriptionItems: upgradeItems,
            timing: SubscriptionAdjustmentTiming.Immediately,
            prorateCurrentBillingPeriod: true,
          },
        },
        organization,
        ctx
      )

      // Verify: Get billing period items
      const bpItems = await selectBillingPeriodItems(
        { billingPeriodId: billingPeriod.id },
        transaction
      )

      // Verify: The new logic creates a single net charge adjustment item
      const correctionItems = bpItems.filter((item) =>
        item.name?.includes('Net charge adjustment')
      )

      // Should have exactly one proration adjustment item
      expect(correctionItems).toHaveLength(1)
      expect(correctionItems[0].unitPrice).toBeGreaterThan(0)
      expect(correctionItems[0].name).toContain(
        'Net charge adjustment'
      )

      // Verify the specific charge amount
      // Fair value: 50% of $9.99 (old) + 50% of $49.99 (new) = ~$30.00 total
      // Already paid: $0.00 (failed payment ignored)
      // Net charge should be: ~$30.00 (full fair value)
      expect(correctionItems[0].unitPrice / 100).toBeCloseTo(
        3000 / 100,
        0
      ) // ~$30.00, allow 50 cent tolerance

      // Critical difference: Since failed payment is ignored, customer pays FULL fair value
      const totalProrationAmount = bpItems.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0
      )

      // Customer should pay full $29.99 since no successful payment exists
      // This means proration adjustments alone should equal ~$29.99
      expect(totalProrationAmount / 100).toBeCloseTo(2999 / 100, 0) // ~$29.99 from proration alone, allow 2 cent tolerance
      return { result: null }
    })
  })

  it('should add new subscription items without removing existing items', async () => {
    await comprehensiveAdminTransaction(async (ctx) => {
      const { transaction } = ctx
      // Setup: Create payment for existing plan
      await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 999, // $9.99 for existing plan
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
        billingPeriodId: billingPeriod.id,
        subscriptionId: subscription.id,
        paymentMethodId: paymentMethod.id,
        livemode: true,
      })

      // Setup: Add new subscription item WITHOUT removing existing one
      const addOnlyItems: SubscriptionItem.Upsert[] = [
        {
          // Keep existing item by including it with its ID
          id: subscriptionItem.id,
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Base Plan',
          quantity: 1,
          unitPrice: 999, // Keep existing plan
          addedDate:
            Number(subscription.currentBillingPeriodStart) ||
            Date.now(), // FIXME: Refactor to use static date instead of Date.now() - Start of billing period
          type: SubscriptionItemType.Static,
          expiredAt: null,
          livemode: true,
          externalId: null,
        },
        {
          // Add new item (no ID = new item)
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Add-on Feature',
          quantity: 1,
          unitPrice: 2000, // $20.00 add-on
          addedDate: new Date(
            new Date().getFullYear(),
            6,
            1
          ).getTime(), // FIXME: Refactor to use static date instead of Date.now() - July 1st of current year
          type: SubscriptionItemType.Static,
          expiredAt: null,
          livemode: true,
          externalId: null,
        },
      ]

      // Execute: Perform subscription adjustment
      const result = await adjustSubscription(
        {
          id: subscription.id,
          adjustment: {
            newSubscriptionItems: addOnlyItems,
            timing: SubscriptionAdjustmentTiming.Immediately,
            prorateCurrentBillingPeriod: true,
          },
        },
        organization,
        ctx
      )

      // Verify if billing run was triggered
      const mockTrigger = getMockTrigger()
      const wasBillingRunTriggered = mockTrigger.mock.calls.length > 0

      if (wasBillingRunTriggered) {
        // Net charge > 0: items are NOT updated immediately
        expect(result.subscriptionItems).toHaveLength(1) // Original item still exists
      } else {
        // Net charge === 0: items ARE updated immediately
        expect(result.subscriptionItems).toHaveLength(2) // Both items updated
      }

      // Verify: Get billing period items
      const bpItems = await selectBillingPeriodItems(
        { billingPeriodId: billingPeriod.id },
        transaction
      )

      // The new logic creates a single net charge adjustment item
      const correctionItems = bpItems.filter((item) =>
        item.name?.includes('Net charge adjustment')
      )

      // Should have exactly one proration adjustment item for the net charge
      expect(correctionItems).toHaveLength(1)

      // Verify net charge adjustment (should be positive)
      // Old plan total: $9.99
      // New plan total: $9.99 + $20.00 = $29.99
      // Fair value: 50% of $9.99 (old) + 50% of $29.99 (new) = 500 + 1500 = ~$20.00
      // Already paid: $9.99
      // Net charge: ~$10.00
      expect(correctionItems[0].unitPrice).toBeGreaterThan(0)
      expect(correctionItems[0].unitPrice / 100).toBeCloseTo(10, 0) // ~$10.00

      // Verify subscription name (using mockTrigger already declared above)
      if (wasBillingRunTriggered) {
        // Net charge > 0: subscription name not updated yet
        expect(result.subscription.name).toBeNull()
      } else {
        // Net charge === 0: subscription name updated immediately
        expect(result.subscription.name).toBe('Add-on Feature')
      }
      return { result: null }
    })
  })

  it('should remove existing subscription items without adding new items', async () => {
    await comprehensiveAdminTransaction(async (ctx) => {
      const { transaction } = ctx
      // Setup: Create payment for existing plan
      await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 999, // $9.99 for existing plan
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
        billingPeriodId: billingPeriod.id,
        subscriptionId: subscription.id,
        paymentMethodId: paymentMethod.id,
        livemode: true,
      })

      // Setup: Remove existing subscription item by not including it in new items array
      const removeOnlyItems: SubscriptionItem.Upsert[] = [
        // Empty array means all existing items will be expired
      ]

      // Execute: Perform subscription adjustment
      const result = await adjustSubscription(
        {
          id: subscription.id,
          adjustment: {
            newSubscriptionItems: removeOnlyItems,
            timing: SubscriptionAdjustmentTiming.Immediately,
            prorateCurrentBillingPeriod: true,
          },
        },
        organization,
        ctx
      )

      // Verify: Should have 0 subscription items (all removed)
      expect(result.subscriptionItems).toHaveLength(0)

      // Verify: Get billing period items
      const bpItems = await selectBillingPeriodItems(
        { billingPeriodId: billingPeriod.id },
        transaction
      )

      // The new logic applies downgrade protection and creates NO proration items
      // when net charge would be <= 0
      // In this case: Fair value ~$5.00, Already paid $9.99, Net charge would be negative
      // But we cap at 0 (no refunds), so NO billing period items are created
      const correctionItems = bpItems.filter((item) =>
        item.name?.includes('Net charge adjustment')
      )

      expect(correctionItems).toHaveLength(0) // No proration items for downgrades

      // Verify subscription record name remains unchanged when no active items
      // (The sync logic doesn't update when there are no active items)
      expect(result.subscription.name).toBe(subscription.name)
      return { result: null }
    })
  })

  it('should apply downgrade protection to zero out negative charges and prevent credits', async () => {
    await comprehensiveAdminTransaction(async (ctx) => {
      const { transaction } = ctx
      // Setup: Update the existing subscription item to $49.99 plan first
      // First expire the original Base Plan item
      await updateSubscriptionItem(
        {
          id: subscriptionItem.id,
          expiredAt: Date.now(), // FIXME: Refactor to use static date instead of Date.now()
          type: SubscriptionItemType.Static,
        },
        transaction
      )

      const expensiveItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Expensive Plan',
        quantity: 1,
        unitPrice: 4999, // $49.99 (expensive plan)
        addedDate: Number(billingPeriod.startDate),
        type: SubscriptionItemType.Static,
      })

      // Setup: Create succeeded payment for the expensive plan
      await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 4999, // $49.99 (customer already paid full amount)
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
        billingPeriodId: billingPeriod.id,
        subscriptionId: subscription.id,
        paymentMethodId: paymentMethod.id,
        livemode: true,
      })

      // Setup: Prepare downgrade to $9.99 plan
      const downgradeItems: SubscriptionItem.Upsert[] = [
        {
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Basic Plan',
          quantity: 1,
          unitPrice: 999, // $9.99 (cheaper plan)
          addedDate: Date.now(), // FIXME: Refactor to use static date instead of Date.now() - Current date (middle of billing period)
          type: SubscriptionItemType.Static,
          expiredAt: null,
          livemode: true,
          externalId: null,
        },
      ]

      // Execute: Perform subscription adjustment with proration
      const result = await adjustSubscription(
        {
          id: subscription.id,
          adjustment: {
            newSubscriptionItems: downgradeItems,
            timing: SubscriptionAdjustmentTiming.Immediately,
            prorateCurrentBillingPeriod: true,
          },
        },
        organization,
        ctx
      )

      // Verify: Get billing period items
      const bpItems = await selectBillingPeriodItems(
        { billingPeriodId: billingPeriod.id },
        transaction
      )

      // The new logic applies downgrade protection and creates NO proration items
      // when net charge would be <= 0
      // Customer already paid $49.99, fair value is ~$29.99 (would be ~$20 credit)
      // But we don't issue credits, so NO billing period items are created
      const correctionItems = bpItems.filter((item) =>
        item.name?.includes('Net charge adjustment')
      )

      expect(correctionItems).toHaveLength(0) // No proration items for downgrades

      // Verify total billing adjustments result in $0 additional charge (no credits)
      const totalProrationAmount = bpItems.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0
      )

      // Customer already paid $49.99, fair value is ~$29.99 (would be ~$20 credit)
      // But we don't issue credits, so total proration should be $0
      expect(totalProrationAmount).toBe(0) // No additional charge, no credit

      // Verify if billing run was triggered
      const mockTrigger = getMockTrigger()
      const wasBillingRunTriggered = mockTrigger.mock.calls.length > 0

      if (wasBillingRunTriggered) {
        // Net charge > 0: subscription name not updated yet
        expect(result.subscription.name).toBeNull()
      } else {
        // Net charge === 0: subscription name updated immediately (downgrade with no refund)
        expect(result.subscription.name).toBe('Basic Plan')
      }
      return { result: null }
    })
  })

  it('should replace existing subscription items with new ones and create proper proration adjustments', async () => {
    await comprehensiveAdminTransaction(async (ctx) => {
      const { transaction } = ctx
      // Setup: Create payment for existing plan
      await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 999, // $9.99 for existing plan
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
        billingPeriodId: billingPeriod.id,
        subscriptionId: subscription.id,
        paymentMethodId: paymentMethod.id,
        livemode: true,
      })

      // Setup: Replace existing item with a different one (old item will be expired automatically)
      const replaceItems: SubscriptionItem.Upsert[] = [
        {
          // Add new item (no ID = new item), old item will be expired automatically
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Replacement Plan',
          quantity: 1,
          unitPrice: 2999, // $29.99 replacement plan
          addedDate: Date.now(), // FIXME: Refactor to use static date instead of Date.now() - Current date
          type: SubscriptionItemType.Static,
          expiredAt: null,
          livemode: true,
          externalId: null,
        },
      ]

      // Execute: Perform subscription adjustment
      const result = await adjustSubscription(
        {
          id: subscription.id,
          adjustment: {
            newSubscriptionItems: replaceItems,
            timing: SubscriptionAdjustmentTiming.Immediately,
            prorateCurrentBillingPeriod: true,
          },
        },
        organization,
        ctx
      )

      // Verify if billing run was triggered
      const mockTrigger = getMockTrigger()
      const wasBillingRunTriggered = mockTrigger.mock.calls.length > 0

      if (wasBillingRunTriggered) {
        // Net charge > 0: items are NOT updated immediately
        expect(result.subscriptionItems).toHaveLength(1) // Original item still exists
        expect(result.subscriptionItems[0].name).toBe('Base Plan') // Original item name
      } else {
        // Net charge === 0: items ARE updated immediately
        expect(result.subscriptionItems).toHaveLength(1) // Replacement item
        expect(result.subscriptionItems[0].name).toBe(
          'Replacement Plan'
        )
      }

      // Verify subscription name
      if (wasBillingRunTriggered) {
        expect(result.subscription.name).toBeNull()
      } else {
        expect(result.subscription.name).toBe('Replacement Plan')
      }

      // Verify: Get billing period items
      const bpItems = await selectBillingPeriodItems(
        { billingPeriodId: billingPeriod.id },
        transaction
      )

      // The new logic creates a single net charge adjustment item for upgrades
      const correctionItems = bpItems.filter((item) =>
        item.name?.includes('Net charge adjustment')
      )

      expect(correctionItems).toHaveLength(1) // One proration item for net charge
      expect(correctionItems[0].unitPrice).toBeGreaterThan(0)
      expect(correctionItems[0].name).toContain(
        'Net charge adjustment'
      )

      // Verify the specific charge amount
      // Old plan: $9.99
      // New plan: $29.99
      // Fair value: 50% of $9.99 (old) + 50% of $29.99 (new) = 500 + 1500 = ~$20.00
      // Already paid: $9.99
      // Net charge: ~$10.00
      expect(correctionItems[0].unitPrice / 100).toBeCloseTo(10, 0) // ~$10.00

      // Verify subscription name (using wasBillingRunTriggered already declared above)
      if (wasBillingRunTriggered) {
        expect(result.subscription.name).toBeNull()
      } else {
        expect(result.subscription.name).toBe('Replacement Plan')
      }
      return { result: null }
    })
  })

  it('should apply downgrade protection when downgrading to free plan with zero additional charges', async () => {
    await comprehensiveAdminTransaction(async (ctx) => {
      const { transaction } = ctx
      // Setup: Create payment for $19.99 plan
      await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 1999, // $19.99
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
        billingPeriodId: billingPeriod.id,
        subscriptionId: subscription.id,
        paymentMethodId: paymentMethod.id,
        livemode: true,
      })

      // Setup: Update subscription item to $19.99 plan
      await updateSubscriptionItem(
        {
          id: subscriptionItem.id,
          unitPrice: 1999, // $19.99
          name: 'Premium Plan',
          type: SubscriptionItemType.Static,
        },
        transaction
      )

      // Setup: Prepare downgrade to free plan
      const freePlanItems: SubscriptionItem.Upsert[] = [
        {
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Free Plan',
          quantity: 1,
          unitPrice: 0, // Free plan
          addedDate: Date.now(), // FIXME: Refactor to use static date instead of Date.now() - Current date (30% through period)
          type: SubscriptionItemType.Static,
          expiredAt: null,
          livemode: true,
          externalId: null,
        },
      ]

      // Execute: Perform subscription adjustment with proration
      const result = await adjustSubscription(
        {
          id: subscription.id,
          adjustment: {
            newSubscriptionItems: freePlanItems,
            timing: SubscriptionAdjustmentTiming.Immediately,
            prorateCurrentBillingPeriod: true,
          },
        },
        organization,
        ctx
      )

      // Verify: Get billing period items
      const bpItems = await selectBillingPeriodItems(
        { billingPeriodId: billingPeriod.id },
        transaction
      )

      // The new logic applies downgrade protection and creates NO proration items
      // when downgrading to a free plan (net charge would be negative)
      const correctionItems = bpItems.filter((item) =>
        item.name?.includes('Net charge adjustment')
      )

      expect(correctionItems).toHaveLength(0) // No proration items for downgrades

      // Verify total billing adjustments result in $0 additional charge (downgrade protection)
      const totalProrationAmount = bpItems.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0
      )
      expect(totalProrationAmount).toBe(0) // No additional charge due to downgrade protection

      // Verify subscription record reflects new plan
      expect(result.subscription.name).toBe('Free Plan')
      return { result: null }
    })
  })

  it('should process multiple subscription items with complex pricing and create appropriate proration adjustments', async () => {
    await comprehensiveAdminTransaction(async (ctx) => {
      const { transaction } = ctx
      // Setup: Create second subscription item
      const secondItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: price.id,
        name: 'Add-on Feature',
        quantity: 1,
        unitPrice: 999, // $9.99
        addedDate: billingPeriod.startDate,
        type: SubscriptionItemType.Static,
      })

      // Setup: Update first item to $19.99
      await updateSubscriptionItem(
        {
          id: subscriptionItem.id,
          unitPrice: 1999, // $19.99
          name: 'Base Plan',
          type: SubscriptionItemType.Static,
        },
        transaction
      )

      // Setup: Create payment for total of both items ($29.98)
      await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 2998, // $29.98 total
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
        billingPeriodId: billingPeriod.id,
        subscriptionId: subscription.id,
        paymentMethodId: paymentMethod.id,
        livemode: true,
      })

      // Setup: Prepare change to single expensive item
      const singleItem: SubscriptionItem.Upsert[] = [
        {
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Premium Plan',
          quantity: 1,
          unitPrice: 4999, // $49.99
          addedDate: Date.now(), // FIXME: Refactor to use static date instead of Date.now() - Current date (50% through period)
          type: SubscriptionItemType.Static,
          expiredAt: null,
          livemode: true,
          externalId: null,
        },
      ]

      // Execute: Perform subscription adjustment with proration
      const result = await adjustSubscription(
        {
          id: subscription.id,
          adjustment: {
            newSubscriptionItems: singleItem,
            timing: SubscriptionAdjustmentTiming.Immediately,
            prorateCurrentBillingPeriod: true,
          },
        },
        organization,
        ctx
      )

      // Verify if billing run was triggered
      const mockTrigger = getMockTrigger()
      const wasBillingRunTriggered = mockTrigger.mock.calls.length > 0

      if (wasBillingRunTriggered) {
        // Net charge > 0: items are NOT updated immediately
        expect(result.subscriptionItems).toHaveLength(2) // Original items still exist
      } else {
        // Net charge === 0: items ARE updated immediately
        expect(result.subscriptionItems).toHaveLength(1) // New item created
        expect(result.subscriptionItems[0].name).toBe('Premium Plan')
      }

      // Verify subscription name
      if (wasBillingRunTriggered) {
        expect(result.subscription.name).toBeNull()
      } else {
        expect(result.subscription.name).toBe('Premium Plan')
      }

      // Verify: Get billing period items
      const bpItems = await selectBillingPeriodItems(
        { billingPeriodId: billingPeriod.id },
        transaction
      )

      // The new logic creates a single net charge adjustment item for upgrades
      const correctionItems = bpItems.filter((item) =>
        item.name?.includes('Net charge adjustment')
      )

      expect(correctionItems).toHaveLength(1)
      expect(correctionItems[0].unitPrice).toBeGreaterThan(0)
      expect(correctionItems[0].name).toContain(
        'Net charge adjustment'
      )

      // Verify the specific charge amount
      // Old plan total: $19.99 + $9.99 = $29.98
      // New plan total: $49.99
      // Fair value: 50% of $29.98 (old) + 50% of $49.99 (new) = 1499 + 2500 = ~$40.00
      // Already paid: $29.98
      // Net charge: ~$10.00
      expect(correctionItems[0].unitPrice / 100).toBeCloseTo(10, 0) // ~$10.00

      // Verify total proration amount
      const totalProrationAmount = bpItems.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0
      )

      // Should have net positive charge since upgrading from $29.98 to $49.99
      expect(totalProrationAmount).toBeGreaterThan(0)
      expect(totalProrationAmount).toBeCloseTo(1000, 2) // ~$10.00 additional, allow 2 cent tolerance

      // Verify if billing run was triggered
      const mockTriggerForPremium = getMockTrigger()
      const wasBillingRunTriggeredForPremium =
        mockTriggerForPremium.mock.calls.length > 0

      if (wasBillingRunTriggeredForPremium) {
        // Net charge > 0: subscription name not updated yet
        expect(result.subscription.name).toBeNull()
      } else {
        // Net charge === 0: subscription name updated immediately
        expect(result.subscription.name).toBe('Premium Plan')
      }
      return { result: null }
    })
  })

  it('should calculate full fair value proration when no existing payments exist', async () => {
    await comprehensiveAdminTransaction(async (ctx) => {
      const { transaction } = ctx
      // Setup: Update subscription item to $15.00 plan
      await updateSubscriptionItem(
        {
          id: subscriptionItem.id,
          unitPrice: 1500, // $15.00
          name: 'Basic Plan',
          type: SubscriptionItemType.Static,
        },
        transaction
      )

      // Setup: NO payment created (simulating new subscription without payment yet)

      // Setup: Prepare upgrade to $25.00 plan
      const upgradeItems: SubscriptionItem.Upsert[] = [
        {
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Standard Plan',
          quantity: 1,
          unitPrice: 2500, // $25.00
          addedDate: Date.now(), // FIXME: Refactor to use static date instead of Date.now() - Current date (40% through period)
          type: SubscriptionItemType.Static,
          expiredAt: null,
          livemode: true,
          externalId: null,
        },
      ]

      // Execute: Perform subscription adjustment with proration
      const result = await adjustSubscription(
        {
          id: subscription.id,
          adjustment: {
            newSubscriptionItems: upgradeItems,
            timing: SubscriptionAdjustmentTiming.Immediately,
            prorateCurrentBillingPeriod: true,
          },
        },
        organization,
        ctx
      )

      // Verify: Get billing period items
      const bpItems = await selectBillingPeriodItems(
        { billingPeriodId: billingPeriod.id },
        transaction
      )

      // The new logic creates a single net charge adjustment item
      const correctionItems = bpItems.filter((item) =>
        item.name?.includes('Net charge adjustment')
      )

      expect(correctionItems).toHaveLength(1)
      expect(correctionItems[0].unitPrice).toBeGreaterThan(0)
      expect(correctionItems[0].name).toContain(
        'Net charge adjustment'
      )

      // Verify the specific charge amount
      // Old plan: $15.00
      // New plan: $25.00
      // Fair value: 50% of $15.00 (old) + 50% of $25.00 (new) = 750 + 1250 = ~$20.00
      // Already paid: $0.00 (no payments)
      // Net charge: ~$20.00 (full fair value)
      expect(correctionItems[0].unitPrice / 100).toBeCloseTo(20, 0) // ~$20.00

      // Verify total proration amount (should be full fair value since no existing payments)
      const totalProrationAmount = bpItems.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0
      )

      // Should be positive since no existing payments to offset
      expect(totalProrationAmount).toBeGreaterThan(0)
      // The current logic calculates the net charge based on existing payments
      // If there are existing payments, the calculation will be different
      expect(totalProrationAmount).toBeCloseTo(2000, 2) // ~$20.00 net charge, allow 2 cent tolerance

      // Verify if billing run was triggered
      const mockTrigger = getMockTrigger()
      const wasBillingRunTriggered = mockTrigger.mock.calls.length > 0

      if (wasBillingRunTriggered) {
        // Net charge > 0: subscription name not updated yet
        expect(result.subscription.name).toBeNull()
      } else {
        // Net charge === 0: subscription name updated immediately
        expect(result.subscription.name).toBe('Standard Plan')
      }
      return { result: null }
    })
  })

  it('should process zero unit price items without arithmetic errors and apply downgrade protection', async () => {
    await comprehensiveAdminTransaction(async (ctx) => {
      const { transaction } = ctx
      // Setup: Update subscription item to $19.99 plan
      await updateSubscriptionItem(
        {
          id: subscriptionItem.id,
          unitPrice: 1999, // $19.99
          name: 'Premium Plan',
          type: SubscriptionItemType.Static,
        },
        transaction
      )

      // Setup: Create payment for $19.99
      await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 1999, // $19.99
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
        billingPeriodId: billingPeriod.id,
        subscriptionId: subscription.id,
        paymentMethodId: paymentMethod.id,
        livemode: true,
      })

      // Setup: Prepare change to free plan (unitPrice: 0)
      const freePlanItems: SubscriptionItem.Upsert[] = [
        {
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Free Plan',
          quantity: 1,
          unitPrice: 0, // Free plan
          addedDate: Date.now(), // FIXME: Refactor to use static date instead of Date.now() - Current date (50% through period)
          type: SubscriptionItemType.Static,
          expiredAt: null,
          livemode: true,
          externalId: null,
        },
      ]

      // Execute: Perform subscription adjustment with proration
      const result = await adjustSubscription(
        {
          id: subscription.id,
          adjustment: {
            newSubscriptionItems: freePlanItems,
            timing: SubscriptionAdjustmentTiming.Immediately,
            prorateCurrentBillingPeriod: true,
          },
        },
        organization,
        ctx
      )

      // Verify: Get billing period items
      const bpItems = await selectBillingPeriodItems(
        { billingPeriodId: billingPeriod.id },
        transaction
      )

      // The new logic applies downgrade protection and creates NO proration items
      // when downgrading to a free plan (net charge would be negative)
      const correctionItems = bpItems.filter((item) =>
        item.name?.includes('Net charge adjustment')
      )

      expect(correctionItems).toHaveLength(0) // No proration items for downgrades

      // Verify total billing adjustments result in $0 additional charge (downgrade protection)
      const totalProrationAmount = bpItems.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0
      )
      expect(totalProrationAmount).toBe(0) // No additional charge due to downgrade protection

      // Verify if billing run was triggered
      const mockTriggerForFreePlan = getMockTrigger()
      const wasBillingRunTriggeredForFreePlan =
        mockTriggerForFreePlan.mock.calls.length > 0

      if (wasBillingRunTriggeredForFreePlan) {
        // Net charge > 0: subscription name not updated yet
        expect(result.subscription.name).toBeNull()
      } else {
        // Net charge === 0: subscription name updated immediately
        expect(result.subscription.name).toBe('Free Plan')
      }

      // Verify no arithmetic errors occurred (test should complete without throwing)
      // With no proration items created, bpItems.length should be 0
      expect(bpItems.length).toBe(0)
      return { result: null }
    })
  })
})
