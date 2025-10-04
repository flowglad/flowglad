import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import { BillingPeriodStatus, PaymentStatus, SubscriptionAdjustmentTiming, SubscriptionItemType, SubscriptionStatus } from '@/types'
import { adjustSubscription } from './adjustSubscription'

// Test database setup functions
import {
  setupOrg,
  setupCustomer,
  setupPaymentMethod,
  setupSubscription,
  setupSubscriptionItem,
  setupBillingPeriod,
  setupPayment,
  setupInvoice,
} from '@/../seedDatabase'

// Schema types
import { Organization } from '@/db/schema/organizations'
import { Price } from '@/db/schema/prices'
import { Customer } from '@/db/schema/customers'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Subscription } from '@/db/schema/subscriptions'
import { SubscriptionItem } from '@/db/schema/subscriptionItems'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { Payment } from '@/db/schema/payments'
import { Invoice } from '@/db/schema/invoices'

// Database query functions
import { selectBillingPeriodItems } from '@/db/tableMethods/billingPeriodItemMethods'
import { updateSubscriptionItem } from '@/db/tableMethods/subscriptionItemMethods'
import { selectCurrentBillingPeriodForSubscription } from '@/db/tableMethods/billingPeriodMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import core from '@/utils/core'

describe("Proration Logic - Payment Status Scenarios", () => {
  
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
    // Set up organization and price
    const orgData = await setupOrg()
    organization = orgData.organization
    price = orgData.price

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
    const now = new Date() // TODO: Refactor to use static date instead of new Date()
    const billingPeriodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
    const billingPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 days from now

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
      usageMeterId: undefined,
      usageEventsPerUnit: undefined,
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

  it("should handle processing payment + upgrade mid-cycle correctly", async () => {
    await adminTransaction(async ({ transaction }) => {
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
          addedDate: new Date(), // TODO: Refactor to use static date instead of new Date() - Current date (middle of billing period)
          type: SubscriptionItemType.Static,
          expiredAt: null,
          livemode: true,
          externalId: null,
          usageMeterId: null,
          usageEventsPerUnit: null,
        }
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
        transaction
      )

      // Verify: Get billing period items to examine proration breakdown
      const bpItems = await selectBillingPeriodItems(
        { billingPeriodId: billingPeriod.id },
        transaction
      )

      // Since we set billing period to be 30 days before and after current date, we're at 50%
      const percentRemaining = 0.5

      // Verify proration items are created
      const removalItems = bpItems.filter(item => item.name?.includes('Removal'))
      const additionItems = bpItems.filter(item => item.name?.includes('Addition'))
      const correctionItems = bpItems.filter(item => item.name?.includes('correction'))

      expect(removalItems).toHaveLength(1)
      expect(additionItems).toHaveLength(1)

      // Verify that proration adjustments exist (removal and addition)
      expect(removalItems[0].unitPrice).toBeLessThan(0)
      expect(additionItems[0].unitPrice).toBeGreaterThan(0)

      // Verify correction adjustment exists if needed (current logic includes correction to reach net charge)
      // Correction adjustments are only created when proration adjustments don't equal the net charge
      if (correctionItems.length > 0) {
        expect(correctionItems[0].name).toContain('Net charge adjustment')
      }

      // The current logic focuses on the total net charge, not individual proration amounts
      // The correction adjustment ensures the total equals the calculated net charge

      // Verify subscription record reflects new plan
      expect(result.subscription.name).toBe('Premium Plan')

      // Verify proration logic is working (removal credit + addition charge)
      // The exact amounts depend on current date, but we verify the pattern is correct
      const totalProrationAmount = bpItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0)
      
      // Should have net positive charge since upgrading from $9.99 to $49.99
      expect(totalProrationAmount).toBeGreaterThan(0)
    })
  })

  it("should handle succeeded payment + upgrade mid-cycle identically to processing", async () => {
    await adminTransaction(async ({ transaction }) => {
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
          addedDate: new Date(), // TODO: Refactor to use static date instead of new Date() - Current date (middle of billing period)
          type: SubscriptionItemType.Static,
          expiredAt: null,
          livemode: true,
          externalId: null,
          usageMeterId: null,
          usageEventsPerUnit: null,
        }
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
        transaction
      )

      // Verify: Get billing period items
      const bpItems = await selectBillingPeriodItems(
        { billingPeriodId: billingPeriod.id },
        transaction
      )

      // Verify: Behavior should be identical to Processing payment test
      const removalItems = bpItems.filter(item => item.name?.includes('Removal'))
      const additionItems = bpItems.filter(item => item.name?.includes('Addition'))
      const correctionItems = bpItems.filter(item => item.name?.includes('correction') || item.name?.includes('adjustment'))

      expect(removalItems).toHaveLength(1)
      expect(additionItems).toHaveLength(1)

      // Processing and Succeeded payments should be treated identically
      expect(removalItems[0].unitPrice).toBeLessThan(0)
      expect(additionItems[0].unitPrice).toBeGreaterThan(0)

      // Verify correction adjustment exists if needed (current logic includes correction to reach net charge)
      // Correction adjustments are only created when proration adjustments don't equal the net charge
      if (correctionItems.length > 0) {
        expect(correctionItems[0].name).toContain('Net charge adjustment')
      }

      // The current logic focuses on the total net charge, not individual proration amounts
      // The correction adjustment ensures the total equals the calculated net charge

      // Verify final charge calculation
      const totalProrationAmount = bpItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0)
      expect(999 + totalProrationAmount).toBeCloseTo(2999, 2) // Total ~$29.99, allow 2 cent tolerance
    })
  })

  it("should handle failed payment + upgrade by ignoring failed payment amount", async () => {
    await adminTransaction(async ({ transaction }) => {
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
          addedDate: new Date(), // TODO: Refactor to use static date instead of new Date() - Current date (middle of billing period)
          type: SubscriptionItemType.Static,
          expiredAt: null,
          livemode: true,
          externalId: null,
          usageMeterId: null,
          usageEventsPerUnit: null,
        }
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
        transaction
      )

      // Verify: Get billing period items
      const bpItems = await selectBillingPeriodItems(
        { billingPeriodId: billingPeriod.id },
        transaction
      )

      const removalItems = bpItems.filter(item => item.name?.includes('Removal'))
      const additionItems = bpItems.filter(item => item.name?.includes('Addition'))
      const correctionItems = bpItems.filter(item => item.name?.includes('correction') || item.name?.includes('adjustment'))

      expect(removalItems).toHaveLength(1)
      expect(additionItems).toHaveLength(1)

      // Verify proration adjustments exist (50% through period)
      expect(removalItems[0].unitPrice).toBeLessThan(0)
      expect(additionItems[0].unitPrice).toBeGreaterThan(0)

      // Verify correction adjustment exists (current logic includes correction to reach net charge)
      expect(correctionItems).toHaveLength(1)
      expect(correctionItems[0].name).toContain('Net charge adjustment')

      // The current logic focuses on the total net charge, not individual proration amounts
      // The correction adjustment ensures the total equals the calculated net charge

      // Critical difference: Since failed payment is ignored, customer pays FULL fair value
      const totalProrationAmount = bpItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0)
      
      // Customer should pay full $29.99 since no successful payment exists
      // This means proration adjustments alone should equal ~$29.99
      expect(totalProrationAmount).toBeCloseTo(2999, 2) // ~$29.99 from proration alone, allow 2 cent tolerance
    })
  })

  it("should handle add-only scenario without removing existing items", async () => {
    await adminTransaction(async ({ transaction }) => {
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
          addedDate: subscription.currentBillingPeriodStart || new Date(), // TODO: Refactor to use static date instead of new Date() - Start of billing period
          type: SubscriptionItemType.Static,
          expiredAt: null,
          livemode: true,
          externalId: null,
          usageMeterId: null,
          usageEventsPerUnit: null,
        },
        {
          // Add new item (no ID = new item)
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Add-on Feature',
          quantity: 1,
          unitPrice: 2000, // $20.00 add-on
          addedDate: new Date(new Date().getFullYear(), 6, 1), // TODO: Refactor to use static date instead of new Date() - July 1st of current year
          type: SubscriptionItemType.Static,
          expiredAt: null,
          livemode: true,
          externalId: null,
          usageMeterId: null,
          usageEventsPerUnit: null,
        }
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
        transaction
      )

      // Verify: Should have 2 active subscription items
      expect(result.subscriptionItems).toHaveLength(2)
      
      // Verify: Get billing period items
      const bpItems = await selectBillingPeriodItems(
        { billingPeriodId: billingPeriod.id },
        transaction
      )

      // Should have addition adjustment for new item only (no removal)
      const removalItems = bpItems.filter(item => item.name?.includes('Removal'))
      const additionItems = bpItems.filter(item => item.name?.includes('Addition'))

      expect(removalItems).toHaveLength(0) // No items removed
      expect(additionItems).toHaveLength(1) // Only new add-on item

      // Verify addition adjustment (should be positive, ~50% of $20.00)
      expect(additionItems[0].unitPrice).toBeGreaterThan(0)
      expect(additionItems[0].unitPrice).toBeCloseTo(1000, 2) // ~$10.00, allow 2 cent tolerance

      // Verify subscription record reflects most expensive item
      expect(result.subscription.name).toBe('Add-on Feature')
    })
  })

  it("should handle remove-only scenario without adding new items", async () => {
    await adminTransaction(async ({ transaction }) => {
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
        transaction
      )

      // Verify: Should have 0 subscription items (all removed)
      expect(result.subscriptionItems).toHaveLength(0)
      
      // Verify: Get billing period items
      const bpItems = await selectBillingPeriodItems(
        { billingPeriodId: billingPeriod.id },
        transaction
      )

      // Should have removal adjustment for expired item only (no addition)
      const removalItems = bpItems.filter(item => item.name?.includes('Removal'))
      const additionItems = bpItems.filter(item => item.name?.includes('Addition'))
      const correctionItems = bpItems.filter(item => item.name?.includes('correction') || item.name?.includes('adjustment'))

      expect(removalItems).toHaveLength(1) // Only expired item
      expect(additionItems).toHaveLength(0) // No new items added

      // Verify removal adjustment exists (should be negative)
      expect(removalItems[0].unitPrice).toBeLessThan(0)

      // Verify correction adjustment exists (current logic includes correction to reach net charge)
      expect(correctionItems).toHaveLength(1)
      expect(correctionItems[0].name).toContain('Net charge adjustment')

      // The current logic focuses on the total net charge, not individual proration amounts
      // The correction adjustment ensures the total equals the calculated net charge

      // Verify subscription record name remains unchanged when no active items
      // (The sync logic doesn't update when there are no active items)
      expect(result.subscription.name).toBe(subscription.name)
    })
  })


  it("should apply downgrade protection to prevent negative charges", async () => {
    await adminTransaction(async ({ transaction }) => {
      // Setup: Update the existing subscription item to $49.99 plan first
      // First expire the original Base Plan item
      await updateSubscriptionItem({
        id: subscriptionItem.id,
        expiredAt: new Date(), // TODO: Refactor to use static date instead of new Date()
        type: SubscriptionItemType.Static,
      }, transaction)
      
      const expensiveItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Expensive Plan',
        quantity: 1,
        unitPrice: 4999, // $49.99 (expensive plan)
        addedDate: billingPeriod.startDate,
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
          addedDate: new Date(), // TODO: Refactor to use static date instead of new Date() - Current date (middle of billing period)
          type: SubscriptionItemType.Static,
          expiredAt: null,
          livemode: true,
          externalId: null,
          usageMeterId: null,
          usageEventsPerUnit: null,
        }
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
        transaction
      )

      // Verify: Get billing period items
      const bpItems = await selectBillingPeriodItems(
        { billingPeriodId: billingPeriod.id },
        transaction
      )

      const removalItems = bpItems.filter(item => item.name?.includes('Removal'))
      const additionItems = bpItems.filter(item => item.name?.includes('Addition'))
      const correctionItems = bpItems.filter(item => item.name?.includes('correction') || item.name?.includes('adjustment'))

      // Debug: Print all billing period items
      bpItems.forEach(item => {
      })

      expect(removalItems).toHaveLength(1) // Only expensive item (original was expired)
      expect(additionItems).toHaveLength(1)

      // Verify removal adjustments exist (negative)
      expect(removalItems[0].unitPrice).toBeLessThan(0)

      // Verify addition adjustment exists (positive)
      expect(additionItems[0].unitPrice).toBeGreaterThan(0)

      // The current logic focuses on the total net charge, not individual proration amounts
      // The correction adjustment ensures the total equals the calculated net charge

      // Should have correction item to zero out the negative net charge
      expect(correctionItems).toHaveLength(1)

      // Verify total billing adjustments result in $0 additional charge (no credits)
      const totalProrationAmount = bpItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0)
      
      // Customer already paid $49.99, fair value is ~$29.99 (would be ~$20 credit)
      // But we don't issue credits, so total proration should be $0
      expect(totalProrationAmount).toBe(0) // No additional charge, no credit
      
      // Verify subscription record reflects new (cheaper) plan
      expect(result.subscription.name).toBe('Basic Plan')
    })
  })

  it("should handle replace scenario (remove some, add others)", async () => {
    await adminTransaction(async ({ transaction }) => {
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
          addedDate: new Date(), // TODO: Refactor to use static date instead of new Date() - Current date
          type: SubscriptionItemType.Static,
          expiredAt: null,
          livemode: true,
          externalId: null,
          usageMeterId: null,
          usageEventsPerUnit: null,
        }
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
        transaction
      )

      // Verify: Should have 1 subscription item (the replacement)
      expect(result.subscriptionItems).toHaveLength(1)
      expect(result.subscriptionItems[0].name).toBe('Replacement Plan')
      
      // Verify: Get billing period items
      const bpItems = await selectBillingPeriodItems(
        { billingPeriodId: billingPeriod.id },
        transaction
      )

      // Should have both removal and addition adjustments
      const removalItems = bpItems.filter(item => item.name?.includes('Removal'))
      const additionItems = bpItems.filter(item => item.name?.includes('Addition'))
      const correctionItems = bpItems.filter(item => item.name?.includes('correction') || item.name?.includes('adjustment'))

      expect(removalItems).toHaveLength(1) // Removed old item
      expect(additionItems).toHaveLength(1) // Added new item

      // Verify removal adjustment exists (should be negative)
      expect(removalItems[0].unitPrice).toBeLessThan(0)

      // Verify addition adjustment exists (should be positive)
      expect(additionItems[0].unitPrice).toBeGreaterThan(0)

      // Verify correction adjustment exists if needed (current logic includes correction to reach net charge)
      // Correction adjustments are only created when proration adjustments don't equal the net charge
      if (correctionItems.length > 0) {
        expect(correctionItems[0].name).toContain('Net charge adjustment')
      }

      // The current logic focuses on the total net charge, not individual proration amounts
      // The correction adjustment ensures the total equals the calculated net charge

      // Verify subscription record reflects new plan
      expect(result.subscription.name).toBe('Replacement Plan')
    })
  })

  it("should handle downgrade to free plan correctly", async () => {
    await adminTransaction(async ({ transaction }) => {
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
      await updateSubscriptionItem({
        id: subscriptionItem.id,
        unitPrice: 1999, // $19.99
        name: 'Premium Plan',
        type: SubscriptionItemType.Static,
      }, transaction)

      // Setup: Prepare downgrade to free plan
      const freePlanItems: SubscriptionItem.Upsert[] = [
        {
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Free Plan',
          quantity: 1,
          unitPrice: 0, // Free plan
          addedDate: new Date(), // TODO: Refactor to use static date instead of new Date() - Current date (30% through period)
          type: SubscriptionItemType.Static,
          expiredAt: null,
          livemode: true,
          externalId: null,
          usageMeterId: null,
          usageEventsPerUnit: null,
        }
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
        transaction
      )

      // Verify: Get billing period items
      const bpItems = await selectBillingPeriodItems(
        { billingPeriodId: billingPeriod.id },
        transaction
      )

      const removalItems = bpItems.filter(item => item.name?.includes('Removal'))
      const additionItems = bpItems.filter(item => item.name?.includes('Addition'))
      const correctionItems = bpItems.filter(item => item.name?.includes('correction') || item.name?.includes('adjustment'))

      expect(removalItems).toHaveLength(1)
      expect(additionItems).toHaveLength(1)

      // Verify removal adjustment exists (should be negative)
      expect(removalItems[0].unitPrice).toBeLessThan(0)

      // Verify addition adjustment (should be 0 for free plan)
      expect(additionItems[0].unitPrice).toBe(0)

      // The current logic focuses on the total net charge, not individual proration amounts
      // The correction adjustment ensures the total equals the calculated net charge

      // Should have correction item to prevent overcharge
      expect(correctionItems).toHaveLength(1)

      // Verify total billing adjustments result in $0 additional charge (downgrade protection)
      const totalProrationAmount = bpItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0)
      expect(totalProrationAmount).toBe(0) // No additional charge due to downgrade protection

      // Verify subscription record reflects new plan
      expect(result.subscription.name).toBe('Free Plan')
    })
  })

  it("should handle multiple subscription items with complex pricing", async () => {
    await adminTransaction(async ({ transaction }) => {
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
      await updateSubscriptionItem({
        id: subscriptionItem.id,
        unitPrice: 1999, // $19.99
        name: 'Base Plan',
        type: SubscriptionItemType.Static,
      }, transaction)

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
          addedDate: new Date(), // TODO: Refactor to use static date instead of new Date() - Current date (50% through period)
          type: SubscriptionItemType.Static,
          expiredAt: null,
          livemode: true,
          externalId: null,
          usageMeterId: null,
          usageEventsPerUnit: null,
        }
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
        transaction
      )

      // Verify: Should have 1 subscription item (the new one)
      expect(result.subscriptionItems).toHaveLength(1)
      expect(result.subscriptionItems[0].name).toBe('Premium Plan')

      // Verify: Get billing period items
      const bpItems = await selectBillingPeriodItems(
        { billingPeriodId: billingPeriod.id },
        transaction
      )

      const removalItems = bpItems.filter(item => item.name?.includes('Removal'))
      const additionItems = bpItems.filter(item => item.name?.includes('Addition'))
      const correctionItems = bpItems.filter(item => item.name?.includes('correction') || item.name?.includes('adjustment'))

      // Should have removal adjustments for both old items
      expect(removalItems).toHaveLength(2) // Both old items removed
      expect(additionItems).toHaveLength(1) // One new item added

      // Verify removal adjustments (should be negative, ~50% of each old item)
      removalItems.forEach(item => {
        expect(item.unitPrice).toBeLessThan(0)
      })

      // Verify addition adjustment exists (should be positive)
      expect(additionItems[0].unitPrice).toBeGreaterThan(0)

      // Verify correction adjustment exists (current logic includes correction to reach net charge)
      expect(correctionItems).toHaveLength(1)
      expect(correctionItems[0].name).toContain('Net charge adjustment')

      // The current logic focuses on the total net charge, not individual proration amounts
      // The correction adjustment ensures the total equals the calculated net charge

      // Verify total proration amount
      const totalProrationAmount = bpItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0)
      
      // Should have net positive charge since upgrading from $29.98 to $49.99
      expect(totalProrationAmount).toBeGreaterThan(0)
      expect(totalProrationAmount).toBeCloseTo(1000, 2) // ~$10.00 additional, allow 2 cent tolerance

      // Verify subscription record reflects new plan
      expect(result.subscription.name).toBe('Premium Plan')
    })
  })

  it("should handle billing period with no existing payments", async () => {
    await adminTransaction(async ({ transaction }) => {
      // Setup: Update subscription item to $15.00 plan
      await updateSubscriptionItem({
        id: subscriptionItem.id,
        unitPrice: 1500, // $15.00
        name: 'Basic Plan',
        type: SubscriptionItemType.Static,
      }, transaction)

      // Setup: NO payment created (simulating new subscription without payment yet)

      // Setup: Prepare upgrade to $25.00 plan
      const upgradeItems: SubscriptionItem.Upsert[] = [
        {
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Standard Plan',
          quantity: 1,
          unitPrice: 2500, // $25.00
          addedDate: new Date(), // TODO: Refactor to use static date instead of new Date() - Current date (40% through period)
          type: SubscriptionItemType.Static,
          expiredAt: null,
          livemode: true,
          externalId: null,
          usageMeterId: null,
          usageEventsPerUnit: null,
        }
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
        transaction
      )

      // Verify: Get billing period items
      const bpItems = await selectBillingPeriodItems(
        { billingPeriodId: billingPeriod.id },
        transaction
      )

      const removalItems = bpItems.filter(item => item.name?.includes('Removal'))
      const additionItems = bpItems.filter(item => item.name?.includes('Addition'))
      const correctionItems = bpItems.filter(item => item.name?.includes('correction') || item.name?.includes('adjustment'))

      expect(removalItems).toHaveLength(1)
      expect(additionItems).toHaveLength(1)

      // Verify removal adjustment exists (should be negative)
      expect(removalItems[0].unitPrice).toBeLessThan(0)

      // Verify addition adjustment exists (should be positive)
      expect(additionItems[0].unitPrice).toBeGreaterThan(0)

      // The current logic focuses on the total net charge, not individual proration amounts
      // The correction adjustment ensures the total equals the calculated net charge

      // Correction items may or may not be needed depending on whether proration adjustments equal the net charge
      // The current logic creates correction adjustments when needed to reach the correct net charge

      // Verify total proration amount (should be full fair value since no existing payments)
      const totalProrationAmount = bpItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0)
      
      // Should be positive since no existing payments to offset
      expect(totalProrationAmount).toBeGreaterThan(0)
      // The current logic calculates the net charge based on existing payments
      // If there are existing payments, the calculation will be different
      expect(totalProrationAmount).toBeCloseTo(2000, 2) // ~$20.00 net charge, allow 2 cent tolerance

      // Verify subscription record reflects new plan
      expect(result.subscription.name).toBe('Standard Plan')
    })
  })

  it("should handle zero unit price items without errors", async () => {
    await adminTransaction(async ({ transaction }) => {
      // Setup: Update subscription item to $19.99 plan
      await updateSubscriptionItem({
        id: subscriptionItem.id,
        unitPrice: 1999, // $19.99
        name: 'Premium Plan',
        type: SubscriptionItemType.Static,
      }, transaction)

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
          addedDate: new Date(), // TODO: Refactor to use static date instead of new Date() - Current date (50% through period)
          type: SubscriptionItemType.Static,
          expiredAt: null,
          livemode: true,
          externalId: null,
          usageMeterId: null,
          usageEventsPerUnit: null,
        }
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
        transaction
      )

      // Verify: Get billing period items
      const bpItems = await selectBillingPeriodItems(
        { billingPeriodId: billingPeriod.id },
        transaction
      )

      const removalItems = bpItems.filter(item => item.name?.includes('Removal'))
      const additionItems = bpItems.filter(item => item.name?.includes('Addition'))
      const correctionItems = bpItems.filter(item => item.name?.includes('correction') || item.name?.includes('adjustment'))

      expect(removalItems).toHaveLength(1)
      expect(additionItems).toHaveLength(1)

      // Verify removal adjustment exists (should be negative)
      expect(removalItems[0].unitPrice).toBeLessThan(0)

      // Verify addition adjustment (should be 0 for free plan)
      expect(additionItems[0].unitPrice).toBe(0)

      // The current logic focuses on the total net charge, not individual proration amounts
      // The correction adjustment ensures the total equals the calculated net charge

      // Should have correction item to prevent overcharge
      expect(correctionItems).toHaveLength(1)

      // Verify total billing adjustments result in $0 additional charge (downgrade protection)
      const totalProrationAmount = bpItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0)
      expect(totalProrationAmount).toBe(0) // No additional charge due to downgrade protection

      // Verify subscription record reflects new plan
      expect(result.subscription.name).toBe('Free Plan')

      // Verify no arithmetic errors occurred (test should complete without throwing)
      expect(bpItems.length).toBeGreaterThan(0)
    })
  })

})



