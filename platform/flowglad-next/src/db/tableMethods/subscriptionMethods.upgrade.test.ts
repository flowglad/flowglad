import { describe, it, expect, beforeEach } from 'vitest'
import {
  isSubscriptionCurrent,
  selectActiveSubscriptionsForCustomer,
  selectCurrentSubscriptionForCustomer,
  subscriptionWithCurrent,
  updateSubscription,
  getActiveSubscriptionsForPeriod,
} from './subscriptionMethods'
import { selectActiveBillingPeriodsForDateRange } from './billingPeriodMethods'
import { customerBillingTransaction } from '@/utils/bookkeeping/customerBilling'
import { calculateSubscriberBreakdown } from '@/utils/billing-dashboard/subscriberCalculationHelpers'
import {
  CancellationReason,
  SubscriptionStatus,
  IntervalUnit,
  CurrencyCode,
  PriceType,
} from '@/types'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupOrg,
  setupCustomer,
  setupProduct,
  setupPrice,
  setupSubscription,
  setupPaymentMethod,
  setupBillingPeriod,
} from '@/../seedDatabase'
import { Organization } from '@/db/schema/organizations'
import { Customer } from '@/db/schema/customers'
import { Product } from '@/db/schema/products'
import { Price } from '@/db/schema/prices'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Subscription } from '@/db/schema/subscriptions'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import core from '@/utils/core'

