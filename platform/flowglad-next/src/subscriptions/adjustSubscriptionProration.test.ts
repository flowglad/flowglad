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

    // Set up subscription with billing period (using fixed dates for deterministic tests)
    const billingPeriodStart = new Date('2024-01-01T00:00:00Z') // Fixed start date
    const billingPeriodEnd = new Date('2025-01-01T00:00:00Z')   // Fixed end date (1 year later, so we're in the middle)

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
          addedDate: new Date('2024-01-16T00:00:00Z'), // Fixed mid-period date for 50% through billing period
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

      // Expected: Fair value = 50% old plan + 50% new plan = $4.995 + $24.995 = $29.99
      // Expected: Existing payment = $9.99 (Processing should be counted)
      // Expected: Net charge should result in total customer payment of $29.99

      // Verify proration items are created
      const removalItems = bpItems.filter(item => item.name?.includes('Removal'))
      const additionItems = bpItems.filter(item => item.name?.includes('Addition'))
      const correctionItems = bpItems.filter(item => item.name?.includes('correction'))

      expect(removalItems).toHaveLength(1)
      expect(additionItems).toHaveLength(1)

      // Verify removal adjustment (should be negative, ~50% of $9.99)
      expect(removalItems[0].unitPrice).toBeLessThan(0)
      expect(Math.abs(removalItems[0].unitPrice)).toBeGreaterThanOrEqual(499) // ~$5.00, allow 1 cent tolerance
      expect(Math.abs(removalItems[0].unitPrice)).toBeLessThanOrEqual(501) // ~$5.00, allow 1 cent tolerance, allow 2 cent tolerance

      // Verify addition adjustment (should be positive, ~50% of $49.99) 
      expect(additionItems[0].unitPrice).toBeGreaterThan(0)
      expect(additionItems[0].unitPrice).toBeGreaterThanOrEqual(2499) // ~$25.00, allow 1 cent tolerance
      expect(additionItems[0].unitPrice).toBeLessThanOrEqual(2501) // ~$25.00, allow 1 cent tolerance

      // Verify subscription record reflects new plan
      expect(result.subscription.name).toBe('Premium Plan')

      // Verify total billing items result in fair customer charge
      const totalProrationAmount = bpItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0)
      
      // With existing $9.99 payment + proration adjustments, customer should pay ~$29.99 total
      // This means proration should add ~$20.00 net additional charge
      expect(999 + totalProrationAmount).toBeCloseTo(2999, 50) // Within $0.50 due to rounding
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
          addedDate: new Date('2024-01-16T00:00:00Z'), // Fixed mid-period date for 50% through billing period
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

      expect(removalItems).toHaveLength(1)
      expect(additionItems).toHaveLength(1)

      // Processing and Succeeded payments should be treated identically
      expect(removalItems[0].unitPrice).toBeLessThan(0)
      expect(Math.abs(removalItems[0].unitPrice)).toBeGreaterThanOrEqual(499) // ~$5.00, allow 1 cent tolerance
      expect(Math.abs(removalItems[0].unitPrice)).toBeLessThanOrEqual(501) // ~$5.00, allow 1 cent tolerance, allow 2 cent tolerance

      expect(additionItems[0].unitPrice).toBeGreaterThan(0)
      expect(additionItems[0].unitPrice).toBeGreaterThanOrEqual(2499) // ~$25.00, allow 1 cent tolerance
      expect(additionItems[0].unitPrice).toBeLessThanOrEqual(2501) // ~$25.00, allow 1 cent tolerance

      // Verify final charge calculation
      const totalProrationAmount = bpItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0)
      expect(999 + totalProrationAmount).toBeCloseTo(2999, 50) // Total ~$29.99
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
          addedDate: new Date('2024-01-16T00:00:00Z'), // Fixed mid-period date for 50% through billing period
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

      expect(removalItems).toHaveLength(1)
      expect(additionItems).toHaveLength(1)

      // Verify proration amounts are same as other tests (50% through period)
      expect(removalItems[0].unitPrice).toBeLessThan(0)
      expect(Math.abs(removalItems[0].unitPrice)).toBeGreaterThanOrEqual(499) // ~$5.00, allow 1 cent tolerance
      expect(Math.abs(removalItems[0].unitPrice)).toBeLessThanOrEqual(501) // ~$5.00, allow 1 cent tolerance

      expect(additionItems[0].unitPrice).toBeGreaterThan(0)
      expect(additionItems[0].unitPrice).toBeGreaterThanOrEqual(2499) // ~$25.00, allow 1 cent tolerance
      expect(additionItems[0].unitPrice).toBeLessThanOrEqual(2501) // ~$25.00, allow 1 cent tolerance

      // Critical difference: Since failed payment is ignored, customer pays FULL fair value
      const totalProrationAmount = bpItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0)
      
      // Customer should pay full $29.99 since no successful payment exists
      // This means proration adjustments alone should equal ~$29.99
      expect(totalProrationAmount).toBeCloseTo(2999, 50) // ~$29.99 from proration alone
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
          addedDate: new Date('2024-01-01T00:00:00Z'),
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
          addedDate: new Date('2024-01-16T00:00:00Z'),
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
      expect(additionItems[0].unitPrice).toBeGreaterThanOrEqual(999) // ~$10.00, allow 1 cent tolerance
      expect(additionItems[0].unitPrice).toBeLessThanOrEqual(1001) // ~$10.00, allow 1 cent tolerance

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

      // Setup: Remove existing subscription item (expire it) without adding new ones
      const removeOnlyItems: SubscriptionItem.Upsert[] = [
        {
          // Expire existing item by setting expiredAt
          id: subscriptionItem.id,
      subscriptionId: subscription.id,
      priceId: price.id,
      name: 'Base Plan',
      quantity: 1,
          unitPrice: 999, // Keep existing plan
          addedDate: new Date('2024-01-01T00:00:00Z'),
      type: SubscriptionItemType.Static,
          expiredAt: new Date('2024-01-16T00:00:00Z'), // Expire at mid-period
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
            newSubscriptionItems: removeOnlyItems,
            timing: SubscriptionAdjustmentTiming.Immediately,
            prorateCurrentBillingPeriod: true,
          },
        },
        transaction
      )

      // Verify: Should have 0 active subscription items (all expired)
      expect(result.subscriptionItems).toHaveLength(0)
      
      // Verify: Get billing period items
      const bpItems = await selectBillingPeriodItems(
        { billingPeriodId: billingPeriod.id },
        transaction
      )

      // Should have removal adjustment for expired item only (no addition)
      const removalItems = bpItems.filter(item => item.name?.includes('Removal'))
      const additionItems = bpItems.filter(item => item.name?.includes('Addition'))

      expect(removalItems).toHaveLength(1) // Only expired item
      expect(additionItems).toHaveLength(0) // No new items added

      // Verify removal adjustment (should be negative, ~50% of $9.99)
      expect(removalItems[0].unitPrice).toBeLessThan(0)
      expect(Math.abs(removalItems[0].unitPrice)).toBeGreaterThanOrEqual(499) // ~$5.00, allow 1 cent tolerance
      expect(Math.abs(removalItems[0].unitPrice)).toBeLessThanOrEqual(501) // ~$5.00, allow 1 cent tolerance

      // Verify subscription record reflects no active items (should be null or empty)
      expect(result.subscription.name).toBeNull()
    })
  })

  it("should handle multiple mixed payment statuses correctly", () => {
    // setup:
    // - create subscription with $20.00 plan (unitPrice: 2000)
    // - create billing period 25% through
    // - create payment status Processing, amount $5.00 (500)
    // - create payment status Succeeded, amount $3.00 (300) 
    // - create payment status Failed, amount $2.00 (200)
    // - prepare change to $40.00 plan (unitPrice: 4000)

    // expects:
    // - existing payment total: $8.00 (Processing + Succeeded only, Failed ignored)
    // - fair value: 25% of $20.00 + 75% of $40.00 = $5.00 + $30.00 = $35.00
    // - net charge: $35.00 - $8.00 = $27.00 additional
    // - billing items should reflect detailed proration breakdown
  })

  it("should apply downgrade protection to prevent negative charges", async () => {
    await adminTransaction(async ({ transaction }) => {
      // Setup: Update the existing subscription item to $49.99 plan first
      // First expire the original Base Plan item
      await updateSubscriptionItem({
        id: subscriptionItem.id,
        expiredAt: new Date(),
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
          addedDate: new Date('2024-01-16T00:00:00Z'), // Fixed mid-period date for 50% through billing period
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
      console.log('All billing period items:')
      bpItems.forEach(item => {
        console.log(`- ${item.name}: ${item.unitPrice}`)
      })
      console.log('Correction items:', correctionItems.map(item => item.name))

      expect(removalItems).toHaveLength(1) // Only expensive item (original was expired)
      expect(additionItems).toHaveLength(1)

      // Verify removal adjustments (negative, ~50% of $49.99)
      expect(removalItems[0].unitPrice).toBeLessThan(0)
      // Should be ~$25.00 (expensive item)
      const removalAmounts = removalItems.map(item => Math.abs(item.unitPrice))
      expect(removalAmounts[0]).toBeGreaterThanOrEqual(2499) // ~$25.00, allow 1 cent tolerance
      expect(removalAmounts[0]).toBeLessThanOrEqual(2501) // ~$25.00, allow 1 cent tolerance

      // Verify addition adjustment (positive, ~50% of $9.99)
      expect(additionItems[0].unitPrice).toBeGreaterThan(0)
      expect(additionItems[0].unitPrice).toBeGreaterThanOrEqual(499) // ~$5.00, allow 1 cent tolerance
      expect(additionItems[0].unitPrice).toBeLessThanOrEqual(501) // ~$5.00, allow 1 cent tolerance

      // No correction needed - proration adjustments already sum to correct net charge
      expect(correctionItems).toHaveLength(0)

      // Verify total billing adjustments result in $0 additional charge
      const totalProrationAmount = bpItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0)
      
      // Customer already paid $49.99, fair value is ~$29.99, so should get ~$20 credit
      // Total amount customer pays should equal fair value (downgrade protection)
      expect(4999 + totalProrationAmount).toBeCloseTo(2999, 50) // Customer pays fair value
      
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

      // Setup: Replace existing item with a different one (remove old, add new)
      const replaceItems: SubscriptionItem.Upsert[] = [
        {
          // Remove existing item by expiring it
          id: subscriptionItem.id,
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Base Plan',
          quantity: 1,
          unitPrice: 999, // Old plan
          addedDate: new Date('2024-01-01T00:00:00Z'),
          type: SubscriptionItemType.Static,
          expiredAt: new Date('2024-01-16T00:00:00Z'), // Expire at mid-period
          livemode: true,
          externalId: null,
          usageMeterId: null,
          usageEventsPerUnit: null,
        },
        {
          // Add new item (no ID = new item)
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Replacement Plan',
          quantity: 1,
          unitPrice: 2999, // $29.99 replacement plan
          addedDate: new Date('2024-01-16T00:00:00Z'),
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

      // Verify: Should have 1 active subscription item (the replacement)
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

      expect(removalItems).toHaveLength(1) // Removed old item
      expect(additionItems).toHaveLength(1) // Added new item

      // Verify removal adjustment (should be negative, ~50% of $9.99)
      expect(removalItems[0].unitPrice).toBeLessThan(0)
      expect(Math.abs(removalItems[0].unitPrice)).toBeGreaterThanOrEqual(499) // ~$5.00, allow 1 cent tolerance
      expect(Math.abs(removalItems[0].unitPrice)).toBeLessThanOrEqual(501) // ~$5.00, allow 1 cent tolerance

      // Verify addition adjustment (should be positive, ~50% of $29.99)
      expect(additionItems[0].unitPrice).toBeGreaterThan(0)
      expect(additionItems[0].unitPrice).toBeGreaterThanOrEqual(1499) // ~$15.00, allow 1 cent tolerance
      expect(additionItems[0].unitPrice).toBeLessThanOrEqual(1501) // ~$15.00, allow 1 cent tolerance

      // Verify subscription record reflects new plan
      expect(result.subscription.name).toBe('Replacement Plan')
    })
  })

})

describe("Proration Logic - Upgrade/Downgrade Scenarios", () => {
  // Uses same setup as Payment Status Scenarios - no duplication needed

  it("should handle downgrade to free plan correctly", () => {
    // setup:
    // - create subscription with $19.99 plan (unitPrice: 1999)
    // - create billing period 30% through
    // - create payment with status Succeeded, amount $19.99
    // - prepare downgrade to free plan (unitPrice: 0)

    // expects:
    // - fair value: 30% of $19.99 + 70% of $0 = $5.997 + $0 = $5.997
    // - existing payment: $19.99
    // - net charge: $0 (downgrade protection)
    // - billing period items should still be created for audit trail
    // - removal adjustment for old plan, addition adjustment for free plan (0)
    // - correction adjustment to prevent overcharge
  })

  it("should handle same price plan changes correctly", () => {
    // setup:
    // - create subscription with "Basic Monthly" plan (unitPrice: 2999 = $29.99)
    // - create billing period 25% through  
    // - create payment with status Succeeded, amount $29.99
    // - prepare change to "Standard Monthly" plan (same unitPrice: 2999)

    // expects:
    // - fair value: 25% of $29.99 + 75% of $29.99 = $29.99 (no price difference)
    // - existing payment: $29.99  
    // - net charge: $0 (already covered)
    // - billing items: removal (-75% of $29.99), addition (+75% of $29.99), should net to $0
    // - no correction adjustment needed since no double-charge risk
  })

})

describe("Proration Logic - Timing Edge Cases", () => {
  // Uses same setup as Payment Status Scenarios - no duplication needed

  it("should handle full period upgrade at start of billing cycle", () => {
    // setup:
    // - create subscription with $9.99 plan (unitPrice: 999)
    // - create billing period at 0% through (adjustment at exact start date)
    // - create payment with status Succeeded, amount $9.99
    // - prepare upgrade to $49.99 plan (unitPrice: 4999)

    // expects:
    // - fair value: 0% of $9.99 + 100% of $49.99 = $0 + $49.99 = $49.99
    // - existing payment: $9.99
    // - net charge: $49.99 - $9.99 = $40.00 additional
    // - customer pays total of $49.99 (full new plan value)
    // - billing items: removal (-$0), addition (+$49.99)
  })

  it("should handle near-end-of-period adjustment with minimal proration", () => {
    // setup:
    // - create subscription with $9.99 plan (unitPrice: 999)
    // - create billing period 99% through (very close to end)
    // - create payment with status Succeeded, amount $9.99
    // - prepare upgrade to $49.99 plan (unitPrice: 4999)

    // expects:
    // - fair value: 99% of $9.99 + 1% of $49.99 = ~$9.89 + ~$0.50 = ~$10.39
    // - existing payment: $9.99
    // - net charge: minimal (around $0.40 additional)
    // - proration amounts should be very small due to timing
  })

  it("should handle multiple subscription items with complex pricing", () => {
    // setup:
    // - create subscription with multiple items: Item1 ($19.99), Item2 ($9.99) = $29.98 total
    // - create billing period 50% through
    // - create payment with status Succeeded, amount $29.98
    // - prepare change to single item worth $49.99

    // expects:
    // - old plan total: $29.98, new plan total: $49.99
    // - fair value: 50% of $29.98 + 50% of $49.99 = $14.99 + $24.995 = ~$39.985
    // - existing payment: $29.98
    // - net charge: ~$39.985 - $29.98 = ~$10.005 additional
    // - billing items should show removal of both old items, addition of new item
  })

})

describe("Proration Logic - Error Cases & Edge Conditions", () => {
  // Uses same setup as Payment Status Scenarios - no duplication needed

  it("should handle billing period with no existing payments", () => {
    // setup:
    // - create subscription with $15.00 plan (unitPrice: 1500)
    // - create billing period with no payment records
    // - prepare upgrade to $25.00 plan (unitPrice: 2500) at 40% through period

    // expects:
    // - existing payment total: $0 (no payments found)
    // - fair value: 40% of $15.00 + 60% of $25.00 = $6.00 + $15.00 = $21.00
    // - net charge: $21.00 (full fair value since no existing payments)
    // - no double-charge correction needed
    // - billing items: removal (-60% of $15.00), addition (+60% of $25.00)
  })

  it("should handle partial refunded payments correctly", () => {
    // setup:
    // - create subscription with $30.00 plan (unitPrice: 3000)
    // - create payment with status Succeeded, amount $30.00, refundedAmount $10.00
    // - create billing period 33% through
    // - prepare plan change to $45.00 plan (unitPrice: 4500)

    // expects:
    // - existing payment should be calculated as net amount: $30.00 - $10.00 = $20.00
    // - fair value: 33% of $30.00 + 67% of $45.00 = ~$9.90 + ~$30.15 = ~$40.05  
    // - net charge: ~$40.05 - $20.00 = ~$20.05 additional
    // - sumNetTotalSettledPaymentsForBillingPeriod should return correct net amount
  })

  it("should handle zero unit price items without errors", () => {
    // setup:
    // - create subscription with $19.99 plan (unitPrice: 1999)
    // - create billing period 50% through
    // - create payment with status Succeeded, amount $19.99
    // - prepare change to free plan (unitPrice: 0)

    // expects:
    // - fair value calculation should handle $0 correctly: 50% of $19.99 + 50% of $0 = ~$9.995
    // - existing payment: $19.99
    // - net charge: $0 (downgrade protection)
    // - billing period items should still be created for audit trail
    // - no arithmetic errors or division by zero issues
  })

  it("should handle fractional cent rounding consistently", () => {
    // setup:
    // - create subscription with $9.97 plan (unitPrice: 997) 
    // - create billing period 33.33% through (creates fractional cents)
    // - create payment with status Succeeded, amount $9.97
    // - prepare change to $14.95 plan (unitPrice: 1495)

    // expects:
    // - Math.round() should be applied consistently throughout calculations
    // - no rounding errors should accumulate between fair value and proration calculations  
    // - billing period item amounts should be properly rounded integers
    // - final charge amounts should make mathematical sense
  })

  it("should handle concurrent payment processing states", () => {
    // setup:
    // - create subscription with $25.00 plan (unitPrice: 2500)
    // - create one payment with status Succeeded, amount $15.00
    // - create another payment with status Processing, amount $10.00  
    // - create billing period 60% through
    // - prepare plan change to $35.00 plan (unitPrice: 3500)

    // expects:
    // - both Succeeded and Processing payments should be counted: $25.00 total
    // - fair value: 60% of $25.00 + 40% of $35.00 = $15.00 + $14.00 = $29.00
    // - net charge: $29.00 - $25.00 = $4.00 additional
    // - both payment states treated identically in calculation
  })

})

describe("Proration Logic - Integration with Existing Systems", () => {
  // Uses same setup as Payment Status Scenarios - no duplication needed

  it("should not interfere with non-prorated adjustments", () => {
    // setup:
    // - create subscription with $20.00 plan
    // - create billing period and payment
    // - prepare plan change with prorateCurrentBillingPeriod: false

    // expects:
    // - new proration logic should not be triggered
    // - adjustment should work exactly as before
    // - no proration billing period items should be created
    // - subscription record sync should still work normally
  })

  it("should work correctly with subscription record synchronization", () => {
    // setup:
    // - create subscription with multiple items, different prices
    // - create billing period and payment
    // - prepare plan change that triggers both proration AND subscription header sync

    // expects:
    // - proration should be calculated correctly based on most expensive item
    // - subscription record should reflect most expensive active item after adjustment
    // - both systems should work together without conflicts
    // - billing period items should reflect detailed proration breakdown
  })

})

describe("Proration Logic - Billing Period Item Verification", () => {
  // Uses same setup as Payment Status Scenarios - no duplication needed

  it("should create correct billing period items for upgrade scenario", () => {
    // setup:
    // - create subscription with $10.00 plan, 25% through period
    // - create succeeded payment for $10.00
    // - upgrade to $20.00 plan with proration

    // expects:
    // - should find removal adjustment item with negative amount (-75% of $10.00)
    // - should find addition adjustment item with positive amount (+75% of $20.00) 
    // - should find correction adjustment if double-charge would occur
    // - all items should have correct billingPeriodId, descriptions, and amounts
    // - total of all adjustments should result in fair customer charge
  })

  it("should create audit trail even when net charge is zero", () => {
    // setup:
    // - create downgrade scenario where customer owes $0 additional
    // - ensure existing payment covers fair value

    // expects:
    // - billing period items should still be created for transparency
    // - removal and addition adjustments should be present
    // - correction adjustment should bring total to $0 additional charge
    // - audit trail should clearly show the proration breakdown
  })

})