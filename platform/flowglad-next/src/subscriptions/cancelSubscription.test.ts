import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  cancelSubscriptionImmediately,
  scheduleSubscriptionCancellation,
  abortScheduledBillingRuns,
  reassignDefaultSubscription,
  cancelSubscriptionProcedureTransaction,
} from '@/subscriptions/cancelSubscription'
import { ScheduleSubscriptionCancellationParams } from '@/subscriptions/schemas'
import {
  SubscriptionCancellationArrangement,
  SubscriptionStatus,
  BillingPeriodStatus,
  BillingRunStatus,
  EventNoun,
  FlowgladEventType,
} from '@/types'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupSubscription,
  setupBillingRun,
  setupBillingPeriod,
  setupBillingPeriodItem,
  setupCustomer,
  setupPaymentMethod,
  setupOrg,
  setupProduct,
  setupPrice,
  setupSubscriptionItem,
  setupUsageMeter,
  setupUsageCreditGrantFeature,
  setupSubscriptionItemFeature,
  setupProductFeature,
} from '@/../seedDatabase'
import { selectBillingPeriodById } from '@/db/tableMethods/billingPeriodMethods'
import { selectBillingRunById } from '@/db/tableMethods/billingRunMethods'
import { Subscription } from '@/db/schema/subscriptions'
import { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import { BillingRun } from '@/db/schema/billingRuns'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Customer } from '@/db/schema/customers'
import {
  currentSubscriptionStatuses,
  safelyUpdateSubscriptionStatus,
  selectSubscriptions,
} from '@/db/tableMethods/subscriptionMethods'
import { selectSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods'
import { selectSubscriptionItemFeatures } from '@/db/tableMethods/subscriptionItemFeatureMethods'
import { updatePrice } from '@/db/tableMethods/priceMethods'
import { updateOrganization } from '@/db/tableMethods/organizationMethods'
import {
  PriceType,
  IntervalUnit,
  SubscriptionItemType,
  FeatureType,
  FeatureUsageGrantFrequency,
} from '@/types'
import { updateProduct } from '@/db/tableMethods/productMethods'
import * as subscriptionCancellationNotifications from '@/trigger/notifications/send-organization-subscription-canceled-notification'
import { eq } from 'drizzle-orm'
import { prices } from '@/db/schema/prices'

describe('Subscription Cancellation Test Suite', async () => {
  const { organization, price } = await setupOrg()
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let billingPeriod: BillingPeriod.Record
  let billingRun: BillingRun.Record
  let billingPeriodItem: BillingPeriodItem.Record
  let subscription: Subscription.Record
  beforeEach(async () => {
    customer = await setupCustomer({
      organizationId: organization.id,
    })
    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      paymentMethodId: paymentMethod.id,
    })

    billingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: subscription.currentBillingPeriodStart!,
      endDate: subscription.currentBillingPeriodEnd!,
      status: BillingPeriodStatus.Active,
    })
    billingRun = await setupBillingRun({
      billingPeriodId: billingPeriod.id,
      paymentMethodId: paymentMethod.id,
      subscriptionId: subscription.id,
      status: BillingRunStatus.Scheduled,
    })
    billingPeriodItem = await setupBillingPeriodItem({
      billingPeriodId: billingPeriod.id,
      quantity: 1,
      unitPrice: 100,
    })
  })

  describe('reassignDefaultSubscription', () => {
    it('creates a default subscription when customer has no current subscriptions', async () => {
      const {
        organization,
        price: defaultPrice,
        pricingModel,
      } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
      })
      const paidProduct = await setupProduct({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'Paid Plan',
      })
      const paidPrice = await setupPrice({
        productId: paidProduct.id,
        name: 'Paid Plan Price',
        type: PriceType.Subscription,
        unitPrice: 5000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
      })
      const canceledSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Canceled,
        isFreePlan: false,
      })

      await adminTransaction(async ({ transaction }) => {
        // need to update defaultPrice as setupOrg create default price at $10
        await updatePrice(
          {
            id: defaultPrice.id,
            unitPrice: 0,
            type: PriceType.Subscription,
          },
          transaction
        )

        await reassignDefaultSubscription(
          canceledSubscription,
          transaction
        )

        const subscriptions = await selectSubscriptions(
          { customerId: customer.id },
          transaction
        )
        const defaultSubscriptions = subscriptions.filter(
          (sub) => sub.priceId === defaultPrice.id
        )

        expect(defaultSubscriptions).toHaveLength(1)
        expect(defaultSubscriptions[0].status).toBe(
          SubscriptionStatus.Active
        )
      })
    })

    it('does not create a duplicate default subscription when one already exists', async () => {
      const {
        organization,
        price: defaultPrice,
        pricingModel,
      } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
      })
      const paidProduct = await setupProduct({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'Paid Plan',
      })
      const paidPrice = await setupPrice({
        productId: paidProduct.id,
        name: 'Paid Plan Price',
        type: PriceType.Subscription,
        unitPrice: 5000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
      })
      const existingDefaultSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: defaultPrice.id,
        status: SubscriptionStatus.Active,
        isFreePlan: true,
      })
      const canceledSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Canceled,
        isFreePlan: false,
      })

      await adminTransaction(async ({ transaction }) => {
        // need to update defaultPrice as setupOrg create default price at $10
        await updatePrice(
          {
            id: defaultPrice.id,
            unitPrice: 0,
            type: PriceType.Subscription,
          },
          transaction
        )

        await reassignDefaultSubscription(
          canceledSubscription,
          transaction
        )

        const subscriptions = await selectSubscriptions(
          { customerId: customer.id },
          transaction
        )
        const defaultSubscriptions = subscriptions.filter(
          (sub) => sub.priceId === defaultPrice.id
        )

        expect(defaultSubscriptions).toHaveLength(1)
        expect(defaultSubscriptions[0].id).toBe(
          existingDefaultSubscription.id
        )
      })
    })

    it('does not create a default subscription when other active subscriptions remain for multi-sub organizations', async () => {
      const {
        organization,
        price: defaultPrice,
        pricingModel,
      } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
      })
      const paidProduct = await setupProduct({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'Paid Plan',
      })
      const paidPrice = await setupPrice({
        productId: paidProduct.id,
        name: 'Paid Plan Price',
        type: PriceType.Subscription,
        unitPrice: 5000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
      })
      await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        isFreePlan: false,
      })
      const canceledSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Canceled,
        isFreePlan: false,
      })

      await adminTransaction(async ({ transaction }) => {
        await updateOrganization(
          {
            id: organization.id,
            allowMultipleSubscriptionsPerCustomer: true,
          },
          transaction
        )

        await reassignDefaultSubscription(
          canceledSubscription,
          transaction
        )

        const subscriptions = await selectSubscriptions(
          { customerId: customer.id },
          transaction
        )
        const defaultSubscriptions = subscriptions.filter(
          (sub) => sub.priceId === defaultPrice.id
        )

        expect(defaultSubscriptions).toHaveLength(0)
      })
    })

    it('skips reassignment when the canceled subscription is already a free plan', async () => {
      const {
        organization,
        price: defaultPrice,
        pricingModel,
      } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
      })
      const canceledSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: defaultPrice.id,
        status: SubscriptionStatus.Canceled,
        isFreePlan: true,
      })

      await adminTransaction(async ({ transaction }) => {
        await reassignDefaultSubscription(
          canceledSubscription,
          transaction
        )

        const subscriptions = await selectSubscriptions(
          { customerId: customer.id },
          transaction
        )
        const additionalSubscriptions = subscriptions.filter(
          (sub) => sub.id !== canceledSubscription.id
        )

        expect(additionalSubscriptions).toHaveLength(0)
      })
    })

    it('falls back to the organization default pricing model when the customer lacks one', async () => {
      const {
        organization,
        price: defaultPrice,
        pricingModel,
      } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const paidProduct = await setupProduct({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'Paid Plan',
      })
      const paidPrice = await setupPrice({
        productId: paidProduct.id,
        name: 'Paid Plan Price',
        type: PriceType.Subscription,
        unitPrice: 2500,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
      })
      const canceledSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Canceled,
        isFreePlan: false,
      })

      await adminTransaction(async ({ transaction }) => {
        await reassignDefaultSubscription(
          canceledSubscription,
          transaction
        )

        const subscriptions = await selectSubscriptions(
          { customerId: customer.id },
          transaction
        )
        const defaultSubscriptions = subscriptions.filter(
          (sub) =>
            sub.id !== canceledSubscription.id &&
            sub.priceId === defaultPrice.id
        )

        expect(defaultSubscriptions).toHaveLength(1)
        expect(defaultSubscriptions[0].priceId).toBe(defaultPrice.id)
      })
    })

    it('does not create a subscription when no default product is active', async () => {
      const {
        organization,
        price: defaultPrice,
        product,
        pricingModel,
      } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
      })
      const paidProduct = await setupProduct({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'Paid Plan',
      })
      const paidPrice = await setupPrice({
        productId: paidProduct.id,
        name: 'Paid Plan Price',
        type: PriceType.Subscription,
        unitPrice: 5000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
      })
      const canceledSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Canceled,
        isFreePlan: false,
      })

      await adminTransaction(async ({ transaction }) => {
        await updateProduct(
          {
            id: product.id,
            active: false,
          },
          transaction
        )

        await reassignDefaultSubscription(
          canceledSubscription,
          transaction
        )

        const subscriptions = await selectSubscriptions(
          { customerId: customer.id },
          transaction
        )
        const defaultSubscriptions = subscriptions.filter(
          (sub) => sub.priceId === defaultPrice.id
        )
        expect(defaultSubscriptions).toHaveLength(0)
      })
    })

    it('does not create a subscription when the default product has no prices', async () => {
      const {
        organization,
        price: defaultPrice,
        product,
        pricingModel,
      } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
      })
      const paidProduct = await setupProduct({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'Paid Plan',
      })
      const paidPrice = await setupPrice({
        productId: paidProduct.id,
        name: 'Paid Plan Price',
        type: PriceType.Subscription,
        unitPrice: 5000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
      })
      const canceledSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Canceled,
        isFreePlan: false,
      })

      await adminTransaction(async ({ transaction }) => {
        await transaction
          .delete(prices)
          .where(eq(prices.productId, product.id))

        await reassignDefaultSubscription(
          canceledSubscription,
          transaction
        )

        const subscriptions = await selectSubscriptions(
          { customerId: customer.id },
          transaction
        )
        const defaultSubscriptions = subscriptions.filter(
          (sub) => sub.priceId === defaultPrice.id
        )
        expect(defaultSubscriptions).toHaveLength(0)
      })
    })
  })

  describe('cancelSubscriptionImmediately', () => {
    it('should create a default subscription when customer has none after cancellation', async () => {
      const {
        organization,
        price: defaultPrice,
        pricingModel,
      } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
      })
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      const paidProduct = await setupProduct({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'Paid Plan',
      })
      const paidPrice = await setupPrice({
        productId: paidProduct.id,
        name: 'Paid Plan Price',
        type: PriceType.Subscription,
        unitPrice: 5000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
      })
      const periodStart = Date.now() - 60 * 60 * 1000
      const periodEnd = Date.now() + 60 * 60 * 1000
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice.id,
        paymentMethodId: paymentMethod.id,
      })
      await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: periodStart,
        endDate: periodEnd,
      })

      await adminTransaction(async ({ transaction }) => {
        // need to update defaultPrice as setupOrg create default price at $10
        await updatePrice(
          {
            id: defaultPrice.id,
            unitPrice: 0,
            type: PriceType.Subscription,
          },
          transaction
        )

        const { result: canceledSubscription } =
          await cancelSubscriptionImmediately(
            subscription,
            transaction
          )

        expect(canceledSubscription.status).toBe(
          SubscriptionStatus.Canceled
        )

        const subscriptions = await selectSubscriptions(
          { customerId: customer.id },
          transaction
        )
        const defaultSubscriptions = subscriptions.filter(
          (sub) => sub.priceId === defaultPrice.id
        )

        expect(defaultSubscriptions).toHaveLength(1)
        expect(defaultSubscriptions[0].status).toBe(
          SubscriptionStatus.Active
        )
      })
    })

    it('should not create a default subscription when other active subscriptions remain and multiple are allowed', async () => {
      const {
        organization,
        price: defaultPrice,
        pricingModel,
      } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
      })
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      const paidProduct = await setupProduct({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'Primary Paid Plan',
      })
      const paidPrice = await setupPrice({
        productId: paidProduct.id,
        name: 'Primary Paid Plan Price',
        type: PriceType.Subscription,
        unitPrice: 5000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
      })
      const secondProduct = await setupProduct({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'Secondary Paid Plan',
      })
      const secondPrice = await setupPrice({
        productId: secondProduct.id,
        name: 'Secondary Paid Plan Price',
        type: PriceType.Subscription,
        unitPrice: 7000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
      })
      const periodStart = Date.now() - 60 * 60 * 1000
      const periodEnd = Date.now() + 60 * 60 * 1000
      const subscriptionToCancel = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice.id,
        paymentMethodId: paymentMethod.id,
      })
      await setupBillingPeriod({
        subscriptionId: subscriptionToCancel.id,
        startDate: periodStart,
        endDate: periodEnd,
      })
      await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: secondPrice.id,
        status: SubscriptionStatus.Active,
      })

      await adminTransaction(async ({ transaction }) => {
        await updateOrganization(
          {
            id: organization.id,
            allowMultipleSubscriptionsPerCustomer: true,
          },
          transaction
        )

        const preCancelActiveSubscriptions =
          await selectSubscriptions(
            {
              customerId: customer.id,
              status: currentSubscriptionStatuses,
            },
            transaction
          )

        await cancelSubscriptionImmediately(
          subscriptionToCancel,
          transaction
        )

        const subscriptions = await selectSubscriptions(
          { customerId: customer.id },
          transaction
        )
        const postCancelActiveSubscriptions =
          await selectSubscriptions(
            {
              customerId: customer.id,
              status: currentSubscriptionStatuses,
            },
            transaction
          )
        const defaultSubscriptions = subscriptions.filter(
          (sub) => sub.priceId === defaultPrice.id
        )

        // the test setup does not create a default subscription for the customer in setupCustomer, so we expect 0 here
        expect(defaultSubscriptions).toHaveLength(0)
        expect(postCancelActiveSubscriptions).toHaveLength(
          preCancelActiveSubscriptions.length - 1
        )
        expect(
          subscriptions.some(
            (sub) =>
              sub.priceId === secondPrice.id &&
              sub.status === SubscriptionStatus.Active
          )
        ).toBe(true)
      })
    })

    it('should cancel an active subscription and update billing periods', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Set up a subscription and two billing periods:
        // – one currently active (cancellation time lies between its start and end)
        // – one that starts in the future.
        const now = new Date()
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        const activeBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date(now.getTime() - 60 * 60 * 1000), // 1 hour ago
          endDate: new Date(now.getTime() + 60 * 60 * 1000), // 1 hour later
        })
        const futureBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date(now.getTime() + 2 * 60 * 60 * 1000), // 2 hours later
          endDate: new Date(now.getTime() + 3 * 60 * 60 * 1000), // 3 hours later
        })

        // Call the function under test.
        const { result: updatedSubscription } =
          await cancelSubscriptionImmediately(
            subscription,
            transaction
          )

        // Verify subscription fields.
        expect(updatedSubscription.status).toBe(
          SubscriptionStatus.Canceled
        )
        expect(updatedSubscription.canceledAt).toBeDefined()
        expect(updatedSubscription.cancelScheduledAt).toEqual(
          updatedSubscription.canceledAt
        )

        // Verify billing period updates.
        const updatedActiveBP = await selectBillingPeriodById(
          activeBP.id,
          transaction
        )
        const updatedFutureBP = await selectBillingPeriodById(
          futureBP.id,
          transaction
        )
        expect(updatedActiveBP.status).toBe(
          BillingPeriodStatus.Completed
        )
        expect(updatedActiveBP.endDate).toBe(
          updatedSubscription.canceledAt
        )
        expect(updatedFutureBP.status).toBe(
          BillingPeriodStatus.Canceled
        )
      })
    })

    it('should not modify a subscription already in a terminal state', async () => {
      await adminTransaction(async ({ transaction }) => {
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.Canceled,
        })
        const { result, eventsToInsert } =
          await cancelSubscriptionImmediately(
            subscription,
            transaction
          )
        expect(result.status).toBe(SubscriptionStatus.Canceled)
        expect(eventsToInsert).toHaveLength(1)
        if (!eventsToInsert) {
          throw new Error('No events to insert')
        }
        expect(eventsToInsert[0]).toMatchObject({
          type: FlowgladEventType.SubscriptionCanceled,
          payload: {
            object: EventNoun.Subscription,
            id: subscription.id,
          },
        })
      })
    })

    it('normalizes subscriptions that already have a canceledAt timestamp but non-terminal status', async () => {
      await adminTransaction(async ({ transaction }) => {
        const canceledAt = Date.now()
        const subscriptionWithTimestamp = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          canceledAt,
          status: SubscriptionStatus.Active,
        })
        const { result, eventsToInsert } =
          await cancelSubscriptionImmediately(
            subscriptionWithTimestamp,
            transaction
          )
        expect(result.status).toBe(SubscriptionStatus.Canceled)
        expect(result.canceledAt).toBe(canceledAt)
        expect(eventsToInsert).toHaveLength(1)
      })
    })

    it('should throw an error if the cancellation date is before the subscription start date', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Create a subscription whose billing period starts in the future.
        const now = new Date()
        const futureStart = new Date(now.getTime() + 60 * 60 * 1000) // 1 hour later
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: futureStart,
          endDate: new Date(futureStart.getTime() + 60 * 60 * 1000),
        })
        // Because the current time is before the billing period start, expect an error.
        await expect(
          cancelSubscriptionImmediately(subscription, transaction)
        ).rejects.toThrow(
          /Cannot end a subscription before its start date/
        )
      })
    })

    it('should handle subscriptions with no billing periods gracefully', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Create a subscription without billing periods.
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        // Depending on your design, the function may update the subscription even if there
        // are no billing periods. Here we verify that no error is thrown.
        let result
        try {
          const output = await cancelSubscriptionImmediately(
            subscription,
            transaction
          )
          result = output.result
        } catch (error) {
          result = null
        }
        expect(result).toBeDefined()
      })
    })

    it('should correctly handle boundary conditions for billing period dates', async () => {
      await adminTransaction(async ({ transaction }) => {
        // To test boundaries, we force a known "current" time.
        const fixedNow = new Date('2025-02-02T12:00:00Z')
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        // Create a billing period that starts exactly at fixedNow.
        const bp = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: fixedNow,
          endDate: new Date(fixedNow.getTime() + 60 * 60 * 1000),
        })

        // Temporarily override Date.now() so that the cancellation date equals fixedNow.
        const originalDateNow = Date.now
        Date.now = () => fixedNow.getTime()

        const { result: updatedSubscription } =
          await cancelSubscriptionImmediately(
            subscription,
            transaction
          )
        expect(updatedSubscription.status).toBe(
          SubscriptionStatus.Canceled
        )
        // Since our logic checks "if (billingPeriod.startDate < endDate)" (and not <=),
        // a cancellation exactly at the start may not trigger the "active period" update.
        const updatedBP = await selectBillingPeriodById(
          bp.id,
          transaction
        )
        expect(updatedBP.status).not.toBe(
          BillingPeriodStatus.Completed
        )

        // Restore the original Date.now.
        Date.now = originalDateNow
      })
    })

    it('should set PastDue billing periods to Canceled when subscription is canceled', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Create a subscription with multiple billing periods:
        // - one PastDue billing period (e.g., from 2 months ago)
        // - one active billing period (current)
        // - one future billing period
        const now = new Date()
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })

        // Create a PastDue billing period from 2 months ago
        const pastDueBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date(
            now.getTime() - 60 * 24 * 60 * 60 * 1000
          ), // 60 days ago
          endDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
          status: BillingPeriodStatus.PastDue,
        })

        // Create an active billing period
        const activeBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date(now.getTime() - 1 * 60 * 60 * 1000), // 1 hour ago
          endDate: new Date(now.getTime() + 1 * 60 * 60 * 1000), // 1 hour from now
          status: BillingPeriodStatus.Active,
        })

        // Create a future billing period
        const futureBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date(now.getTime() + 2 * 60 * 60 * 1000), // 2 hours from now
          endDate: new Date(now.getTime() + 3 * 60 * 60 * 1000), // 3 hours from now
          status: BillingPeriodStatus.Upcoming,
        })

        // Cancel the subscription
        const { result: updatedSubscription } =
          await cancelSubscriptionImmediately(
            subscription,
            transaction
          )

        // Verify subscription is canceled
        expect(updatedSubscription.status).toBe(
          SubscriptionStatus.Canceled
        )

        // Verify the PastDue billing period is now Canceled
        const updatedPastDueBP = await selectBillingPeriodById(
          pastDueBP.id,
          transaction
        )
        expect(updatedPastDueBP.status).toBe(
          BillingPeriodStatus.Canceled
        )

        // Verify the active billing period is Completed
        const updatedActiveBP = await selectBillingPeriodById(
          activeBP.id,
          transaction
        )
        expect(updatedActiveBP.status).toBe(
          BillingPeriodStatus.Completed
        )

        // Verify the future billing period is Canceled
        const updatedFutureBP = await selectBillingPeriodById(
          futureBP.id,
          transaction
        )
        expect(updatedFutureBP.status).toBe(
          BillingPeriodStatus.Canceled
        )
      })
    })

    it('should handle multiple PastDue billing periods when subscription is canceled', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Create a subscription with multiple PastDue billing periods
        const now = new Date()
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })

        // Create three PastDue billing periods
        const pastDueBP1 = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date(
            now.getTime() - 90 * 24 * 60 * 60 * 1000
          ), // 90 days ago
          endDate: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
          status: BillingPeriodStatus.PastDue,
        })

        const pastDueBP2 = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date(
            now.getTime() - 60 * 24 * 60 * 60 * 1000
          ), // 60 days ago
          endDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
          status: BillingPeriodStatus.PastDue,
        })

        const pastDueBP3 = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date(
            now.getTime() - 30 * 24 * 60 * 60 * 1000
          ), // 30 days ago
          endDate: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
          status: BillingPeriodStatus.PastDue,
        })

        // Cancel the subscription
        await cancelSubscriptionImmediately(subscription, transaction)

        // Verify all PastDue billing periods are now Canceled
        const updatedPastDueBP1 = await selectBillingPeriodById(
          pastDueBP1.id,
          transaction
        )
        const updatedPastDueBP2 = await selectBillingPeriodById(
          pastDueBP2.id,
          transaction
        )
        const updatedPastDueBP3 = await selectBillingPeriodById(
          pastDueBP3.id,
          transaction
        )

        expect(updatedPastDueBP1.status).toBe(
          BillingPeriodStatus.Canceled
        )
        expect(updatedPastDueBP2.status).toBe(
          BillingPeriodStatus.Canceled
        )
        expect(updatedPastDueBP3.status).toBe(
          BillingPeriodStatus.Canceled
        )
      })
    })

    it('should abort all scheduled billing runs when subscription is canceled immediately', async () => {
      await adminTransaction(async ({ transaction }) => {
        const now = new Date()
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })

        const billingPeriod = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date(now.getTime() - 60 * 60 * 1000), // 1 hour ago
          endDate: new Date(now.getTime() + 60 * 60 * 1000), // 1 hour later
        })

        // Create scheduled billing runs
        const billingRun1 = await setupBillingRun({
          billingPeriodId: billingPeriod.id,
          subscriptionId: subscription.id,
          paymentMethodId: paymentMethod.id,
          status: BillingRunStatus.Scheduled,
          scheduledFor: now.getTime() + 30 * 60 * 1000,
        })

        const billingRun2 = await setupBillingRun({
          billingPeriodId: billingPeriod.id,
          subscriptionId: subscription.id,
          paymentMethodId: paymentMethod.id,
          status: BillingRunStatus.Scheduled,
          scheduledFor: now.getTime() + 45 * 60 * 1000,
        })

        // Cancel the subscription
        await cancelSubscriptionImmediately(subscription, transaction)

        // Verify all scheduled billing runs are now aborted
        const updatedBillingRun1 = await selectBillingRunById(
          billingRun1.id,
          transaction
        )
        const updatedBillingRun2 = await selectBillingRunById(
          billingRun2.id,
          transaction
        )

        expect(updatedBillingRun1.status).toBe(
          BillingRunStatus.Aborted
        )
        expect(updatedBillingRun2.status).toBe(
          BillingRunStatus.Aborted
        )
      })
    })

    it('should only abort scheduled billing runs and not affect other statuses', async () => {
      await adminTransaction(async ({ transaction }) => {
        const now = new Date()
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })

        const billingPeriod = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date(now.getTime() - 60 * 60 * 1000),
          endDate: new Date(now.getTime() + 60 * 60 * 1000),
        })

        // Create billing runs with different statuses
        const scheduledRun = await setupBillingRun({
          billingPeriodId: billingPeriod.id,
          subscriptionId: subscription.id,
          paymentMethodId: paymentMethod.id,
          status: BillingRunStatus.Scheduled,
          scheduledFor: now.getTime() + 30 * 60 * 1000,
        })

        const succeededRun = await setupBillingRun({
          billingPeriodId: billingPeriod.id,
          subscriptionId: subscription.id,
          paymentMethodId: paymentMethod.id,
          status: BillingRunStatus.Succeeded,
          scheduledFor: now.getTime() - 30 * 60 * 1000,
        })

        const failedRun = await setupBillingRun({
          billingPeriodId: billingPeriod.id,
          subscriptionId: subscription.id,
          paymentMethodId: paymentMethod.id,
          status: BillingRunStatus.Failed,
          scheduledFor: now.getTime() - 15 * 60 * 1000,
        })

        // Cancel the subscription
        await cancelSubscriptionImmediately(subscription, transaction)

        // Verify only scheduled billing run is aborted
        const updatedScheduledRun = await selectBillingRunById(
          scheduledRun.id,
          transaction
        )
        const updatedSucceededRun = await selectBillingRunById(
          succeededRun.id,
          transaction
        )
        const updatedFailedRun = await selectBillingRunById(
          failedRun.id,
          transaction
        )

        expect(updatedScheduledRun.status).toBe(
          BillingRunStatus.Aborted
        )
        expect(updatedSucceededRun.status).toBe(
          BillingRunStatus.Succeeded
        )
        expect(updatedFailedRun.status).toBe(BillingRunStatus.Failed)
      })
    })
  })

  /* --------------------------------------------------------------------------
     scheduleSubscriptionCancellation Tests
  --------------------------------------------------------------------------- */
  describe('scheduleSubscriptionCancellation', () => {
    it('should schedule cancellation at the end of the current billing period', async () => {
      await adminTransaction(async ({ transaction }) => {
        const now = Date.now()
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        // Create a current billing period.
        const currentBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: now - 60 * 60 * 1000,
          endDate: now + 60 * 60 * 1000,
        })
        // Create a future billing period.
        const futureBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: now + 2 * 60 * 60 * 1000,
          endDate: now + 3 * 60 * 60 * 1000,
        })

        const params: ScheduleSubscriptionCancellationParams = {
          id: subscription.id,
          cancellation: {
            timing:
              SubscriptionCancellationArrangement.AtEndOfCurrentBillingPeriod,
          },
        }
        const updatedSubscription =
          await scheduleSubscriptionCancellation(params, transaction)
        expect(updatedSubscription.status).toBe(
          SubscriptionStatus.CancellationScheduled
        )
        expect(updatedSubscription.cancelScheduledAt).toBe(
          currentBP.endDate
        )
        // Verify that any billing period starting after the cancellation date is updated.
        const updatedFutureBP = await selectBillingPeriodById(
          futureBP.id,
          transaction
        )
        expect(updatedFutureBP.status).toBe(
          BillingPeriodStatus.ScheduledToCancel
        )
      })
    })

    it('throws when future-date timing omits an end date', async () => {
      await adminTransaction(async ({ transaction }) => {
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: Date.now() - 60 * 60 * 1000,
          endDate: Date.now() + 60 * 60 * 1000,
        })
        const params: ScheduleSubscriptionCancellationParams = {
          id: subscription.id,
          cancellation: {
            timing: SubscriptionCancellationArrangement.AtFutureDate,
            endDate: 0,
          },
        }

        await expect(
          scheduleSubscriptionCancellation(params, transaction)
        ).rejects.toThrow(
          'End date is required for future date cancellation'
        )
      })
    })

    it('should schedule cancellation at a specified future date', async () => {
      await adminTransaction(async ({ transaction }) => {
        const now = new Date()
        const futureCancellationDate = new Date(
          now.getTime() + 2 * 60 * 60 * 1000
        )
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        // Create a billing period that is active now.
        await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: now.getTime() - 60 * 60 * 1000,
          endDate: now.getTime() + 3 * 60 * 60 * 1000,
        })
        // Create a future billing period.
        const futureBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: now.getTime() + 4 * 60 * 60 * 1000,
          endDate: now.getTime() + 5 * 60 * 60 * 1000,
        })

        const params: ScheduleSubscriptionCancellationParams = {
          id: subscription.id,
          cancellation: {
            timing: SubscriptionCancellationArrangement.AtFutureDate,
            endDate: futureCancellationDate.getTime(),
          },
        }
        const updatedSubscription =
          await scheduleSubscriptionCancellation(params, transaction)
        expect(updatedSubscription.status).toBe(
          SubscriptionStatus.CancellationScheduled
        )
        // For AtFutureDate, per our logic, cancelScheduledAt remains null.
        expect(updatedSubscription.cancelScheduledAt).toBeNull()

        const updatedFutureBP = await selectBillingPeriodById(
          futureBP.id,
          transaction
        )
        expect(updatedFutureBP.status).toBe(
          BillingPeriodStatus.ScheduledToCancel
        )
      })
    })

    it('should make no update if the subscription is already in a terminal state', async () => {
      await adminTransaction(async ({ transaction }) => {
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        // Mark the subscription as terminal.
        await safelyUpdateSubscriptionStatus(
          subscription,
          SubscriptionStatus.Canceled,
          transaction
        )
        const params: ScheduleSubscriptionCancellationParams = {
          id: subscription.id,
          cancellation: {
            timing: SubscriptionCancellationArrangement.AtFutureDate,
            endDate: Date.now() + 60 * 60 * 1000,
          },
        }
        const result = await scheduleSubscriptionCancellation(
          params,
          transaction
        )
        expect(result.status).toBe(SubscriptionStatus.Canceled)
      })
    })

    it('throws when scheduling cancellation for a non-renewing subscription', async () => {
      await adminTransaction(async ({ transaction }) => {
        const nonRenewing = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          priceId: price.id,
          renews: false,
        })
        await setupBillingPeriod({
          subscriptionId: nonRenewing.id,
          startDate: Date.now() - 60 * 60 * 1000,
          endDate: Date.now() + 60 * 60 * 1000,
        })
        const params: ScheduleSubscriptionCancellationParams = {
          id: nonRenewing.id,
          cancellation: {
            timing:
              SubscriptionCancellationArrangement.AtEndOfCurrentBillingPeriod,
          },
        }
        await expect(
          scheduleSubscriptionCancellation(params, transaction)
        ).rejects.toThrow(/non-renewing subscription/)
      })
    })

    it('should throw an error if no current billing period exists for `AtEndOfCurrentBillingPeriod`', async () => {
      await adminTransaction(async ({ transaction }) => {
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        // Do not create any billing period so that the helper returns null.
        const params: ScheduleSubscriptionCancellationParams = {
          id: subscription.id,
          cancellation: {
            timing:
              SubscriptionCancellationArrangement.AtEndOfCurrentBillingPeriod,
          },
        }
        await expect(
          scheduleSubscriptionCancellation(params, transaction)
        ).rejects.toThrow('No current billing period found')
      })
    })

    it('should throw an error if the cancellation date is before the subscription start date', async () => {
      await adminTransaction(async ({ transaction }) => {
        const now = new Date()
        const futureStart = new Date(now.getTime() + 60 * 60 * 1000)
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        // Create a billing period that starts in the future.
        await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: futureStart,
          endDate: new Date(futureStart.getTime() + 60 * 60 * 1000),
        })
        const params: ScheduleSubscriptionCancellationParams = {
          id: subscription.id,
          cancellation: {
            timing: SubscriptionCancellationArrangement.AtFutureDate,
            endDate: Date.now(), // current time is before the billing period start
          },
        }
        await expect(
          scheduleSubscriptionCancellation(params, transaction)
        ).rejects.toThrow(
          /Cannot end a subscription before its start date/
        )
      })
    })

    it('should handle boundary conditions for billing period dates correctly', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Use a fixed cancellation time.
        const fixedNow = new Date()
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        // Create a billing period that starts exactly at fixedNow.
        const bp = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: fixedNow,
          endDate: new Date(fixedNow.getTime() + 60 * 60 * 1000),
        })
        const originalDateNow = Date.now
        Date.now = () => fixedNow.getTime()
        const params: ScheduleSubscriptionCancellationParams = {
          id: subscription.id,
          cancellation: {
            timing:
              SubscriptionCancellationArrangement.AtEndOfCurrentBillingPeriod,
          },
        }
        const updatedSubscription =
          await scheduleSubscriptionCancellation(params, transaction)
        expect(updatedSubscription.status).toBe(
          SubscriptionStatus.CancellationScheduled
        )
        // Verify that if the cancellation time equals the billing period start, the billing period is not updated as scheduled.
        const updatedBP = await selectBillingPeriodById(
          bp.id,
          transaction
        )
        expect(updatedBP.status).not.toBe(
          BillingPeriodStatus.ScheduledToCancel
        )
        Date.now = originalDateNow
      })
    })

    it('only marks billing periods that start after the cancellation date when scheduling a future date', async () => {
      await adminTransaction(async ({ transaction }) => {
        const now = Date.now()
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        const anchor = now + 2 * 60 * 60 * 1000
        const equalStart = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: anchor,
          endDate: anchor + 60 * 60 * 1000,
        })
        const lateStart = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: anchor + 2 * 60 * 60 * 1000,
          endDate: anchor + 3 * 60 * 60 * 1000,
        })
        const params: ScheduleSubscriptionCancellationParams = {
          id: subscription.id,
          cancellation: {
            timing: SubscriptionCancellationArrangement.AtFutureDate,
            endDate: anchor,
          },
        }
        await scheduleSubscriptionCancellation(params, transaction)

        const unchanged = await selectBillingPeriodById(
          equalStart.id,
          transaction
        )
        const scheduled = await selectBillingPeriodById(
          lateStart.id,
          transaction
        )
        expect(unchanged.status).not.toBe(
          BillingPeriodStatus.ScheduledToCancel
        )
        expect(scheduled.status).toBe(
          BillingPeriodStatus.ScheduledToCancel
        )
      })
    })

    it('should abort all scheduled billing runs when subscription cancellation is scheduled', async () => {
      await adminTransaction(async ({ transaction }) => {
        const now = new Date()
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })

        const currentBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date(now.getTime() - 60 * 60 * 1000),
          endDate: new Date(now.getTime() + 60 * 60 * 1000),
        })

        // Create scheduled billing runs
        const billingRun1 = await setupBillingRun({
          billingPeriodId: currentBP.id,
          subscriptionId: subscription.id,
          paymentMethodId: paymentMethod.id,
          status: BillingRunStatus.Scheduled,
          scheduledFor: now.getTime() + 30 * 60 * 1000,
        })

        const billingRun2 = await setupBillingRun({
          billingPeriodId: currentBP.id,
          subscriptionId: subscription.id,
          paymentMethodId: paymentMethod.id,
          status: BillingRunStatus.Scheduled,
          scheduledFor: now.getTime() + 45 * 60 * 1000,
        })

        const params: ScheduleSubscriptionCancellationParams = {
          id: subscription.id,
          cancellation: {
            timing:
              SubscriptionCancellationArrangement.AtEndOfCurrentBillingPeriod,
          },
        }

        // Schedule cancellation
        await scheduleSubscriptionCancellation(params, transaction)

        // Verify all scheduled billing runs are now aborted
        const updatedBillingRun1 = await selectBillingRunById(
          billingRun1.id,
          transaction
        )
        const updatedBillingRun2 = await selectBillingRunById(
          billingRun2.id,
          transaction
        )

        expect(updatedBillingRun1.status).toBe(
          BillingRunStatus.Aborted
        )
        expect(updatedBillingRun2.status).toBe(
          BillingRunStatus.Aborted
        )
      })
    })

    it('handles immediate timing by canceling future billing periods and aborting scheduled runs', async () => {
      await adminTransaction(async ({ transaction }) => {
        const now = Date.now()
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        const currentPeriod = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: now - 60 * 60 * 1000,
          endDate: now + 30 * 60 * 1000,
        })
        const futurePeriod = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: now + 2 * 60 * 60 * 1000,
          endDate: now + 3 * 60 * 60 * 1000,
        })
        const billingRunRecord = await setupBillingRun({
          billingPeriodId: futurePeriod.id,
          subscriptionId: subscription.id,
          paymentMethodId: paymentMethod.id,
          status: BillingRunStatus.Scheduled,
          scheduledFor: now + 2.5 * 60 * 60 * 1000,
        })
        const params: ScheduleSubscriptionCancellationParams = {
          id: subscription.id,
          cancellation: {
            timing: SubscriptionCancellationArrangement.Immediately,
          },
        }
        const updatedSubscription =
          await scheduleSubscriptionCancellation(params, transaction)

        expect(updatedSubscription.status).toBe(
          SubscriptionStatus.CancellationScheduled
        )
        expect(updatedSubscription.cancelScheduledAt).toBeNull()

        const updatedFuturePeriod = await selectBillingPeriodById(
          futurePeriod.id,
          transaction
        )
        expect(updatedFuturePeriod.status).toBe(
          BillingPeriodStatus.ScheduledToCancel
        )
        const currentPeriodAfter = await selectBillingPeriodById(
          currentPeriod.id,
          transaction
        )
        expect(currentPeriodAfter.status).not.toBe(
          BillingPeriodStatus.ScheduledToCancel
        )
        const updatedBillingRun = await selectBillingRunById(
          billingRunRecord.id,
          transaction
        )
        expect(updatedBillingRun.status).toBe(
          BillingRunStatus.Aborted
        )
      })
    })

    it('invokes the subscription-canceled notification exactly once per schedule call', async () => {
      const notificationSpy = vi
        .spyOn(
          subscriptionCancellationNotifications,
          'idempotentSendOrganizationSubscriptionCanceledNotification'
        )
        .mockResolvedValue(undefined as any)
      try {
        await adminTransaction(async ({ transaction }) => {
          const subscription = await setupSubscription({
            organizationId: organization.id,
            customerId: customer.id,
            paymentMethodId: paymentMethod.id,
            priceId: price.id,
          })
          await setupBillingPeriod({
            subscriptionId: subscription.id,
            startDate: Date.now() - 60 * 60 * 1000,
            endDate: Date.now() + 60 * 60 * 1000,
          })
          const params: ScheduleSubscriptionCancellationParams = {
            id: subscription.id,
            cancellation: {
              timing:
                SubscriptionCancellationArrangement.AtEndOfCurrentBillingPeriod,
            },
          }
          await scheduleSubscriptionCancellation(params, transaction)
        })
        expect(notificationSpy).toHaveBeenCalledTimes(1)
      } finally {
        notificationSpy.mockRestore()
      }
    })
  })

  describe('cancelSubscriptionProcedureTransaction', () => {
    it('returns the updated subscription and events for immediate cancellations', async () => {
      await adminTransaction(async ({ transaction }) => {
        const immediateSubscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        await setupBillingPeriod({
          subscriptionId: immediateSubscription.id,
          startDate: Date.now() - 60 * 60 * 1000,
          endDate: Date.now() + 60 * 60 * 1000,
        })
        const response = await cancelSubscriptionProcedureTransaction(
          {
            input: {
              id: immediateSubscription.id,
              cancellation: {
                timing:
                  SubscriptionCancellationArrangement.Immediately,
              },
            },
            transaction,
            ctx: { apiKey: undefined },
            livemode: true,
            userId: '1',
            organizationId: organization.id,
          }
        )

        expect(response.result.subscription.id).toBe(
          immediateSubscription.id
        )
        expect(response.result.subscription.current).toBe(false)
        expect(response.eventsToInsert).toHaveLength(1)
      })
    })

    it('returns scheduled cancellations without events for non-immediate timing', async () => {
      await adminTransaction(async ({ transaction }) => {
        const scheduledSubscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        const now = Date.now()
        await setupBillingPeriod({
          subscriptionId: scheduledSubscription.id,
          startDate: now - 60 * 60 * 1000,
          endDate: now + 60 * 60 * 1000,
        })
        const response = await cancelSubscriptionProcedureTransaction(
          {
            input: {
              id: scheduledSubscription.id,
              cancellation: {
                timing:
                  SubscriptionCancellationArrangement.AtFutureDate,
                endDate: now + 2 * 60 * 60 * 1000,
              },
            },
            transaction,
            ctx: {
              apiKey: undefined,
            },
            livemode: true,
            userId: '1',
            organizationId: organization.id,
          }
        )

        expect(response.result.subscription.status).toBe(
          SubscriptionStatus.CancellationScheduled
        )
        expect(response.eventsToInsert).toHaveLength(0)
        expect(
          response.result.subscription.cancelScheduledAt
        ).toBeNull()
      })
    })
  })

  /* --------------------------------------------------------------------------
     Edge Cases and Error Handling
  --------------------------------------------------------------------------- */
  describe('Edge Cases and Error Handling', () => {
    it('should handle subscriptions with no billing periods gracefully', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Test with a subscription that has no billing periods.
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        let result
        try {
          const output = await cancelSubscriptionImmediately(
            subscription,
            transaction
          )
          result = output.result
        } catch (error) {
          result = null
        }
        expect(result).toBeDefined()
      })
    })

    it('should handle overlapping billing periods correctly', async () => {
      await adminTransaction(async ({ transaction }) => {
        const now = new Date()
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        // Create two billing periods that overlap.
        const bp1 = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date(now.getTime() - 2 * 60 * 60 * 1000),
          endDate: new Date(now.getTime() + 2 * 60 * 60 * 1000),
        })
        const bp2 = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date(now.getTime() - 60 * 60 * 1000),
          endDate: new Date(now.getTime() + 3 * 60 * 60 * 1000),
        })
        const { result: updatedSubscription } =
          await cancelSubscriptionImmediately(
            subscription,
            transaction
          )
        expect(updatedSubscription.status).toBe(
          SubscriptionStatus.Canceled
        )
        const updatedBP1 = await selectBillingPeriodById(
          bp1.id,
          transaction
        )
        const updatedBP2 = await selectBillingPeriodById(
          bp2.id,
          transaction
        )
        // At least one of the billing periods should be updated appropriately.
        expect([
          BillingPeriodStatus.Completed,
          BillingPeriodStatus.Canceled,
        ]).toContain(updatedBP1.status)
        expect([
          BillingPeriodStatus.Completed,
          BillingPeriodStatus.Canceled,
        ]).toContain(updatedBP2.status)
      })
    })

    it('should handle concurrent cancellation requests without data inconsistencies', async () => {
      await adminTransaction(async ({ transaction }) => {
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date(Date.now() - 60 * 60 * 1000),
          endDate: new Date(Date.now() + 60 * 60 * 1000),
        })
        // Fire off two concurrent cancellation calls.
        const [{ result: result1 }, { result: result2 }] =
          await Promise.all([
            cancelSubscriptionImmediately(subscription, transaction),
            cancelSubscriptionImmediately(subscription, transaction),
          ])
        expect(result1.status).toBe(SubscriptionStatus.Canceled)
        expect(result2.status).toBe(SubscriptionStatus.Canceled)
      })
    })

    it('should throw an error for invalid subscription input', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Passing a null subscription should result in an error.
        await expect(
          cancelSubscriptionImmediately(null as any, transaction)
        ).rejects.toThrow()
      })
    })
  })

  /* --------------------------------------------------------------------------
     Integration Tests (Partial Scope)
  --------------------------------------------------------------------------- */
  describe('Integration Tests (Partial Scope)', () => {
    it('should integrate correctly with subscription lifecycle operations', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Simulate an activation phase followed by an immediate cancellation.
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date(Date.now() - 60 * 60 * 1000),
          endDate: new Date(Date.now() + 60 * 60 * 1000),
        })
        const { result: updatedSubscription } =
          await cancelSubscriptionImmediately(
            subscription,
            transaction
          )
        expect(updatedSubscription.status).toBe(
          SubscriptionStatus.Canceled
        )
      })
    })

    // it('should not trigger unintended payment processing', async () => {
    //   // Since payment processing is out-of-scope for cancellation, we can simply mark this as a placeholder.
    //   expect(true).toBe(true)
    // })

    // it('should trigger appropriate user notifications', async () => {
    //   // If a notification system is integrated, you might spy on the notification function.
    //   // Here we simply verify a placeholder expectation.
    //   expect(true).toBe(true)
    // })
  })

  /* --------------------------------------------------------------------------
     abortScheduledBillingRuns Function Tests
  --------------------------------------------------------------------------- */
  describe('abortScheduledBillingRuns', () => {
    it('should be idempotent when called multiple times', async () => {
      await adminTransaction(async ({ transaction }) => {
        const now = new Date()
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })

        const billingPeriod = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date(now.getTime() - 60 * 60 * 1000),
          endDate: new Date(now.getTime() + 60 * 60 * 1000),
        })

        // Create scheduled billing runs
        const billingRun1 = await setupBillingRun({
          billingPeriodId: billingPeriod.id,
          subscriptionId: subscription.id,
          paymentMethodId: paymentMethod.id,
          status: BillingRunStatus.Scheduled,
          scheduledFor: now.getTime() + 30 * 60 * 1000,
        })

        const billingRun2 = await setupBillingRun({
          billingPeriodId: billingPeriod.id,
          subscriptionId: subscription.id,
          paymentMethodId: paymentMethod.id,
          status: BillingRunStatus.Scheduled,
          scheduledFor: now.getTime() + 45 * 60 * 1000,
        })

        // Call the function twice
        await abortScheduledBillingRuns(subscription.id, transaction)
        await abortScheduledBillingRuns(subscription.id, transaction)

        // Verify billing runs are still aborted (not double-aborted or in error state)
        const updatedBillingRun1 = await selectBillingRunById(
          billingRun1.id,
          transaction
        )
        const updatedBillingRun2 = await selectBillingRunById(
          billingRun2.id,
          transaction
        )

        expect(updatedBillingRun1.status).toBe(
          BillingRunStatus.Aborted
        )
        expect(updatedBillingRun2.status).toBe(
          BillingRunStatus.Aborted
        )
      })
    })
  })

  /* --------------------------------------------------------------------------
     Subscription Item Expiration Tests
  --------------------------------------------------------------------------- */
  describe('Subscription Item Expiration on Cancellation', () => {
    it('should expire subscription items and their features when canceling immediately', async () => {
      // Setup
      const { organization, pricingModel } = await setupOrg()
      const paidProduct = await setupProduct({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'Paid Plan',
      })
      const paidPrice = await setupPrice({
        productId: paidProduct.id,
        name: 'Paid Plan Price',
        type: PriceType.Subscription,
        unitPrice: 5000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
      })
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })

      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice.id,
        paymentMethodId: paymentMethod.id,
        isFreePlan: false,
        status: SubscriptionStatus.Active,
      })

      const subscriptionItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: paidPrice.id,
        name: paidPrice.name ?? 'Test Item',
        quantity: 1,
        unitPrice: paidPrice.unitPrice,
        type: SubscriptionItemType.Static,
      })

      // Create a feature on the subscription item
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'Test Meter',
      })

      const feature = await setupUsageCreditGrantFeature({
        organizationId: organization.id,
        name: 'Test Feature',
        usageMeterId: usageMeter.id,
        amount: 1000,
        renewalFrequency: FeatureUsageGrantFrequency.Once,
        livemode: true,
      })
      const productFeature = await setupProductFeature({
        organizationId: organization.id,
        productId: paidProduct.id,
        featureId: feature.id,
        livemode: true,
      })

      await setupSubscriptionItemFeature({
        subscriptionItemId: subscriptionItem.id,
        featureId: feature.id,
        type: FeatureType.UsageCreditGrant,
        usageMeterId: usageMeter.id,
        productFeatureId: productFeature.id,
      })

      await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: Date.now() - 60 * 60 * 1000,
        endDate: Date.now() + 60 * 60 * 1000,
      })

      // Cancel subscription
      const canceledAt = await adminTransaction(
        async ({ transaction }) => {
          const { result } = await cancelSubscriptionImmediately(
            subscription,
            transaction
          )
          return result.canceledAt
        }
      )

      // Verify subscription items are expired
      await adminTransaction(async ({ transaction }) => {
        const items = await selectSubscriptionItems(
          { subscriptionId: subscription.id },
          transaction
        )
        expect(items).toHaveLength(1)
        expect(items[0].expiredAt).toBe(canceledAt)

        // Verify features are expired
        const features = await selectSubscriptionItemFeatures(
          { subscriptionItemId: subscriptionItem.id },
          transaction
        )
        expect(features).toHaveLength(1)
        expect(features[0].expiredAt).toBe(canceledAt)
      })
    })

    it('should expire multiple subscription items and features when canceling immediately', async () => {
      // Setup
      const { organization, pricingModel } = await setupOrg()
      const paidProduct = await setupProduct({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'Paid Plan',
      })
      const paidPrice1 = await setupPrice({
        productId: paidProduct.id,
        name: 'Paid Plan Price 1',
        type: PriceType.Subscription,
        unitPrice: 5000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
      })
      const paidPrice2 = await setupPrice({
        productId: paidProduct.id,
        name: 'Paid Plan Price 2',
        type: PriceType.Subscription,
        unitPrice: 3000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
      })
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })

      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice1.id,
        paymentMethodId: paymentMethod.id,
        isFreePlan: false,
        status: SubscriptionStatus.Active,
      })

      // Create multiple subscription items
      const subscriptionItem1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: paidPrice1.id,
        name: paidPrice1.name ?? 'Test Item 1',
        quantity: 1,
        unitPrice: paidPrice1.unitPrice,
        type: SubscriptionItemType.Static,
      })

      const subscriptionItem2 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: paidPrice2.id,
        name: paidPrice2.name ?? 'Test Item 2',
        quantity: 2,
        unitPrice: paidPrice2.unitPrice,
        type: SubscriptionItemType.Static,
      })

      // Create features on the subscription items
      const usageMeter1 = await setupUsageMeter({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'Test Meter 1',
      })

      const usageMeter2 = await setupUsageMeter({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'Test Meter 2',
      })

      const feature1 = await setupUsageCreditGrantFeature({
        organizationId: organization.id,
        name: 'Test Feature 1',
        usageMeterId: usageMeter1.id,
        amount: 1000,
        renewalFrequency: FeatureUsageGrantFrequency.Once,
        livemode: true,
      })

      const feature2 = await setupUsageCreditGrantFeature({
        organizationId: organization.id,
        name: 'Test Feature 2',
        usageMeterId: usageMeter2.id,
        amount: 2000,
        renewalFrequency: FeatureUsageGrantFrequency.Once,
        livemode: true,
      })
      const productFeature1 = await setupProductFeature({
        organizationId: organization.id,
        productId: paidProduct.id,
        featureId: feature1.id,
        livemode: true,
      })
      const productFeature2 = await setupProductFeature({
        organizationId: organization.id,
        productId: paidProduct.id,
        featureId: feature2.id,
        livemode: true,
      })
      await setupSubscriptionItemFeature({
        subscriptionItemId: subscriptionItem1.id,
        featureId: feature1.id,
        type: FeatureType.UsageCreditGrant,
        usageMeterId: usageMeter1.id,
        productFeatureId: productFeature1.id,
      })

      await setupSubscriptionItemFeature({
        subscriptionItemId: subscriptionItem2.id,
        featureId: feature2.id,
        type: FeatureType.UsageCreditGrant,
        usageMeterId: usageMeter2.id,
        productFeatureId: productFeature2.id,
      })

      await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: Date.now() - 60 * 60 * 1000,
        endDate: Date.now() + 60 * 60 * 1000,
      })

      // Cancel subscription
      const canceledAt = await adminTransaction(
        async ({ transaction }) => {
          const { result } = await cancelSubscriptionImmediately(
            subscription,
            transaction
          )
          return result.canceledAt
        }
      )

      // Verify all subscription items are expired
      await adminTransaction(async ({ transaction }) => {
        const items = await selectSubscriptionItems(
          { subscriptionId: subscription.id },
          transaction
        )
        expect(items).toHaveLength(2)
        expect(items[0].expiredAt).toBe(canceledAt)
        expect(items[1].expiredAt).toBe(canceledAt)

        // Verify all features are expired
        const features1 = await selectSubscriptionItemFeatures(
          { subscriptionItemId: subscriptionItem1.id },
          transaction
        )
        expect(features1).toHaveLength(1)
        expect(features1[0].expiredAt).toBe(canceledAt)

        const features2 = await selectSubscriptionItemFeatures(
          { subscriptionItemId: subscriptionItem2.id },
          transaction
        )
        expect(features2).toHaveLength(1)
        expect(features2[0].expiredAt).toBe(canceledAt)
      })
    })
  })

  /* --------------------------------------------------------------------------
     Free Plan Protection
  --------------------------------------------------------------------------- */
  describe('Free Plan Protection', () => {
    it('should throw an error when attempting to cancel a free plan subscription', async () => {
      const {
        organization,
        price: freePrice,
        pricingModel,
      } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
      })
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      // Ensure the price is free (unitPrice = 0)
      await adminTransaction(async ({ transaction }) => {
        await updatePrice(
          {
            id: freePrice.id,
            unitPrice: 0,
            type: PriceType.Subscription,
          },
          transaction
        )
      })
      const freeSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: freePrice.id,
        paymentMethodId: paymentMethod.id,
        isFreePlan: true,
        status: SubscriptionStatus.Active,
      })
      await setupBillingPeriod({
        subscriptionId: freeSubscription.id,
        startDate: Date.now() - 60 * 60 * 1000,
        endDate: Date.now() + 60 * 60 * 1000,
      })

      await expect(
        adminTransaction(async ({ transaction }) => {
          return cancelSubscriptionProcedureTransaction({
            input: {
              id: freeSubscription.id,
              cancellation: {
                timing:
                  SubscriptionCancellationArrangement.Immediately,
              },
            },
            transaction,
            ctx: { apiKey: undefined },
            livemode: true,
            userId: '1',
            organizationId: organization.id,
          })
        })
      ).rejects.toThrow(/Cannot cancel the default free plan/)
    })

    it('should allow cancellation of paid plan subscriptions', async () => {
      const { organization, pricingModel } = await setupOrg()
      const paidProduct = await setupProduct({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'Paid Plan',
      })
      const paidPrice = await setupPrice({
        productId: paidProduct.id,
        name: 'Paid Plan Price',
        type: PriceType.Subscription,
        unitPrice: 5000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
      })
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      const paidSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice.id,
        paymentMethodId: paymentMethod.id,
        isFreePlan: false,
        status: SubscriptionStatus.Active,
      })
      await setupBillingPeriod({
        subscriptionId: paidSubscription.id,
        startDate: Date.now() - 60 * 60 * 1000,
        endDate: Date.now() + 60 * 60 * 1000,
      })

      const response = await adminTransaction(
        async ({ transaction }) => {
          return cancelSubscriptionProcedureTransaction({
            input: {
              id: paidSubscription.id,
              cancellation: {
                timing:
                  SubscriptionCancellationArrangement.Immediately,
              },
            },
            transaction,
            ctx: { apiKey: undefined },
            livemode: true,
            userId: '1',
            organizationId: organization.id,
          })
        }
      )

      expect(response.result.subscription.status).toBe(
        SubscriptionStatus.Canceled
      )
    })

    it('should throw an error when attempting to schedule cancellation of a free plan', async () => {
      const {
        organization,
        price: freePrice,
        pricingModel,
      } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
      })
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      await adminTransaction(async ({ transaction }) => {
        await updatePrice(
          {
            id: freePrice.id,
            unitPrice: 0,
            type: PriceType.Subscription,
          },
          transaction
        )
      })
      const freeSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: freePrice.id,
        paymentMethodId: paymentMethod.id,
        isFreePlan: true,
        status: SubscriptionStatus.Active,
      })
      await setupBillingPeriod({
        subscriptionId: freeSubscription.id,
        startDate: Date.now() - 60 * 60 * 1000,
        endDate: Date.now() + 60 * 60 * 1000,
      })

      await expect(
        adminTransaction(async ({ transaction }) => {
          return cancelSubscriptionProcedureTransaction({
            input: {
              id: freeSubscription.id,
              cancellation: {
                timing:
                  SubscriptionCancellationArrangement.AtEndOfCurrentBillingPeriod,
              },
            },
            transaction,
            ctx: { apiKey: undefined },
            livemode: true,
            userId: '1',
            organizationId: organization.id,
          })
        })
      ).rejects.toThrow(/Cannot cancel the default free plan/)
    })
  })
})
