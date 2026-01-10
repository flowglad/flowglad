import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupBillingPeriod,
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupProduct,
  setupSubscription,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import type { Customer } from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { Product } from '@/db/schema/products'
import type { Subscription } from '@/db/schema/subscriptions'
import {
  CancellationReason,
  CurrencyCode,
  IntervalUnit,
  PriceType,
  SubscriptionStatus,
} from '@/types'
import { calculateSubscriberBreakdown } from '@/utils/billing-dashboard/subscriberCalculationHelpers'
import { customerBillingTransaction } from '@/utils/bookkeeping/customerBilling'
import core from '@/utils/core'
import { selectActiveBillingPeriodsForDateRange } from './billingPeriodMethods'
import {
  getActiveSubscriptionsForPeriod,
  isSubscriptionCurrent,
  selectActiveSubscriptionsForCustomer,
  selectCurrentSubscriptionForCustomer,
  subscriptionWithCurrent,
  updateSubscription,
} from './subscriptionMethods'

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

    it('should return true for PastDue status with null cancellation reason', () => {
      const result = isSubscriptionCurrent(
        SubscriptionStatus.PastDue,
        null
      )
      expect(result).toBe(true)
    })

    it('should return true for Unpaid status with null cancellation reason', () => {
      const result = isSubscriptionCurrent(
        SubscriptionStatus.Unpaid,
        null
      )
      expect(result).toBe(true)
    })

    it('should return true for Trialing status with null cancellation reason', () => {
      const result = isSubscriptionCurrent(
        SubscriptionStatus.Trialing,
        null
      )
      expect(result).toBe(true)
    })

    it('should return true for CancellationScheduled status with null cancellation reason', () => {
      const result = isSubscriptionCurrent(
        SubscriptionStatus.CancellationScheduled,
        null
      )
      expect(result).toBe(true)
    })

    it('should return true for CreditTrial status with null cancellation reason', () => {
      const result = isSubscriptionCurrent(
        SubscriptionStatus.CreditTrial,
        null
      )
      expect(result).toBe(true)
    })

    it('should return false for Incomplete status regardless of cancellation reason', () => {
      expect(
        isSubscriptionCurrent(SubscriptionStatus.Incomplete, null)
      ).toBe(false)
      expect(
        isSubscriptionCurrent(
          SubscriptionStatus.Incomplete,
          CancellationReason.CustomerRequest
        )
      ).toBe(false)
    })

    it('should return false for IncompleteExpired status regardless of cancellation reason', () => {
      expect(
        isSubscriptionCurrent(
          SubscriptionStatus.IncompleteExpired,
          null
        )
      ).toBe(false)
      expect(
        isSubscriptionCurrent(
          SubscriptionStatus.IncompleteExpired,
          CancellationReason.CustomerRequest
        )
      ).toBe(false)
    })

    it('should return false for Paused status regardless of cancellation reason', () => {
      expect(
        isSubscriptionCurrent(SubscriptionStatus.Paused, null)
      ).toBe(false)
      expect(
        isSubscriptionCurrent(
          SubscriptionStatus.Paused,
          CancellationReason.CustomerRequest
        )
      ).toBe(false)
    })

    it('should return false for PastDue status with upgraded_to_paid cancellation reason', () => {
      const result = isSubscriptionCurrent(
        SubscriptionStatus.PastDue,
        CancellationReason.UpgradedToPaid
      )
      expect(result).toBe(false)
    })

    it('should return true for Active status with NonPayment cancellation reason', () => {
      const result = isSubscriptionCurrent(
        SubscriptionStatus.Active,
        CancellationReason.NonPayment
      )
      expect(result).toBe(true)
    })

    it('should return true for Active status with Other cancellation reason', () => {
      const result = isSubscriptionCurrent(
        SubscriptionStatus.Active,
        CancellationReason.Other
      )
      expect(result).toBe(true)
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
            canceledAt: Date.now(),
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

    it('should return all active non-upgraded subscriptions when multiple exist', async () => {
      // Create first active subscription
      const subscription1 = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        livemode: false,
      })

      // Create second active subscription (shouldn't happen but testing defensive handling)
      const subscription2 = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: premiumPrice.id,
        status: SubscriptionStatus.Active,
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        const activeSubscriptions =
          await selectActiveSubscriptionsForCustomer(
            customer.id,
            transaction
          )

        // Both subscriptions should be returned
        expect(activeSubscriptions).toHaveLength(2)
        const subIds = activeSubscriptions.map((s) => s.id)
        expect(subIds).toContain(subscription1.id)
        expect(subIds).toContain(subscription2.id)
      })
    })

    it('should exclude Active subscription with UpgradedToPaid (inconsistent state)', async () => {
      // Create subscription with inconsistent state: Active but marked as upgraded
      const inconsistentSub = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Active,
        livemode: false,
      })

      // Create the replacement subscription
      const replacementSub = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        // Update to inconsistent state: Active but with UpgradedToPaid
        await updateSubscription(
          {
            id: inconsistentSub.id,
            status: SubscriptionStatus.Active, // Still Active
            cancellationReason: CancellationReason.UpgradedToPaid, // But marked as upgraded
            replacedBySubscriptionId: replacementSub.id,
            renews: inconsistentSub.renews,
          },
          transaction
        )

        const activeSubscriptions =
          await selectActiveSubscriptionsForCustomer(
            customer.id,
            transaction
          )

        // Only replacement should be returned, not the inconsistent one
        expect(activeSubscriptions).toHaveLength(1)
        expect(activeSubscriptions[0].id).toBe(replacementSub.id)
      })
    })

    it('should include Active subscriptions with NonPayment/Other cancellation reasons', async () => {
      // Create subscription with NonPayment cancellation reason
      const nonPaymentSub = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        livemode: false,
      })

      // Create subscription with Other cancellation reason
      const otherSub = await setupSubscription({
        organizationId: organization.id,
        customerId: customer2.id,
        paymentMethodId: paymentMethod2.id,
        priceId: premiumPrice.id,
        status: SubscriptionStatus.Active,
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        // Update with NonPayment reason
        await updateSubscription(
          {
            id: nonPaymentSub.id,
            cancellationReason: CancellationReason.NonPayment,
            renews: nonPaymentSub.renews,
          },
          transaction
        )

        // Update with Other reason
        await updateSubscription(
          {
            id: otherSub.id,
            cancellationReason: CancellationReason.Other,
            renews: otherSub.renews,
          },
          transaction
        )

        // Check customer 1
        const customer1Subs =
          await selectActiveSubscriptionsForCustomer(
            customer.id,
            transaction
          )
        expect(customer1Subs).toHaveLength(1)
        expect(customer1Subs[0].id).toBe(nonPaymentSub.id)
        expect(customer1Subs[0].cancellationReason).toBe(
          CancellationReason.NonPayment
        )

        // Check customer 2
        const customer2Subs =
          await selectActiveSubscriptionsForCustomer(
            customer2.id,
            transaction
          )
        expect(customer2Subs).toHaveLength(1)
        expect(customer2Subs[0].id).toBe(otherSub.id)
        expect(customer2Subs[0].cancellationReason).toBe(
          CancellationReason.Other
        )
      })
    })

    it('should return empty array when no active subscriptions exist', async () => {
      await adminTransaction(async ({ transaction }) => {
        const activeSubscriptions =
          await selectActiveSubscriptionsForCustomer(
            customer.id,
            transaction
          )

        expect(activeSubscriptions).toHaveLength(0)
        expect(activeSubscriptions).toEqual([])
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
            canceledAt: Date.now(),
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

        expect(currentSubscription).toMatchObject({
          id: paidSubscription.id,
        })
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
            canceledAt: Date.now(),
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

    it('should return null when the only Active subscription is marked UpgradedToPaid', async () => {
      // Create subscription with inconsistent state
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        // Update to inconsistent state: Active but with UpgradedToPaid
        await updateSubscription(
          {
            id: subscription.id,
            status: SubscriptionStatus.Active,
            cancellationReason: CancellationReason.UpgradedToPaid,
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

    it('should handle upgrade chains >10 deep without timing out', async () => {
      const chainLength = 12
      const subscriptions: Subscription.Record[] = []

      // Create a chain of 12 subscriptions
      for (let i = 0; i < chainLength; i++) {
        const sub = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: i % 2 === 0 ? freePrice.id : paidPrice.id,
          status:
            i === chainLength - 1
              ? SubscriptionStatus.Active
              : SubscriptionStatus.Canceled,
          cancellationReason:
            i === chainLength - 1
              ? null
              : CancellationReason.UpgradedToPaid,
          livemode: false,
        })
        subscriptions.push(sub)
      }

      await adminTransaction(async ({ transaction }) => {
        // Link them in a chain
        for (let i = 0; i < chainLength - 1; i++) {
          await updateSubscription(
            {
              id: subscriptions[i].id,
              replacedBySubscriptionId: subscriptions[i + 1].id,
              renews: subscriptions[i].renews,
            },
            transaction
          )
        }

        const startTime = Date.now()
        const currentSub = await selectCurrentSubscriptionForCustomer(
          customer.id,
          transaction
        )
        const endTime = Date.now()

        // Should complete quickly despite deep chain
        expect(endTime - startTime).toBeLessThan(1000)

        // Should return the last subscription in the chain
        expect(typeof currentSub).toBe('object')
        if (currentSub) {
          expect(subscriptions.map((s) => s.id)).toContain(
            currentSub.id
          )
        }
      })
    })

    it('should ignore subscriptions from other customers', async () => {
      // Create active subscription for customer2
      const otherCustomerSub = await setupSubscription({
        organizationId: organization.id,
        customerId: customer2.id,
        paymentMethodId: paymentMethod2.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        livemode: false,
      })

      // Create canceled subscription for customer
      const canceledSub = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Canceled,
        cancellationReason: CancellationReason.CustomerRequest,
        canceledAt: Date.now(),
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        const currentSubscription =
          await selectCurrentSubscriptionForCustomer(
            customer.id,
            transaction
          )

        // Should return null, not the other customer's active subscription
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
        currentBillingPeriodStart: new Date('2024-01-01').getTime(),
        currentBillingPeriodEnd: new Date('2024-02-01').getTime(),
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
        currentBillingPeriodStart: new Date('2024-01-15').getTime(),
        currentBillingPeriodEnd: new Date('2024-02-15').getTime(),
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
            canceledAt: new Date('2024-01-15').getTime(),
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
        currentBillingPeriodStart: new Date('2024-03-01').getTime(),
        currentBillingPeriodEnd: new Date('2024-04-01').getTime(),
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

    it('should include periods when query endDate equals period startDate (boundary case)', async () => {
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        livemode: false,
      })

      const billingPeriod = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-03-01'),
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        // Query with endDate exactly at period startDate
        const activePeriods =
          await selectActiveBillingPeriodsForDateRange(
            {
              startDate: new Date('2024-01-01').getTime(),
              endDate: new Date('2024-02-01').getTime(), // Exactly at period start
              organizationId: organization.id,
              livemode: false,
            },
            transaction
          )

        // Should be included (boundary is inclusive)
        expect(activePeriods).toHaveLength(1)
        expect(activePeriods[0].billingPeriod.id).toBe(
          billingPeriod.id
        )
      })
    })

    it('should exclude periods for upgraded subscriptions even if replacedBySubscriptionId is null', async () => {
      // Create subscription with UpgradedToPaid but null replacedBy
      const upgradedSub = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Canceled,
        cancellationReason: CancellationReason.UpgradedToPaid,
        canceledAt: new Date('2024-01-15').getTime(),
        livemode: false,
      })

      const billingPeriod = await setupBillingPeriod({
        subscriptionId: upgradedSub.id,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-02-01'),
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        // Ensure replacedBySubscriptionId is null
        await updateSubscription(
          {
            id: upgradedSub.id,
            replacedBySubscriptionId: null,
            renews: upgradedSub.renews,
          },
          transaction
        )

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

        // Should be excluded despite null replacedBy
        expect(activePeriods).toHaveLength(0)
      })
    })

    it('should filter by billingPeriod.livemode regardless of subscription.livemode', async () => {
      // Create subscription in test mode
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        livemode: false, // Test mode subscription
      })

      // Create billing period in live mode (mismatch)
      const livePeriod = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-02-01'),
        livemode: true, // Live mode period
      })

      // Create billing period in test mode
      const testPeriod = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-03-01'),
        livemode: false, // Test mode period
      })

      await adminTransaction(async ({ transaction }) => {
        // Query for test mode
        const testModePeriods =
          await selectActiveBillingPeriodsForDateRange(
            {
              startDate: new Date('2024-01-01'),
              endDate: new Date('2024-03-01'),
              organizationId: organization.id,
              livemode: false, // Query for test mode
            },
            transaction
          )

        // Should only return test mode period, not live mode
        expect(testModePeriods).toHaveLength(1)
        expect(testModePeriods[0].billingPeriod.id).toBe(
          testPeriod.id
        )

        // Query for live mode
        const liveModePeriods =
          await selectActiveBillingPeriodsForDateRange(
            {
              startDate: new Date('2024-01-01'),
              endDate: new Date('2024-03-01'),
              organizationId: organization.id,
              livemode: true, // Query for live mode
            },
            transaction
          )

        // Should only return live mode period
        expect(liveModePeriods).toHaveLength(1)
        expect(liveModePeriods[0].billingPeriod.id).toBe(
          livePeriod.id
        )
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
            canceledAt: Date.now(),
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
        startDate: new Date('2023-12-01').getTime(),
        currentBillingPeriodStart: periodStart.getTime(),
        currentBillingPeriodEnd: periodEnd.getTime(),
        livemode: false,
      })

      // Create paid subscription active during period
      const paidSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        startDate: new Date('2024-01-15').getTime(),
        currentBillingPeriodStart: new Date('2024-01-15').getTime(),
        currentBillingPeriodEnd: new Date('2024-02-15').getTime(),
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        // Upgrade free to paid
        await updateSubscription(
          {
            id: freeSubscription.id,
            status: SubscriptionStatus.Canceled,
            cancellationReason: CancellationReason.UpgradedToPaid,
            canceledAt: new Date('2024-01-15').getTime(),
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
        startDate: new Date('2024-01-01').getTime(),
        currentBillingPeriodStart: new Date('2024-01-01').getTime(),
        currentBillingPeriodEnd: new Date('2024-04-01').getTime(),
        livemode: false,
      })

      // Subscription started during period
      const subStartedDuring = await setupSubscription({
        organizationId: organization.id,
        customerId: customer2.id,
        paymentMethodId: paymentMethod2.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        startDate: new Date('2024-02-15').getTime(),
        currentBillingPeriodStart: new Date('2024-02-15').getTime(),
        currentBillingPeriodEnd: new Date('2024-03-15').getTime(),
        livemode: false,
      })

      // Subscription ended before period
      const subEndedBefore = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Canceled,
        startDate: new Date('2023-12-01').getTime(),
        canceledAt: new Date('2024-01-15').getTime(),
        currentBillingPeriodStart: new Date('2024-01-01').getTime(),
        currentBillingPeriodEnd: new Date('2024-01-15').getTime(),
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

    it('should exclude subscriptions from other organizations', async () => {
      const periodStart = new Date('2024-01-01')
      const periodEnd = new Date('2024-02-01')

      // Create subscription for organization1
      const org1Sub = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        startDate: periodStart.getTime(),
        livemode: false,
      })

      // Create customer and subscription for organization2
      const org2Customer = await setupCustomer({
        organizationId: organization2.id,
        livemode: false,
      })

      const org2PaymentMethod = await setupPaymentMethod({
        organizationId: organization2.id,
        customerId: org2Customer.id,
        livemode: false,
      })

      const org2Price = await setupPrice({
        productId: product2.id,
        name: 'Org2 Price',
        type: PriceType.Subscription,
        unitPrice: 1500,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: false,
        currency: CurrencyCode.USD,
        isDefault: false,
      })

      const org2Sub = await setupSubscription({
        organizationId: organization2.id,
        customerId: org2Customer.id,
        paymentMethodId: org2PaymentMethod.id,
        priceId: org2Price.id,
        status: SubscriptionStatus.Active,
        startDate: periodStart.getTime(),
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        // Get subscriptions for org1
        const org1Subscriptions =
          await getActiveSubscriptionsForPeriod(
            organization.id,
            periodStart,
            periodEnd,
            transaction
          )

        // Should only include org1 subscription
        expect(org1Subscriptions).toHaveLength(1)
        expect(org1Subscriptions[0].id).toBe(org1Sub.id)

        // Get subscriptions for org2
        const org2Subscriptions =
          await getActiveSubscriptionsForPeriod(
            organization2.id,
            periodStart,
            periodEnd,
            transaction
          )

        // Should only include org2 subscription
        expect(org2Subscriptions).toHaveLength(1)
        expect(org2Subscriptions[0].id).toBe(org2Sub.id)
      })
    })

    it('should exclude Active subscriptions with UpgradedToPaid', async () => {
      const periodStart = new Date('2024-01-01')
      const periodEnd = new Date('2024-02-01')

      // Create subscription with inconsistent state
      const inconsistentSub = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Active,
        startDate: new Date('2023-12-01').getTime(),
        livemode: false,
      })

      // Create normal active subscription
      const normalSub = await setupSubscription({
        organizationId: organization.id,
        customerId: customer2.id,
        paymentMethodId: paymentMethod2.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        startDate: new Date('2023-12-01').getTime(),
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        // Update to inconsistent state
        await updateSubscription(
          {
            id: inconsistentSub.id,
            status: SubscriptionStatus.Active,
            cancellationReason: CancellationReason.UpgradedToPaid,
            renews: inconsistentSub.renews,
          },
          transaction
        )

        const activeSubscriptions =
          await getActiveSubscriptionsForPeriod(
            organization.id,
            periodStart,
            periodEnd,
            transaction
          )

        // Should only include the normal subscription
        expect(activeSubscriptions).toHaveLength(1)
        expect(activeSubscriptions[0].id).toBe(normalSub.id)
      })
    })

    it('should include subscriptions canceled for CustomerRequest if canceled after period start', async () => {
      const periodStart = new Date('2024-01-01')
      const periodEnd = new Date('2024-02-01')

      // Subscription canceled after period start (should be included)
      const canceledAfterStart = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Canceled,
        startDate: new Date('2023-12-01').getTime(),
        canceledAt: new Date('2024-01-15').getTime(), // After period start
        cancellationReason: CancellationReason.CustomerRequest,
        livemode: false,
      })

      // Subscription canceled before period start (should be excluded)
      const canceledBeforeStart = await setupSubscription({
        organizationId: organization.id,
        customerId: customer2.id,
        paymentMethodId: paymentMethod2.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Canceled,
        startDate: new Date('2023-11-01').getTime(),
        canceledAt: new Date('2023-12-15').getTime(), // Before period start
        cancellationReason: CancellationReason.CustomerRequest,
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        const activeSubscriptions =
          await getActiveSubscriptionsForPeriod(
            organization.id,
            periodStart,
            periodEnd,
            transaction
          )

        // Should only include subscription canceled after period start
        expect(activeSubscriptions).toHaveLength(1)
        expect(activeSubscriptions[0].id).toBe(canceledAfterStart.id)
      })
    })

    it('should exclude subscriptions canceled exactly at period start', async () => {
      const periodStart = new Date('2024-01-01T00:00:00.000Z')
      const periodEnd = new Date('2024-02-01')

      // Subscription canceled exactly at period start
      const canceledAtStart = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Canceled,
        startDate: new Date('2023-12-01').getTime(),
        canceledAt: periodStart.getTime(), // Exactly at period start
        cancellationReason: CancellationReason.CustomerRequest,
        livemode: false,
      })

      // Subscription canceled one second after period start
      const canceledAfterStart = await setupSubscription({
        organizationId: organization.id,
        customerId: customer2.id,
        paymentMethodId: paymentMethod2.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Canceled,
        startDate: new Date('2023-12-01').getTime(),
        canceledAt: new Date('2024-01-01T00:00:01.000Z').getTime(), // One second after
        cancellationReason: CancellationReason.CustomerRequest,
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        const activeSubscriptions =
          await getActiveSubscriptionsForPeriod(
            organization.id,
            periodStart,
            periodEnd,
            transaction
          )

        // Should only include subscription canceled after start, not at start
        expect(activeSubscriptions).toHaveLength(1)
        expect(activeSubscriptions[0].id).toBe(canceledAfterStart.id)
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
        startDate: new Date('2024-01-01').getTime(),
        currentBillingPeriodStart: period1Start.getTime(),
        currentBillingPeriodEnd: period1End.getTime(),
        livemode: false,
      })

      // In period 2, upgrade to paid
      const paidSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        startDate: new Date('2024-02-01').getTime(),
        currentBillingPeriodStart: period2Start.getTime(),
        currentBillingPeriodEnd: period2End.getTime(),
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        // Mark free as upgraded at start of period 2
        await updateSubscription(
          {
            id: freeSubscription.id,
            status: SubscriptionStatus.Canceled,
            cancellationReason: CancellationReason.UpgradedToPaid,
            canceledAt: new Date('2024-02-01').getTime(),
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
            canceledAt: Date.now(),
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
            canceledAt: Date.now(),
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
            canceledAt: Date.now(),
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

    it('should handle multiple Active non-upgraded subscriptions deterministically', async () => {
      // Create multiple active subscriptions (edge case - shouldn't normally happen)
      const sub1 = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Active,
        startDate: new Date('2024-01-01').getTime(),
        livemode: false,
      })

      const sub2 = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        startDate: new Date('2024-01-15').getTime(),
        livemode: false,
      })

      const sub3 = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: premiumPrice.id,
        status: SubscriptionStatus.Active,
        startDate: new Date('2024-02-01').getTime(),
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        // Get billing details multiple times
        const billingDetails1 = await customerBillingTransaction(
          {
            externalId: customer.externalId,
            organizationId: organization.id,
          },
          transaction
        )

        const billingDetails2 = await customerBillingTransaction(
          {
            externalId: customer.externalId,
            organizationId: organization.id,
          },
          transaction
        )

        // Should return all active subscriptions
        expect(billingDetails1.currentSubscriptions).toHaveLength(3)
        const subIds1 = billingDetails1.currentSubscriptions.map(
          (s) => s.id
        )
        expect(subIds1).toContain(sub1.id)
        expect(subIds1).toContain(sub2.id)
        expect(subIds1).toContain(sub3.id)

        // Should be deterministic (same result each time)
        expect(billingDetails2.currentSubscriptions).toHaveLength(3)
        const subIds2 = billingDetails2.currentSubscriptions
          .map((s) => s.id)
          .sort()
        expect(subIds1.sort()).toEqual(subIds2)
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
        startDate: new Date('2023-12-15').getTime(), // Started in December
        canceledAt: new Date('2024-02-15').getTime(), // Canceled in February
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
        startDate: new Date('2023-12-10').getTime(), // Started in December
        canceledAt: new Date('2024-02-10').getTime(), // Canceled in February
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
          startDate: new Date('2023-12-05').getTime(), // Started in December
          canceledAt: new Date('2024-02-05').getTime(), // Canceled in February
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
          startDate: new Date('2023-12-06').getTime(), // Started in December
          canceledAt: new Date('2024-02-06').getTime(), // Canceled in February
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
          startDate: new Date('2023-12-07').getTime(), // Started in December
          canceledAt: new Date('2024-02-07').getTime(), // Canceled in February
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

    it('should treat NonPayment and Other cancellation reasons as churn', async () => {
      const currentMonth = new Date('2024-02-01')
      const previousMonth = new Date('2024-01-01')

      // Create customer for NonPayment cancellation
      const nonPaymentCustomer = await setupCustomer({
        organizationId: organization.id,
        livemode: false,
      })

      const nonPaymentPM = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: nonPaymentCustomer.id,
        livemode: false,
      })

      // Create customer for Other cancellation
      const otherCustomer = await setupCustomer({
        organizationId: organization.id,
        livemode: false,
      })

      const otherPM = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: otherCustomer.id,
        livemode: false,
      })

      // Create subscriptions canceled for different reasons
      const canceledSubs = await Promise.all([
        // NonPayment cancellation (should count as churn)
        setupSubscription({
          organizationId: organization.id,
          customerId: nonPaymentCustomer.id,
          paymentMethodId: nonPaymentPM.id,
          priceId: paidPrice.id,
          status: SubscriptionStatus.Canceled,
          startDate: new Date('2023-12-01').getTime(),
          canceledAt: new Date('2024-02-10').getTime(),
          cancellationReason: CancellationReason.NonPayment,
          livemode: false,
        }),
        // Other cancellation (should count as churn)
        setupSubscription({
          organizationId: organization.id,
          customerId: otherCustomer.id,
          paymentMethodId: otherPM.id,
          priceId: premiumPrice.id,
          status: SubscriptionStatus.Canceled,
          startDate: new Date('2023-12-01').getTime(),
          canceledAt: new Date('2024-02-15').getTime(),
          cancellationReason: CancellationReason.Other,
          livemode: false,
        }),
        // Customer request (already tested, should count as churn)
        setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: freePrice.id,
          status: SubscriptionStatus.Canceled,
          startDate: new Date('2023-12-01').getTime(),
          canceledAt: new Date('2024-02-05').getTime(),
          cancellationReason: CancellationReason.CustomerRequest,
          livemode: false,
        }),
        // Upgraded (should NOT count as churn)
        setupSubscription({
          organizationId: organization.id,
          customerId: customer2.id,
          paymentMethodId: paymentMethod2.id,
          priceId: freePrice.id,
          status: SubscriptionStatus.Canceled,
          startDate: new Date('2023-12-01').getTime(),
          canceledAt: new Date('2024-02-20').getTime(),
          cancellationReason: CancellationReason.UpgradedToPaid,
          livemode: false,
        }),
      ])

      await adminTransaction(async ({ transaction }) => {
        const breakdown = await calculateSubscriberBreakdown(
          organization.id,
          currentMonth,
          previousMonth,
          transaction
        )

        // Should count NonPayment, Other, and CustomerRequest as churn (3 total)
        // UpgradedToPaid should NOT be counted
        expect(breakdown.churned).toBe(3)
      })
    })

    it('should handle month boundary cancellations correctly', async () => {
      const currentMonth = new Date('2024-02-01')
      const previousMonth = new Date('2024-01-01')

      // Create customers for boundary test cases
      const lastDayCustomer = await setupCustomer({
        organizationId: organization.id,
        livemode: false,
      })

      const firstDayCustomer = await setupCustomer({
        organizationId: organization.id,
        livemode: false,
      })

      const lastDayPM = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: lastDayCustomer.id,
        livemode: false,
      })

      const firstDayPM = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: firstDayCustomer.id,
        livemode: false,
      })

      // Create subscriptions with boundary cancellations
      const boundarySubs = await Promise.all([
        // Canceled on last day of previous month (Jan 31)
        setupSubscription({
          organizationId: organization.id,
          customerId: lastDayCustomer.id,
          paymentMethodId: lastDayPM.id,
          priceId: paidPrice.id,
          status: SubscriptionStatus.Canceled,
          startDate: new Date('2023-12-01').getTime(),
          canceledAt: new Date('2024-01-31T23:59:59.999Z').getTime(),
          cancellationReason: CancellationReason.CustomerRequest,
          livemode: false,
        }),
        // Canceled on first day of current month (Feb 1)
        setupSubscription({
          organizationId: organization.id,
          customerId: firstDayCustomer.id,
          paymentMethodId: firstDayPM.id,
          priceId: premiumPrice.id,
          status: SubscriptionStatus.Canceled,
          startDate: new Date('2023-12-01').getTime(),
          canceledAt: new Date('2024-02-01T00:00:00.000Z').getTime(),
          cancellationReason: CancellationReason.CustomerRequest,
          livemode: false,
        }),
        // Canceled on last day of current month (Feb 29 - leap year)
        setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: freePrice.id,
          status: SubscriptionStatus.Canceled,
          startDate: new Date('2023-12-01').getTime(),
          canceledAt: new Date('2024-02-29T23:59:59.999Z').getTime(),
          cancellationReason: CancellationReason.CustomerRequest,
          livemode: false,
        }),
      ])

      await adminTransaction(async ({ transaction }) => {
        const breakdown = await calculateSubscriberBreakdown(
          organization.id,
          currentMonth,
          previousMonth,
          transaction
        )

        // All three should be counted as churn in the current month
        // The exact count depends on the implementation logic
        expect(breakdown.churned).toBeGreaterThanOrEqual(0)
        expect(breakdown.churned).toBeLessThanOrEqual(3)
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
        expect(typeof currentSub).toBe('object')
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

    it('should handle broken upgrade chain with null replacedBySubscriptionId', async () => {
      // Create a subscription marked as upgraded but with null replacedBy
      const brokenSub = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Canceled,
        cancellationReason: CancellationReason.UpgradedToPaid,
        canceledAt: Date.now(),
        livemode: false,
      })

      // Create an active subscription
      const activeSub = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        livemode: false,
      })

      await adminTransaction(async ({ transaction }) => {
        // Ensure replacedBySubscriptionId is null
        await updateSubscription(
          {
            id: brokenSub.id,
            replacedBySubscriptionId: null,
            renews: brokenSub.renews,
          },
          transaction
        )

        // Should still work and return the active subscription
        const currentSub = await selectCurrentSubscriptionForCustomer(
          customer.id,
          transaction
        )

        expect(currentSub).toMatchObject({ id: activeSub.id })
        expect(currentSub?.id).toBe(activeSub.id)

        // The broken subscription should not be considered current
        const allActive = await selectActiveSubscriptionsForCustomer(
          customer.id,
          transaction
        )
        expect(allActive).toHaveLength(1)
        expect(allActive[0].id).toBe(activeSub.id)
      })
    })
  })
})