describe('Subscription Upgrade Selection Logic', () => {
  let organization: Organization.Record
  let customer: Customer.Record
  let customer2: Customer.Record
  let product: Product.Record
  let freePrice: Price.Record
  let paidPrice: Price.Record
  let premiumPrice: Price.Record
  let paymentMethod: PaymentMethod.Record
  let paymentMethod2: PaymentMethod.Record

  // For tests that need a second organization
  let organization2: Organization.Record
  let product2: Product.Record

  beforeEach(async () => {
    // Setup organization with default product
    const orgData = await setupOrg()
    organization = orgData.organization
    product = orgData.product

    // Setup customer
    customer = await setupCustomer({
      organizationId: organization.id,
      email: `test+${core.nanoid()}@example.com`,
      livemode: false,
    })

    // Setup second customer for multi-customer tests
    customer2 = await setupCustomer({
      organizationId: organization.id,
      email: `test2+${core.nanoid()}@example.com`,
      livemode: false,
    })

    // Setup payment method
    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      livemode: false,
    })

    // Setup payment method for customer2
    paymentMethod2 = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer2.id,
      livemode: false,
    })

    // Setup free price
    freePrice = await setupPrice({
      productId: product.id,
      name: 'Free Plan',
      type: PriceType.Subscription,
      unitPrice: 0,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: false,
      currency: CurrencyCode.USD,
      isDefault: false,
    })

    // Setup basic paid price
    paidPrice = await setupPrice({
      productId: product.id,
      name: 'Basic Plan',
      type: PriceType.Subscription,
      unitPrice: 1000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: false,
      currency: CurrencyCode.USD,
      isDefault: false,
    })

    // Setup premium price for multi-tier upgrade tests
    premiumPrice = await setupPrice({
      productId: product.id,
      name: 'Premium Plan',
      type: PriceType.Subscription,
      unitPrice: 2500,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: false,
      currency: CurrencyCode.USD,
      isDefault: false,
    })

    // Setup second organization for org isolation tests (lazy init)
    // Will be set up in specific tests that need it
    const org2Data = await setupOrg()
    organization2 = org2Data.organization
    product2 = org2Data.product
  })

  describe('isSubscriptionCurrent', () => {
    it('should return false for Active status with upgraded_to_paid cancellation reason', () => {
      const result = isSubscriptionCurrent(
        SubscriptionStatus.Active,
        CancellationReason.UpgradedToPaid
      )
      expect(result).toBe(false)
    })

    it('should return true for Active status with null cancellation reason', () => {
      const result = isSubscriptionCurrent(
        SubscriptionStatus.Active,
        null
      )
      expect(result).toBe(true)
    })

    it('should return true for Active status with customer_request cancellation reason', () => {
      const result = isSubscriptionCurrent(
        SubscriptionStatus.Active,
        CancellationReason.CustomerRequest
      )
      expect(result).toBe(true)
    })

    it('should return false for Canceled status', () => {
      const result = isSubscriptionCurrent(
        SubscriptionStatus.Canceled,
        null
      )
      expect(result).toBe(false)
    })
  })

  describe('selectActiveSubscriptionsForCustomer', () => {
    it('should exclude upgraded subscription and return only active paid subscription', async () => {
      // Create free subscription
      const freeSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Active,
        livemode: false,
      })

      // Create paid subscription
      const paidSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        // Update free subscription to be canceled with upgrade reason
        await updateSubscription(
          {
            id: freeSubscription.id,
            status: SubscriptionStatus.Canceled,
            cancellationReason: CancellationReason.UpgradedToPaid,
            canceledAt: new Date(),
            replacedBySubscriptionId: paidSubscription.id,
            renews: freeSubscription.renews,
          },
          transaction
        )

        // Query active subscriptions
        const activeSubscriptions =
          await selectActiveSubscriptionsForCustomer(
            customer.id,
            transaction
          )

        expect(activeSubscriptions).toHaveLength(1)
        expect(activeSubscriptions[0].id).toBe(paidSubscription.id)
        expect(activeSubscriptions[0].status).toBe(
          SubscriptionStatus.Active
        )
      })
    })
  })

  describe('selectCurrentSubscriptionForCustomer', () => {
    it('should return the active paid subscription when free is upgraded', async () => {
      // Create free subscription
      const freeSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Active,
        livemode: false,
      })

      // Create paid subscription
      const paidSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        // Update free subscription to be canceled with upgrade reason
        await updateSubscription(
          {
            id: freeSubscription.id,
            status: SubscriptionStatus.Canceled,
            cancellationReason: CancellationReason.UpgradedToPaid,
            canceledAt: new Date(),
            replacedBySubscriptionId: paidSubscription.id,
            renews: freeSubscription.renews,
          },
          transaction
        )

        // Query current subscription
        const currentSubscription =
          await selectCurrentSubscriptionForCustomer(
            customer.id,
            transaction
          )

        expect(currentSubscription).not.toBeNull()
        expect(currentSubscription?.id).toBe(paidSubscription.id)
        expect(currentSubscription?.status).toBe(
          SubscriptionStatus.Active
        )
      })
    })

    it('should return null when no active subscriptions exist', async () => {
      // Create canceled subscription
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Active,
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        // Cancel it (not upgrade)
        await updateSubscription(
          {
            id: subscription.id,
            status: SubscriptionStatus.Canceled,
            cancellationReason: CancellationReason.CustomerRequest,
            canceledAt: new Date(),
            renews: subscription.renews,
          },
          transaction
        )

        const currentSubscription =
          await selectCurrentSubscriptionForCustomer(
            customer.id,
            transaction
          )

        expect(currentSubscription).toBeNull()
      })
    })
  })

  describe('subscriptionWithCurrent', () => {
    it('should add correct current flag based on status and cancellation reason', () => {
      const activeSubscription = {
        id: 'sub_1',
        status: SubscriptionStatus.Active,
        cancellationReason: null,
      } as Subscription.Record

      const upgradedSubscription = {
        id: 'sub_2',
        status: SubscriptionStatus.Active,
        cancellationReason: CancellationReason.UpgradedToPaid,
      } as Subscription.Record

      const canceledSubscription = {
        id: 'sub_3',
        status: SubscriptionStatus.Canceled,
        cancellationReason: CancellationReason.CustomerRequest,
      } as Subscription.Record

      expect(
        subscriptionWithCurrent(activeSubscription).current
      ).toBe(true)
      expect(
        subscriptionWithCurrent(upgradedSubscription).current
      ).toBe(false)
      expect(
        subscriptionWithCurrent(canceledSubscription).current
      ).toBe(false)
    })
  })

  describe('selectActiveBillingPeriodsForDateRange', () => {
    it('should exclude billing periods for upgraded subscriptions', async () => {
      // Create free subscription with billing period
      const freeSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Active,
        currentBillingPeriodStart: new Date('2024-01-01'),
        currentBillingPeriodEnd: new Date('2024-02-01'),
        livemode: false,
      })

      const freeBillingPeriod = await setupBillingPeriod({
        subscriptionId: freeSubscription.id,
        startDate: freeSubscription.currentBillingPeriodStart!,
        endDate: freeSubscription.currentBillingPeriodEnd!,
        livemode: false,
      })

      // Create paid subscription with billing period
      const paidSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        currentBillingPeriodStart: new Date('2024-01-15'),
        currentBillingPeriodEnd: new Date('2024-02-15'),
        livemode: false,
      })

      const paidBillingPeriod = await setupBillingPeriod({
        subscriptionId: paidSubscription.id,
        startDate: paidSubscription.currentBillingPeriodStart!,
        endDate: paidSubscription.currentBillingPeriodEnd!,
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        // Update free subscription to canceled with upgrade reason
        await updateSubscription(
          {
            id: freeSubscription.id,
            status: SubscriptionStatus.Canceled,
            cancellationReason: CancellationReason.UpgradedToPaid,
            canceledAt: new Date('2024-01-15'),
            replacedBySubscriptionId: paidSubscription.id,
            renews: freeSubscription.renews,
          },
          transaction
        )

        // Query billing periods for date range covering both
        const activePeriods =
          await selectActiveBillingPeriodsForDateRange(
            {
              startDate: new Date('2024-01-01'),
              endDate: new Date('2024-02-28'),
              organizationId: organization.id,
              livemode: false,
            },
            transaction
          )

        // Only paid subscription's billing period should be returned
        expect(activePeriods).toHaveLength(1)
        expect(activePeriods[0].billingPeriod.id).toBe(
          paidBillingPeriod.id
        )
        expect(activePeriods[0].subscription.id).toBe(
          paidSubscription.id
        )
        expect(
          activePeriods[0].subscription.cancellationReason
        ).not.toBe(CancellationReason.UpgradedToPaid)
      })
    })

    it('should include billing periods for active subscriptions', async () => {
      // Create active subscription
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        currentBillingPeriodStart: new Date('2024-03-01'),
        currentBillingPeriodEnd: new Date('2024-04-01'),
        livemode: false,
      })

      // Create multiple billing periods
      const period1 = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-02-01'),
        livemode: false,
      })

      const period2 = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-03-01'),
        livemode: false,
      })

      const period3 = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: new Date('2024-03-01'),
        endDate: new Date('2024-04-01'),
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        // Query all periods
        const activePeriods =
          await selectActiveBillingPeriodsForDateRange(
            {
              startDate: new Date('2024-01-01'),
              endDate: new Date('2024-04-01'),
              organizationId: organization.id,
              livemode: false,
            },
            transaction
          )

        // All periods should be returned
        expect(activePeriods).toHaveLength(3)
        expect(
          activePeriods.every(
            (p) => p.subscription.id === subscription.id
          )
        ).toBe(true)
        expect(
          activePeriods.every(
            (p) => p.subscription.status === SubscriptionStatus.Active
          )
        ).toBe(true)
      })
    })

    it('should respect date range filtering', async () => {
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        livemode: false,
      })

      // Create billing periods across 3 months
      const periodJan = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-02-01'),
        livemode: false,
      })

      const periodFeb = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-03-01'),
        livemode: false,
      })

      const periodMar = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: new Date('2024-03-01'),
        endDate: new Date('2024-04-01'),
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        // Query only for February (but will include overlapping periods)
        const activePeriods =
          await selectActiveBillingPeriodsForDateRange(
            {
              startDate: new Date('2024-02-01'),
              endDate: new Date('2024-02-28'),
              organizationId: organization.id,
              livemode: false,
            },
            transaction
          )

        // Both Jan (ends Feb 1) and Feb periods overlap with the query range
        expect(activePeriods).toHaveLength(2)
        const periodIds = activePeriods.map((p) => p.billingPeriod.id)
        expect(periodIds).toContain(periodJan.id)
        expect(periodIds).toContain(periodFeb.id)
      })
    })

    it('should handle subscriptions canceled for non-upgrade reasons', async () => {
      // Create subscription that will be canceled for non-upgrade reason
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        livemode: false,
      })

      // Create billing period for canceled subscription
      const billingPeriod = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-02-01'),
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        // Cancel with customer_request reason
        await updateSubscription(
          {
            id: subscription.id,
            status: SubscriptionStatus.Canceled,
            cancellationReason: CancellationReason.CustomerRequest,
            canceledAt: new Date(),
            renews: subscription.renews,
          },
          transaction
        )

        // Query billing periods
        const activePeriods =
          await selectActiveBillingPeriodsForDateRange(
            {
              startDate: new Date('2024-01-01'),
              endDate: new Date('2024-02-01'),
              organizationId: organization.id,
              livemode: false,
            },
            transaction
          )

        // Billing period should be included despite cancellation
        expect(activePeriods).toHaveLength(1)
        expect(activePeriods[0].billingPeriod.id).toBe(
          billingPeriod.id
        )
        expect(activePeriods[0].subscription.cancellationReason).toBe(
          CancellationReason.CustomerRequest
        )
      })
    })

    it('should filter by organizationId and livemode correctly', async () => {
      // Create subscription for org1 in test mode
      const subscriptionOrg1Test = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        livemode: false,
      })

      const periodOrg1Test = await setupBillingPeriod({
        subscriptionId: subscriptionOrg1Test.id,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-02-01'),
        livemode: false,
      })

      // Create subscription for org1 in live mode
      const subscriptionOrg1Live = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        livemode: true,
      })

      const periodOrg1Live = await setupBillingPeriod({
        subscriptionId: subscriptionOrg1Live.id,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-02-01'),
        livemode: true,
      })

      // Create subscription for org2
      const customerOrg2 = await setupCustomer({
        organizationId: organization2.id,
        livemode: false,
      })

      const pmOrg2 = await setupPaymentMethod({
        organizationId: organization2.id,
        customerId: customerOrg2.id,
        livemode: false,
      })

      const priceOrg2 = await setupPrice({
        productId: product2.id,
        name: 'Org2 Price',
        type: PriceType.Subscription,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: false,
        currency: CurrencyCode.USD,
        isDefault: false,
      })

      const subscriptionOrg2 = await setupSubscription({
        organizationId: organization2.id,
        customerId: customerOrg2.id,
        paymentMethodId: pmOrg2.id,
        priceId: priceOrg2.id,
        status: SubscriptionStatus.Active,
        livemode: false,
      })

      const periodOrg2 = await setupBillingPeriod({
        subscriptionId: subscriptionOrg2.id,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-02-01'),
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        // Query for org1 test mode only
        const activePeriods =
          await selectActiveBillingPeriodsForDateRange(
            {
              startDate: new Date('2024-01-01'),
              endDate: new Date('2024-02-01'),
              organizationId: organization.id,
              livemode: false,
            },
            transaction
          )

        // Only org1 test mode period should be returned
        expect(activePeriods).toHaveLength(1)
        expect(activePeriods[0].billingPeriod.id).toBe(
          periodOrg1Test.id
        )
      })
    })
  })

  describe('getActiveSubscriptionsForPeriod', () => {
    it('should exclude upgraded subscriptions from active count', async () => {
      const periodStart = new Date('2024-01-01')
      const periodEnd = new Date('2024-02-01')

      // Create free subscription active during period
      const freeSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Active,
        startDate: new Date('2023-12-01'),
        currentBillingPeriodStart: periodStart,
        currentBillingPeriodEnd: periodEnd,
        livemode: false,
      })

      // Create paid subscription active during period
      const paidSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        startDate: new Date('2024-01-15'),
        currentBillingPeriodStart: new Date('2024-01-15'),
        currentBillingPeriodEnd: new Date('2024-02-15'),
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        // Upgrade free to paid
        await updateSubscription(
          {
            id: freeSubscription.id,
            status: SubscriptionStatus.Canceled,
            cancellationReason: CancellationReason.UpgradedToPaid,
            canceledAt: new Date('2024-01-15'),
            replacedBySubscriptionId: paidSubscription.id,
            renews: freeSubscription.renews,
          },
          transaction
        )

        // Get active subscriptions for the period
        const activeSubscriptions =
          await getActiveSubscriptionsForPeriod(
            organization.id,
            periodStart,
            periodEnd,
            transaction
          )

        // Only paid subscription should be included
        expect(activeSubscriptions).toHaveLength(1)
        expect(activeSubscriptions[0].id).toBe(paidSubscription.id)
        expect(activeSubscriptions[0].cancellationReason).not.toBe(
          CancellationReason.UpgradedToPaid
        )
      })
    })

    it('should correctly filter by date period', async () => {
      const periodStart = new Date('2024-02-01')
      const periodEnd = new Date('2024-03-01')

      // Subscription active throughout period
      const subThroughout = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        startDate: new Date('2024-01-01'),
        currentBillingPeriodStart: new Date('2024-01-01'),
        currentBillingPeriodEnd: new Date('2024-04-01'),
        livemode: false,
      })

      // Subscription started during period
      const subStartedDuring = await setupSubscription({
        organizationId: organization.id,
        customerId: customer2.id,
        paymentMethodId: paymentMethod2.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        startDate: new Date('2024-02-15'),
        currentBillingPeriodStart: new Date('2024-02-15'),
        currentBillingPeriodEnd: new Date('2024-03-15'),
        livemode: false,
      })

      // Subscription ended before period
      const subEndedBefore = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Canceled,
        startDate: new Date('2023-12-01'),
        canceledAt: new Date('2024-01-15'),
        currentBillingPeriodStart: new Date('2024-01-01'),
        currentBillingPeriodEnd: new Date('2024-01-15'),
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        // Get active subscriptions for the period
        const activeSubscriptions =
          await getActiveSubscriptionsForPeriod(
            organization.id,
            periodStart,
            periodEnd,
            transaction
          )

        // Should include subscriptions active during period
        const activeIds = activeSubscriptions.map((s) => s.id)
        expect(activeIds).toContain(subThroughout.id)
        expect(activeIds).toContain(subStartedDuring.id)
        expect(activeIds).not.toContain(subEndedBefore.id)
      })
    })

    it('should handle subscription lifecycle transitions', async () => {
      const period1Start = new Date('2024-01-01')
      const period1End = new Date('2024-02-01')
      const period2Start = new Date('2024-02-01')
      const period2End = new Date('2024-03-01')

      // Create free subscription active in period 1
      const freeSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Active,
        startDate: new Date('2024-01-01'),
        currentBillingPeriodStart: period1Start,
        currentBillingPeriodEnd: period1End,
        livemode: false,
      })

      // In period 2, upgrade to paid
      const paidSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        startDate: new Date('2024-02-01'),
        currentBillingPeriodStart: period2Start,
        currentBillingPeriodEnd: period2End,
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        // Mark free as upgraded at start of period 2
        await updateSubscription(
          {
            id: freeSubscription.id,
            status: SubscriptionStatus.Canceled,
            cancellationReason: CancellationReason.UpgradedToPaid,
            canceledAt: new Date('2024-02-01'),
            replacedBySubscriptionId: paidSubscription.id,
            renews: freeSubscription.renews,
          },
          transaction
        )

        // Get subscriptions for period 1
        const period1Subs = await getActiveSubscriptionsForPeriod(
          organization.id,
          period1Start,
          period1End,
          transaction
        )

        // Get subscriptions for period 2
        const period2Subs = await getActiveSubscriptionsForPeriod(
          organization.id,
          period2Start,
          period2End,
          transaction
        )

        // Period 1: Only paid subscription (free is excluded due to upgrade)
        // The paid subscription started on Feb 1, which is the end of period 1
        expect(period1Subs).toHaveLength(1)
        expect(period1Subs[0].id).toBe(paidSubscription.id)

        // Period 2: Only paid subscription (free is still excluded)
        expect(period2Subs).toHaveLength(1)
        expect(period2Subs[0].id).toBe(paidSubscription.id)
      })
    })
  })

  describe('Customer Billing Integration', () => {
    it('should exclude upgraded free subscription from currentSubscriptions in customerBilling', async () => {
      // Create free subscription
      const freeSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Active,
        livemode: false,
      })

      // Create paid subscription (upgrade)
      const paidSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        // Mark free as upgraded
        await updateSubscription(
          {
            id: freeSubscription.id,
            status: SubscriptionStatus.Canceled,
            cancellationReason: CancellationReason.UpgradedToPaid,
            canceledAt: new Date(),
            replacedBySubscriptionId: paidSubscription.id,
            renews: freeSubscription.renews,
          },
          transaction
        )

        // Get customer billing details
        const billingDetails = await customerBillingTransaction(
          {
            externalId: customer.externalId,
            organizationId: organization.id,
          },
          transaction
        )

        // CurrentSubscriptions should only contain paid subscription
        expect(billingDetails.currentSubscriptions).toHaveLength(1)
        expect(billingDetails.currentSubscriptions[0].id).toBe(
          paidSubscription.id
        )
        expect(billingDetails.currentSubscriptions[0].status).toBe(
          SubscriptionStatus.Active
        )

        // Verify the upgraded subscription is not included
        const subscriptionIds =
          billingDetails.currentSubscriptions.map((s) => s.id)
        expect(subscriptionIds).not.toContain(freeSubscription.id)
      })
    })

    it('should handle multiple subscription upgrades in chain correctly', async () => {
      // Create free subscription
      const freeSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Active,
        livemode: false,
      })

      // Upgrade to basic paid
      const basicSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        livemode: false,
      })

      // Upgrade to premium
      const premiumSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: premiumPrice.id,
        status: SubscriptionStatus.Active,
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        await updateSubscription(
          {
            id: freeSubscription.id,
            status: SubscriptionStatus.Canceled,
            cancellationReason: CancellationReason.UpgradedToPaid,
            canceledAt: new Date(),
            replacedBySubscriptionId: basicSubscription.id,
            renews: freeSubscription.renews,
          },
          transaction
        )

        await updateSubscription(
          {
            id: basicSubscription.id,
            status: SubscriptionStatus.Canceled,
            cancellationReason: CancellationReason.UpgradedToPaid,
            canceledAt: new Date(),
            replacedBySubscriptionId: premiumSubscription.id,
            renews: basicSubscription.renews,
          },
          transaction
        )

        // Get customer billing details
        const billingDetails = await customerBillingTransaction(
          {
            externalId: customer.externalId,
            organizationId: organization.id,
          },
          transaction
        )

        // Only premium subscription should be current
        expect(billingDetails.currentSubscriptions).toHaveLength(1)
        expect(billingDetails.currentSubscriptions[0].id).toBe(
          premiumSubscription.id
        )

        // Neither free nor basic should be included
        const subscriptionIds =
          billingDetails.currentSubscriptions.map((s) => s.id)
        expect(subscriptionIds).not.toContain(freeSubscription.id)
        expect(subscriptionIds).not.toContain(basicSubscription.id)
      })
    })
  })

  describe('Analytics and Churn Calculations', () => {
    it('should not count upgraded subscriptions as churned', async () => {
      const currentMonth = new Date('2024-02-01')
      const previousMonth = new Date('2024-01-01')

      // Create subscription that was upgraded (not churn)
      // Must have been active in January (previous month)
      const upgradedSub = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Canceled,
        startDate: new Date('2023-12-15'), // Started in December
        canceledAt: new Date('2024-02-15'), // Canceled in February
        cancellationReason: CancellationReason.UpgradedToPaid,
        livemode: false,
      })

      // Create subscription canceled by customer (real churn)
      // Must have been active in January (previous month)
      const churnedSub = await setupSubscription({
        organizationId: organization.id,
        customerId: customer2.id,
        paymentMethodId: paymentMethod2.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Canceled,
        startDate: new Date('2023-12-10'), // Started in December
        canceledAt: new Date('2024-02-10'), // Canceled in February
        cancellationReason: CancellationReason.CustomerRequest,
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        // Calculate subscriber breakdown
        const breakdown = await calculateSubscriberBreakdown(
          organization.id,
          currentMonth,
          previousMonth,
          transaction
        )

        // Churned count should only include customer_request cancellation
        // Upgraded subscription should NOT be counted as churn
        expect(breakdown.churned).toBe(1) // Only the customer_request cancellation

        // Get all subscriptions for verification
        const allSubs = await getActiveSubscriptionsForPeriod(
          organization.id,
          new Date('2024-01-01'),
          new Date('2024-02-29'),
          transaction
        )

        // Verify the upgraded subscription is not in active list
        const upgradedInActive = allSubs.find(
          (s) =>
            s.id === upgradedSub.id &&
            s.cancellationReason === CancellationReason.UpgradedToPaid
        )
        expect(upgradedInActive).toBeUndefined()
      })
    })

    it('should handle mixed cancellation reasons correctly', async () => {
      const currentMonth = new Date('2024-02-01')
      const previousMonth = new Date('2024-01-01')

      // Create customer for third subscription
      const thirdCustomer = await setupCustomer({
        organizationId: organization.id,
        livemode: false,
      })

      // Create various canceled subscriptions
      const canceledSubs = await Promise.all([
        // Upgraded subscription (should not count as churn)
        setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: freePrice.id,
          status: SubscriptionStatus.Canceled,
          startDate: new Date('2023-12-05'), // Started in December
          canceledAt: new Date('2024-02-05'), // Canceled in February
          cancellationReason: CancellationReason.UpgradedToPaid,
          livemode: false,
        }),
        // Customer requested cancellation (should count as churn)
        setupSubscription({
          organizationId: organization.id,
          customerId: customer2.id,
          paymentMethodId: paymentMethod2.id,
          priceId: paidPrice.id,
          status: SubscriptionStatus.Canceled,
          startDate: new Date('2023-12-06'), // Started in December
          canceledAt: new Date('2024-02-06'), // Canceled in February
          cancellationReason: CancellationReason.CustomerRequest,
          livemode: false,
        }),
        // Another upgraded subscription
        setupSubscription({
          organizationId: organization.id,
          customerId: thirdCustomer.id,
          paymentMethodId: paymentMethod.id,
          priceId: paidPrice.id,
          status: SubscriptionStatus.Canceled,
          startDate: new Date('2023-12-07'), // Started in December
          canceledAt: new Date('2024-02-07'), // Canceled in February
          cancellationReason: CancellationReason.UpgradedToPaid,
          livemode: false,
        }),
      ])

      await adminTransaction(async ({ transaction }) => {
        // Calculate breakdown
        const breakdown = await calculateSubscriberBreakdown(
          organization.id,
          currentMonth,
          previousMonth,
          transaction
        )

        // Verify that upgraded subscriptions are not counted in churn
        // We created 2 upgraded and 1 customer_request cancellation
        // Only customer_request should count as churn
        const upgradedCount = canceledSubs.filter(
          (s) =>
            s.cancellationReason === CancellationReason.UpgradedToPaid
        ).length
        const customerRequestCount = canceledSubs.filter(
          (s) =>
            s.cancellationReason ===
            CancellationReason.CustomerRequest
        ).length

        expect(upgradedCount).toBe(2)
        expect(customerRequestCount).toBe(1)
        // Churn should only count customer_request, not upgrades
        expect(breakdown.churned).toBe(1) // Only customer_request counts as churn
      })
    })
  })

  describe('Complex Upgrade Chain Edge Cases', () => {
    it('should handle circular reference protection', async () => {
      // Create subscription A
      const subA = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Canceled,
        cancellationReason: CancellationReason.UpgradedToPaid,
        livemode: false,
      })

      // Create subscription B
      const subB = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        // Create a circular reference (this shouldn't happen in practice)
        // Update A to point to B
        await updateSubscription(
          {
            id: subA.id,
            replacedBySubscriptionId: subB.id,
            renews: subA.renews,
          },
          transaction
        )

        // Update B to point back to A (circular)
        await updateSubscription(
          {
            id: subB.id,
            replacedBySubscriptionId: subA.id,
            renews: subB.renews,
          },
          transaction
        )

        // This should not infinite loop
        const startTime = Date.now()
        const currentSub = await selectCurrentSubscriptionForCustomer(
          customer.id,
          transaction
        )
        const endTime = Date.now()

        // Should complete quickly (not timeout)
        expect(endTime - startTime).toBeLessThan(1000) // Less than 1 second

        // Should return something sensible (the active one or null)
        // The exact behavior depends on implementation
        if (currentSub) {
          expect([subA.id, subB.id]).toContain(currentSub.id)
        }
      })
    })

    it('should handle broken upgrade chains gracefully', async () => {
      // Create subscription with non-existent replacement
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Canceled,
        cancellationReason: CancellationReason.UpgradedToPaid,
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        // Update to point to non-existent subscription
        const fakeSubscriptionId = `sub_${core.nanoid()}`
        await updateSubscription(
          {
            id: subscription.id,
            replacedBySubscriptionId: fakeSubscriptionId,
            renews: subscription.renews,
          },
          transaction
        )

        // Should not throw when calling selectCurrentSubscriptionForCustomer
        let error = null
        let currentSub = null
        try {
          currentSub = await selectCurrentSubscriptionForCustomer(
            customer.id,
            transaction
          )
        } catch (e) {
          error = e
        }

        // Should not throw error
        expect(error).toBeNull()

        // Should handle gracefully (return null or the broken subscription)
        // The exact behavior depends on implementation
        if (currentSub) {
          expect(currentSub.id).toBe(subscription.id)
        }
      })
    })

    it('should handle upgrade chain with multiple branches', async () => {
      // Create base subscription
      const baseSub = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Canceled,
        cancellationReason: CancellationReason.UpgradedToPaid,
        livemode: false,
      })

      // Create two subscriptions that both "replace" the base
      // This shouldn't happen in practice but tests defensive handling
      const branch1 = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        livemode: false,
      })

      const branch2 = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: premiumPrice.id,
        status: SubscriptionStatus.Active,
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        // Update base to point to branch1
        await updateSubscription(
          {
            id: baseSub.id,
            replacedBySubscriptionId: branch1.id,
            renews: baseSub.renews,
          },
          transaction
        )

        // Get current subscription - should handle ambiguity
        const currentSub = await selectCurrentSubscriptionForCustomer(
          customer.id,
          transaction
        )

        // Should return one of the active subscriptions
        expect(currentSub).not.toBeNull()
        if (currentSub) {
          expect([branch1.id, branch2.id]).toContain(currentSub.id)
          expect(currentSub.status).toBe(SubscriptionStatus.Active)
        }

        // Verify it's deterministic (calling again returns same result)
        const currentSub2 =
          await selectCurrentSubscriptionForCustomer(
            customer.id,
            transaction
          )
        expect(currentSub2?.id).toBe(currentSub?.id)
      })
    })
  })
})
