import {
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'
import { Result } from 'better-result'
import { eq } from 'drizzle-orm'
import {
  setupBillingPeriod,
  setupBillingPeriodItem,
  setupBillingRun,
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupProduct,
  setupProductFeature,
  setupResource,
  setupResourceClaim,
  setupResourceFeature,
  setupResourceSubscriptionItemFeature,
  setupSubscription,
  setupSubscriptionItem,
  setupSubscriptionItemFeature,
  setupUsageCreditGrantFeature,
  setupUsageMeter,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { BillingRun } from '@/db/schema/billingRuns'
import type { Customer } from '@/db/schema/customers'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import { prices } from '@/db/schema/prices'
import type { Subscription } from '@/db/schema/subscriptions'
import {
  selectBillingPeriodById,
  updateBillingPeriod,
} from '@/db/tableMethods/billingPeriodMethods'
import {
  selectBillingRunById,
  selectBillingRuns,
} from '@/db/tableMethods/billingRunMethods'
import { updateOrganization } from '@/db/tableMethods/organizationMethods'
import { updatePrice } from '@/db/tableMethods/priceMethods'
import { updateProduct } from '@/db/tableMethods/productMethods'
import { selectResourceClaims } from '@/db/tableMethods/resourceClaimMethods'
import { selectSubscriptionItemFeatures } from '@/db/tableMethods/subscriptionItemFeatureMethods'
import { selectSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods'
import {
  currentSubscriptionStatuses,
  safelyUpdateSubscriptionStatus,
  selectSubscriptions,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'
import { NotFoundError, ValidationError } from '@/errors'
import {
  abortScheduledBillingRuns,
  cancelSubscriptionImmediately,
  cancelSubscriptionProcedureTransaction,
  reassignDefaultSubscription,
  scheduleSubscriptionCancellation,
  uncancelSubscription,
  uncancelSubscriptionProcedureTransaction,
} from '@/subscriptions/cancelSubscription'
import type { ScheduleSubscriptionCancellationParams } from '@/subscriptions/schemas'
import {
  createCapturingCallbacks,
  createCapturingEffectsContext,
  createDiscardingEffectsContext,
  noopEmitEvent,
  noopInvalidateCache,
  withAdminCacheContext,
} from '@/test-utils/transactionCallbacks'
import * as subscriptionCancellationNotifications from '@/trigger/notifications/send-organization-subscription-cancellation-scheduled-notification'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  EventNoun,
  FeatureType,
  FeatureUsageGrantFrequency,
  FlowgladEventType,
  IntervalUnit,
  PriceType,
  SubscriptionCancellationArrangement,
  SubscriptionItemType,
  SubscriptionStatus,
} from '@/types'
import { CacheDependency } from '@/utils/cache'

describe('Subscription Cancellation Test Suite', async () => {
  const { organization, price } = (await setupOrg()).unwrap()
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let billingPeriod: BillingPeriod.Record
  let billingRun: BillingRun.Record
  let billingPeriodItem: BillingPeriodItem.Record
  let subscription: Subscription.Record
  beforeEach(async () => {
    customer = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    paymentMethod = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
    ).unwrap()

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
      } = (await setupOrg()).unwrap()
      const customer = (
        await setupCustomer({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
        })
      ).unwrap()
      const paidProduct = (
        await setupProduct({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Paid Plan',
        })
      ).unwrap()
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

      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        // need to update defaultPrice as setupOrg create default price at $10
        await updatePrice(
          {
            id: defaultPrice.id,
            unitPrice: 0,
            type: PriceType.Subscription,
          },
          ctx
        )

        await reassignDefaultSubscription(
          canceledSubscription,
          createDiscardingEffectsContext(transaction)
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
      } = (await setupOrg()).unwrap()
      const customer = (
        await setupCustomer({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
        })
      ).unwrap()
      const paidProduct = (
        await setupProduct({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Paid Plan',
        })
      ).unwrap()
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

      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        // need to update defaultPrice as setupOrg create default price at $10
        await updatePrice(
          {
            id: defaultPrice.id,
            unitPrice: 0,
            type: PriceType.Subscription,
          },
          ctx
        )

        await reassignDefaultSubscription(
          canceledSubscription,
          createDiscardingEffectsContext(transaction)
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
      } = (await setupOrg()).unwrap()
      const customer = (
        await setupCustomer({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
        })
      ).unwrap()
      const paidProduct = (
        await setupProduct({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Paid Plan',
        })
      ).unwrap()
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

      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await updateOrganization(
          {
            id: organization.id,
            allowMultipleSubscriptionsPerCustomer: true,
          },
          transaction
        )

        await reassignDefaultSubscription(
          canceledSubscription,
          createDiscardingEffectsContext(transaction)
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
      } = (await setupOrg()).unwrap()
      const customer = (
        await setupCustomer({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
        })
      ).unwrap()
      const canceledSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: defaultPrice.id,
        status: SubscriptionStatus.Canceled,
        isFreePlan: true,
      })

      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await reassignDefaultSubscription(
          canceledSubscription,
          createDiscardingEffectsContext(transaction)
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
      } = (await setupOrg()).unwrap()
      const customer = (
        await setupCustomer({
          organizationId: organization.id,
        })
      ).unwrap()
      const paidProduct = (
        await setupProduct({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Paid Plan',
        })
      ).unwrap()
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

      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await reassignDefaultSubscription(
          canceledSubscription,
          createDiscardingEffectsContext(transaction)
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
      } = (await setupOrg()).unwrap()
      const customer = (
        await setupCustomer({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
        })
      ).unwrap()
      const paidProduct = (
        await setupProduct({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Paid Plan',
        })
      ).unwrap()
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

      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await updateProduct(
          {
            id: product.id,
            active: false,
          },
          ctx
        )

        await reassignDefaultSubscription(
          canceledSubscription,
          createDiscardingEffectsContext(transaction)
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
      } = (await setupOrg()).unwrap()
      const customer = (
        await setupCustomer({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
        })
      ).unwrap()
      const paidProduct = (
        await setupProduct({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Paid Plan',
        })
      ).unwrap()
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

      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await transaction
          .delete(prices)
          .where(eq(prices.productId, product.id))

        await reassignDefaultSubscription(
          canceledSubscription,
          createDiscardingEffectsContext(transaction)
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
      } = (await setupOrg()).unwrap()
      const customer = (
        await setupCustomer({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
        })
      ).unwrap()
      const paymentMethod = (
        await setupPaymentMethod({
          organizationId: organization.id,
          customerId: customer.id,
        })
      ).unwrap()
      const paidProduct = (
        await setupProduct({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Paid Plan',
        })
      ).unwrap()
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

      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        // need to update defaultPrice as setupOrg create default price at $10
        await updatePrice(
          {
            id: defaultPrice.id,
            unitPrice: 0,
            type: PriceType.Subscription,
          },
          ctx
        )

        const canceledSubscription = (
          await cancelSubscriptionImmediately(
            {
              subscription,
            },
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()

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
      } = (await setupOrg()).unwrap()
      const customer = (
        await setupCustomer({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
        })
      ).unwrap()
      const paymentMethod = (
        await setupPaymentMethod({
          organizationId: organization.id,
          customerId: customer.id,
        })
      ).unwrap()
      const paidProduct = (
        await setupProduct({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Primary Paid Plan',
        })
      ).unwrap()
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
      const secondProduct = (
        await setupProduct({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Secondary Paid Plan',
        })
      ).unwrap()
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

      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
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
          {
            subscription: subscriptionToCancel,
          },
          createDiscardingEffectsContext(transaction)
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
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
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
        const updatedSubscription = (
          await cancelSubscriptionImmediately(
            {
              subscription,
            },
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()

        // Verify subscription fields.
        expect(updatedSubscription.status).toBe(
          SubscriptionStatus.Canceled
        )
        expect(typeof updatedSubscription.canceledAt).toBe('number')
        expect(updatedSubscription.canceledAt).toBeGreaterThan(0)
        expect(updatedSubscription.cancelScheduledAt).toEqual(
          updatedSubscription.canceledAt
        )

        // Verify billing period updates.
        const updatedActiveBP = (
          await selectBillingPeriodById(activeBP.id, transaction)
        ).unwrap()
        const updatedFutureBP = (
          await selectBillingPeriodById(futureBP.id, transaction)
        ).unwrap()
        expect(updatedActiveBP.status).toBe(
          BillingPeriodStatus.Completed
        )
        expect(updatedActiveBP.endDate).toBe(
          updatedSubscription.canceledAt!
        )
        expect(updatedFutureBP.status).toBe(
          BillingPeriodStatus.Canceled
        )
      })
    })

    it('should not modify a subscription already in a terminal state', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.Canceled,
        })
        const { ctx: effectsCtx, effects } =
          createCapturingEffectsContext(transaction)
        const result = (
          await cancelSubscriptionImmediately(
            {
              subscription,
            },
            effectsCtx
          )
        ).unwrap()
        expect(result.status).toBe(SubscriptionStatus.Canceled)
        // Verify captured callback events
        expect(effects.events).toHaveLength(1)
        expect(effects.events[0]).toMatchObject({
          type: FlowgladEventType.SubscriptionCanceled,
          payload: {
            object: EventNoun.Subscription,
            id: subscription.id,
          },
        })
        // Verify cache invalidation was called
        expect(effects.cacheInvalidations).toContain(
          CacheDependency.customerSubscriptions(customer.id)
        )
      })
    })

    it('normalizes subscriptions that already have a canceledAt timestamp but non-terminal status', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const canceledAt = Date.now()
        const subscriptionWithTimestamp = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          canceledAt,
          status: SubscriptionStatus.Active,
        })
        const { ctx: effectsCtx, effects } =
          createCapturingEffectsContext(transaction)
        const result = (
          await cancelSubscriptionImmediately(
            {
              subscription: subscriptionWithTimestamp,
            },
            effectsCtx
          )
        ).unwrap()
        expect(result.status).toBe(SubscriptionStatus.Canceled)
        expect(result.canceledAt).toBe(canceledAt)
        expect(effects.events).toHaveLength(1)
        expect(effects.cacheInvalidations).toContain(
          CacheDependency.customerSubscriptions(customer.id)
        )
      })
    })

    it('should cancel subscription with CancellationScheduled status immediately', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.CancellationScheduled,
          cancelScheduledAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days from now
        })

        const periodStart = Date.now() - 60 * 60 * 1000
        const periodEnd = Date.now() + 60 * 60 * 1000
        await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: periodStart,
          endDate: periodEnd,
          status: BillingPeriodStatus.ScheduledToCancel,
        })

        const { ctx: effectsCtx, effects } =
          createCapturingEffectsContext(transaction)
        const result = (
          await cancelSubscriptionImmediately(
            {
              subscription,
            },
            effectsCtx
          )
        ).unwrap()

        // Verify subscription was canceled immediately
        expect(result.status).toBe(SubscriptionStatus.Canceled)
        expect(typeof result.canceledAt).toBe('number')
        expect(effects.events).toHaveLength(1)
        expect(effects.events[0]).toMatchObject({
          type: FlowgladEventType.SubscriptionCanceled,
          payload: {
            object: EventNoun.Subscription,
            id: subscription.id,
          },
        })
        expect(effects.cacheInvalidations).toContain(
          CacheDependency.customerSubscriptions(customer.id)
        )
      })
    })

    it('should cancel subscriptions in various non-terminal statuses', async () => {
      // Test all non-terminal statuses that can be canceled
      const statusesToTest = [
        SubscriptionStatus.Active,
        SubscriptionStatus.Trialing,
        SubscriptionStatus.PastDue,
        SubscriptionStatus.Unpaid,
        SubscriptionStatus.Paused,
        SubscriptionStatus.CancellationScheduled,
      ]

      for (const status of statusesToTest) {
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const subscription = await setupSubscription({
            organizationId: organization.id,
            customerId: customer.id,
            paymentMethodId: paymentMethod.id,
            priceId: price.id,
            status,
          })

          const periodStart = Date.now() - 60 * 60 * 1000
          const periodEnd = Date.now() + 60 * 60 * 1000
          await setupBillingPeriod({
            subscriptionId: subscription.id,
            startDate: periodStart,
            endDate: periodEnd,
          })

          const { ctx: effectsCtx, effects } =
            createCapturingEffectsContext(transaction)
          const result = (
            await cancelSubscriptionImmediately(
              {
                subscription,
              },
              effectsCtx
            )
          ).unwrap()

          // Verify subscription was canceled regardless of initial status
          expect(result.status).toBe(SubscriptionStatus.Canceled)
          expect(typeof result.canceledAt).toBe('number')
          expect(effects.events).toHaveLength(1)
          expect(effects.events[0]).toMatchObject({
            type: FlowgladEventType.SubscriptionCanceled,
            payload: {
              object: EventNoun.Subscription,
              id: subscription.id,
            },
          })
          expect(effects.cacheInvalidations).toContain(
            CacheDependency.customerSubscriptions(customer.id)
          )
        })
      }
    })

    it('should throw an error if the cancellation date is before the subscription start date', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
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
        const result = await cancelSubscriptionImmediately(
          {
            subscription,
          },
          createDiscardingEffectsContext(transaction)
        )
        expect(result.status).toBe('error')
        if (result.status === 'error') {
          expect(result.error).toBeInstanceOf(ValidationError)
          expect(result.error.message).toMatch(
            /Cannot end a subscription before its start date/
          )
        }
      })
    })

    it('should handle subscriptions with no billing periods gracefully', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
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
            {
              subscription,
            },
            createDiscardingEffectsContext(transaction)
          )
          result = output.unwrap()
        } catch (error) {
          result = null
        }
        expect(result).toMatchObject({})
      })
    })

    it('should correctly handle boundary conditions for billing period dates', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
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

        const updatedSubscription = (
          await cancelSubscriptionImmediately(
            {
              subscription,
            },
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()
        expect(updatedSubscription.status).toBe(
          SubscriptionStatus.Canceled
        )
        // Since our logic checks "if (billingPeriod.startDate < endDate)" (and not <=),
        // a cancellation exactly at the start may not trigger the "active period" update.
        const updatedBP = (
          await selectBillingPeriodById(bp.id, transaction)
        ).unwrap()
        expect(updatedBP.status).not.toBe(
          BillingPeriodStatus.Completed
        )

        // Restore the original Date.now.
        Date.now = originalDateNow
      })
    })

    it('should set PastDue billing periods to Canceled when subscription is canceled', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
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
        const updatedSubscription = (
          await cancelSubscriptionImmediately(
            {
              subscription,
            },
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()

        // Verify subscription is canceled
        expect(updatedSubscription.status).toBe(
          SubscriptionStatus.Canceled
        )

        // Verify the PastDue billing period is now Canceled
        const updatedPastDueBP = (
          await selectBillingPeriodById(pastDueBP.id, transaction)
        ).unwrap()
        expect(updatedPastDueBP.status).toBe(
          BillingPeriodStatus.Canceled
        )

        // Verify the active billing period is Completed
        const updatedActiveBP = (
          await selectBillingPeriodById(activeBP.id, transaction)
        ).unwrap()
        expect(updatedActiveBP.status).toBe(
          BillingPeriodStatus.Completed
        )

        // Verify the future billing period is Canceled
        const updatedFutureBP = (
          await selectBillingPeriodById(futureBP.id, transaction)
        ).unwrap()
        expect(updatedFutureBP.status).toBe(
          BillingPeriodStatus.Canceled
        )
      })
    })

    it('should handle multiple PastDue billing periods when subscription is canceled', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
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
        await cancelSubscriptionImmediately(
          {
            subscription,
          },
          createDiscardingEffectsContext(transaction)
        )

        // Verify all PastDue billing periods are now Canceled
        const updatedPastDueBP1 = (
          await selectBillingPeriodById(pastDueBP1.id, transaction)
        ).unwrap()
        const updatedPastDueBP2 = (
          await selectBillingPeriodById(pastDueBP2.id, transaction)
        ).unwrap()
        const updatedPastDueBP3 = (
          await selectBillingPeriodById(pastDueBP3.id, transaction)
        ).unwrap()

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
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
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
        await cancelSubscriptionImmediately(
          {
            subscription,
          },
          createDiscardingEffectsContext(transaction)
        )

        // Verify all scheduled billing runs are now aborted
        const updatedBillingRun1 = (
          await selectBillingRunById(billingRun1.id, transaction)
        ).unwrap()
        const updatedBillingRun2 = (
          await selectBillingRunById(billingRun2.id, transaction)
        ).unwrap()

        expect(updatedBillingRun1.status).toBe(
          BillingRunStatus.Aborted
        )
        expect(updatedBillingRun2.status).toBe(
          BillingRunStatus.Aborted
        )
      })
    })

    it('should only abort scheduled billing runs and not affect other statuses', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
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
        await cancelSubscriptionImmediately(
          {
            subscription,
          },
          createDiscardingEffectsContext(transaction)
        )

        // Verify only scheduled billing run is aborted
        const updatedScheduledRun = (
          await selectBillingRunById(scheduledRun.id, transaction)
        ).unwrap()
        const updatedSucceededRun = (
          await selectBillingRunById(succeededRun.id, transaction)
        ).unwrap()
        const updatedFailedRun = (
          await selectBillingRunById(failedRun.id, transaction)
        ).unwrap()

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
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
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
        const updatedSubscription = (
          await scheduleSubscriptionCancellation(
            params,
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()
        expect(updatedSubscription.status).toBe(
          SubscriptionStatus.CancellationScheduled
        )
        expect(updatedSubscription.cancelScheduledAt).toBe(
          currentBP.endDate
        )
        // Verify that any billing period starting after the cancellation date is updated.
        const updatedFutureBP = (
          await selectBillingPeriodById(futureBP.id, transaction)
        ).unwrap()
        expect(updatedFutureBP.status).toBe(
          BillingPeriodStatus.ScheduledToCancel
        )
      })
    })

    it('should make no update if the subscription is already in a terminal state', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        // Create a billing period for AtEndOfCurrentBillingPeriod
        await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: Date.now() - 60 * 60 * 1000,
          endDate: Date.now() + 60 * 60 * 1000,
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
            timing:
              SubscriptionCancellationArrangement.AtEndOfCurrentBillingPeriod,
          },
        }
        const result = (
          await scheduleSubscriptionCancellation(
            params,
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()
        expect(result.status).toBe(SubscriptionStatus.Canceled)
      })
    })

    it('returns ValidationError when scheduling cancellation for a non-renewing subscription', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
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
        const result = await scheduleSubscriptionCancellation(
          params,
          createDiscardingEffectsContext(transaction)
        )
        expect(result.status).toBe('error')
        if (result.status === 'error') {
          expect(result.error).toBeInstanceOf(ValidationError)
          expect(result.error.message).toMatch(
            /non-renewing subscription/
          )
        }
      })
    })

    it('returns NotFoundError if no current billing period exists for `AtEndOfCurrentBillingPeriod`', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
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
        const result = await scheduleSubscriptionCancellation(
          params,
          createDiscardingEffectsContext(transaction)
        )
        expect(result.status).toBe('error')
        if (result.status === 'error') {
          expect(result.error).toBeInstanceOf(NotFoundError)
          expect(result.error.message).toMatch(
            /Current billing period not found: subscription/
          )
        }
      })
    })

    it('should handle boundary conditions for billing period dates correctly', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
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
        const updatedSubscription = (
          await scheduleSubscriptionCancellation(
            params,
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()
        expect(updatedSubscription.status).toBe(
          SubscriptionStatus.CancellationScheduled
        )
        // Verify that if the cancellation time equals the billing period start, the billing period is not updated as scheduled.
        const updatedBP = (
          await selectBillingPeriodById(bp.id, transaction)
        ).unwrap()
        expect(updatedBP.status).not.toBe(
          BillingPeriodStatus.ScheduledToCancel
        )
        Date.now = originalDateNow
      })
    })

    it('should abort all scheduled billing runs when subscription cancellation is scheduled', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
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
        await scheduleSubscriptionCancellation(
          params,
          createDiscardingEffectsContext(transaction)
        )

        // Verify all scheduled billing runs are now aborted
        const updatedBillingRun1 = (
          await selectBillingRunById(billingRun1.id, transaction)
        ).unwrap()
        const updatedBillingRun2 = (
          await selectBillingRunById(billingRun2.id, transaction)
        ).unwrap()

        expect(updatedBillingRun1.status).toBe(
          BillingRunStatus.Aborted
        )
        expect(updatedBillingRun2.status).toBe(
          BillingRunStatus.Aborted
        )
      })
    })

    it('handles immediate timing by canceling future billing periods and aborting scheduled runs', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
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
        const updatedSubscription = (
          await scheduleSubscriptionCancellation(
            params,
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()

        expect(updatedSubscription.status).toBe(
          SubscriptionStatus.CancellationScheduled
        )
        // For immediate timing, cancelScheduledAt is set to the current time
        expect(typeof updatedSubscription.cancelScheduledAt).toBe(
          'number'
        )
        expect(updatedSubscription.cancelScheduledAt).toBeGreaterThan(
          0
        )

        const updatedFuturePeriod = (
          await selectBillingPeriodById(futurePeriod.id, transaction)
        ).unwrap()
        expect(updatedFuturePeriod.status).toBe(
          BillingPeriodStatus.ScheduledToCancel
        )
        const currentPeriodAfter = (
          await selectBillingPeriodById(currentPeriod.id, transaction)
        ).unwrap()
        expect(currentPeriodAfter.status).not.toBe(
          BillingPeriodStatus.ScheduledToCancel
        )
        const updatedBillingRun = (
          await selectBillingRunById(billingRunRecord.id, transaction)
        ).unwrap()
        expect(updatedBillingRun.status).toBe(
          BillingRunStatus.Aborted
        )
      })
    })

    it('invokes the subscription-cancellation-scheduled notification exactly once per schedule call', async () => {
      const notificationSpy = spyOn(
        subscriptionCancellationNotifications,
        'idempotentSendOrganizationSubscriptionCancellationScheduledNotification'
      ).mockResolvedValue(undefined)
      try {
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
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
          ;(
            await scheduleSubscriptionCancellation(
              params,
              createDiscardingEffectsContext(transaction)
            )
          ).unwrap()
        })
        expect(notificationSpy).toHaveBeenCalledTimes(1)
      } finally {
        notificationSpy.mockRestore()
      }
    })
  })

  describe('cancelSubscriptionProcedureTransaction', () => {
    it('returns the updated subscription and events for immediate cancellations', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
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
        const { callbacks, effects } = createCapturingCallbacks()
        const response = await cancelSubscriptionProcedureTransaction(
          {
            input: {
              id: immediateSubscription.id,
              cancellation: {
                timing:
                  SubscriptionCancellationArrangement.Immediately,
              },
            },
            ctx: { apiKey: undefined },
            transactionCtx: withAdminCacheContext({
              transaction,
              livemode: true,
              invalidateCache: callbacks.invalidateCache,
              emitEvent: callbacks.emitEvent,
              enqueueLedgerCommand: callbacks.enqueueLedgerCommand,
            }),
          }
        )

        expect(response.unwrap().subscription.id).toBe(
          immediateSubscription.id
        )
        expect(response.unwrap().subscription.current).toBe(false)
        // Verify events were captured via callbacks
        expect(effects.events).toHaveLength(1)
        expect(effects.cacheInvalidations).toContain(
          CacheDependency.customerSubscriptions(customer.id)
        )
      })
    })

    it('returns scheduled cancellations without events for non-immediate timing', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
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
        const { callbacks, effects } = createCapturingCallbacks()
        const response = await cancelSubscriptionProcedureTransaction(
          {
            input: {
              id: scheduledSubscription.id,
              cancellation: {
                timing:
                  SubscriptionCancellationArrangement.AtEndOfCurrentBillingPeriod,
              },
            },
            ctx: {
              apiKey: undefined,
            },
            transactionCtx: withAdminCacheContext({
              transaction,
              livemode: true,
              invalidateCache: callbacks.invalidateCache,
              emitEvent: callbacks.emitEvent,
              enqueueLedgerCommand: callbacks.enqueueLedgerCommand,
            }),
          }
        )

        expect(response.unwrap().subscription.status).toBe(
          SubscriptionStatus.CancellationScheduled
        )
        // Verify no events were captured via callbacks
        expect(effects.events).toHaveLength(0)
        // For AtEndOfCurrentBillingPeriod, cancelScheduledAt should be set to the billing period end
        expect(response.unwrap().subscription.cancelScheduledAt).toBe(
          now + 60 * 60 * 1000
        )
      })
    })
  })

  /* --------------------------------------------------------------------------
     Edge Cases and Error Handling
  --------------------------------------------------------------------------- */
  describe('Edge Cases and Error Handling', () => {
    it('should handle subscriptions with no billing periods gracefully', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
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
            {
              subscription,
            },
            createDiscardingEffectsContext(transaction)
          )
          result = output.unwrap()
        } catch (error) {
          result = null
        }
        expect(result).toMatchObject({})
      })
    })

    it('should handle overlapping billing periods correctly', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
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
        const updatedSubscription = (
          await cancelSubscriptionImmediately(
            {
              subscription,
            },
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()
        expect(updatedSubscription.status).toBe(
          SubscriptionStatus.Canceled
        )
        const updatedBP1 = (
          await selectBillingPeriodById(bp1.id, transaction)
        ).unwrap()
        const updatedBP2 = (
          await selectBillingPeriodById(bp2.id, transaction)
        ).unwrap()
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
      // Set up subscription in its own transaction first
      const subscription = await adminTransaction(async () => {
        const sub = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        await setupBillingPeriod({
          subscriptionId: sub.id,
          startDate: new Date(Date.now() - 60 * 60 * 1000),
          endDate: new Date(Date.now() + 60 * 60 * 1000),
        })
        return sub
      })

      // Fire off two concurrent cancellation calls with separate transactions
      // so they obtain separate DB connections and truly run concurrently
      const [output1, output2] = await Promise.all([
        adminTransaction(async ({ transaction }) =>
          cancelSubscriptionImmediately(
            {
              subscription,
            },
            createDiscardingEffectsContext(transaction)
          )
        ),
        adminTransaction(async ({ transaction }) =>
          cancelSubscriptionImmediately(
            {
              subscription,
            },
            createDiscardingEffectsContext(transaction)
          )
        ),
      ])
      const result1 = output1.unwrap()
      const result2 = output2.unwrap()
      expect(result1.status).toBe(SubscriptionStatus.Canceled)
      expect(result2.status).toBe(SubscriptionStatus.Canceled)
    })

    it('should throw an error for invalid subscription input', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        // Passing a null subscription should result in an error.
        await expect(
          cancelSubscriptionImmediately(
            {
              subscription: null as unknown as Subscription.Record,
            },
            createDiscardingEffectsContext(transaction)
          )
        ).rejects.toThrow()
      })
    })
  })

  /* --------------------------------------------------------------------------
     Integration Tests (Partial Scope)
  --------------------------------------------------------------------------- */
  describe('Integration Tests (Partial Scope)', () => {
    it('should integrate correctly with subscription lifecycle operations', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
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
        const updatedSubscription = (
          await cancelSubscriptionImmediately(
            {
              subscription,
            },
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()
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
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
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
        await abortScheduledBillingRuns(
          subscription.id,
          createDiscardingEffectsContext(transaction)
        )
        await abortScheduledBillingRuns(
          subscription.id,
          createDiscardingEffectsContext(transaction)
        )

        // Verify billing runs are still aborted (not double-aborted or in error state)
        const updatedBillingRun1 = (
          await selectBillingRunById(billingRun1.id, transaction)
        ).unwrap()
        const updatedBillingRun2 = (
          await selectBillingRunById(billingRun2.id, transaction)
        ).unwrap()

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
      const { organization, pricingModel } = (
        await setupOrg()
      ).unwrap()
      const paidProduct = (
        await setupProduct({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Paid Plan',
        })
      ).unwrap()
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
      const customer = (
        await setupCustomer({
          organizationId: organization.id,
        })
      ).unwrap()
      const paymentMethod = (
        await setupPaymentMethod({
          organizationId: organization.id,
          customerId: customer.id,
        })
      ).unwrap()

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
      const usageMeter = (
        await setupUsageMeter({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Test Meter',
        })
      ).unwrap()

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
      const canceledAt = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const result = (
          await cancelSubscriptionImmediately(
            {
              subscription,
            },
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()
        return result.canceledAt
      })

      // Verify subscription items are expired
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
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
      const { organization, pricingModel } = (
        await setupOrg()
      ).unwrap()
      const paidProduct = (
        await setupProduct({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Paid Plan',
        })
      ).unwrap()
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
      const customer = (
        await setupCustomer({
          organizationId: organization.id,
        })
      ).unwrap()
      const paymentMethod = (
        await setupPaymentMethod({
          organizationId: organization.id,
          customerId: customer.id,
        })
      ).unwrap()

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
      const usageMeter1 = (
        await setupUsageMeter({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Test Meter 1',
        })
      ).unwrap()

      const usageMeter2 = (
        await setupUsageMeter({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Test Meter 2',
        })
      ).unwrap()

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
      const canceledAt = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const result = (
          await cancelSubscriptionImmediately(
            {
              subscription,
            },
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()
        return result.canceledAt
      })

      // Verify all subscription items are expired
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
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
    it('returns ValidationError when attempting to cancel a free plan subscription', async () => {
      const {
        organization,
        price: freePrice,
        pricingModel,
      } = (await setupOrg()).unwrap()
      const customer = (
        await setupCustomer({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
        })
      ).unwrap()
      const paymentMethod = (
        await setupPaymentMethod({
          organizationId: organization.id,
          customerId: customer.id,
        })
      ).unwrap()
      // Ensure the price is free (unitPrice = 0)
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await updatePrice(
          {
            id: freePrice.id,
            unitPrice: 0,
            type: PriceType.Subscription,
          },
          ctx
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

      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const result = await cancelSubscriptionProcedureTransaction({
          input: {
            id: freeSubscription.id,
            cancellation: {
              timing: SubscriptionCancellationArrangement.Immediately,
            },
          },
          ctx: { apiKey: undefined },
          transactionCtx: withAdminCacheContext({
            transaction,
            livemode: true,
            invalidateCache: noopInvalidateCache,
            emitEvent: noopEmitEvent,
            enqueueLedgerCommand: () => {},
          }),
        })
        expect(result.status).toBe('error')
        if (result.status === 'error') {
          expect(result.error).toBeInstanceOf(ValidationError)
          expect(result.error.message).toMatch(
            /Cannot cancel the default free plan/
          )
        }
      })
    })

    it('should allow cancellation of paid plan subscriptions', async () => {
      const { organization, pricingModel } = (
        await setupOrg()
      ).unwrap()
      const paidProduct = (
        await setupProduct({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Paid Plan',
        })
      ).unwrap()
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
      const customer = (
        await setupCustomer({
          organizationId: organization.id,
        })
      ).unwrap()
      const paymentMethod = (
        await setupPaymentMethod({
          organizationId: organization.id,
          customerId: customer.id,
        })
      ).unwrap()
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

      const response = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        return cancelSubscriptionProcedureTransaction({
          input: {
            id: paidSubscription.id,
            cancellation: {
              timing: SubscriptionCancellationArrangement.Immediately,
            },
          },
          ctx: { apiKey: undefined },
          transactionCtx: withAdminCacheContext({
            transaction,
            livemode: true,
            invalidateCache: noopInvalidateCache,
            emitEvent: noopEmitEvent,
            enqueueLedgerCommand: () => {},
          }),
        })
      })

      expect(response.unwrap().subscription.status).toBe(
        SubscriptionStatus.Canceled
      )
    })

    it('returns ValidationError when attempting to schedule cancellation of a free plan', async () => {
      const {
        organization,
        price: freePrice,
        pricingModel,
      } = (await setupOrg()).unwrap()
      const customer = (
        await setupCustomer({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
        })
      ).unwrap()
      const paymentMethod = (
        await setupPaymentMethod({
          organizationId: organization.id,
          customerId: customer.id,
        })
      ).unwrap()
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await updatePrice(
          {
            id: freePrice.id,
            unitPrice: 0,
            type: PriceType.Subscription,
          },
          ctx
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

      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const result = await cancelSubscriptionProcedureTransaction({
          input: {
            id: freeSubscription.id,
            cancellation: {
              timing:
                SubscriptionCancellationArrangement.AtEndOfCurrentBillingPeriod,
            },
          },
          ctx: { apiKey: undefined },
          transactionCtx: withAdminCacheContext({
            transaction,
            livemode: true,
            invalidateCache: noopInvalidateCache,
            emitEvent: noopEmitEvent,
            enqueueLedgerCommand: () => {},
          }),
        })
        expect(result.status).toBe('error')
        if (result.status === 'error') {
          expect(result.error).toBeInstanceOf(ValidationError)
          expect(result.error.message).toMatch(
            /Cannot cancel the default free plan/
          )
        }
      })
    })
  })

  /* --------------------------------------------------------------------------
     Uncancel Subscription Tests
  --------------------------------------------------------------------------- */
  describe('uncancelSubscription', () => {
    it('should uncancel a subscription in CancellationScheduled status and revert to Active', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.CancellationScheduled,
          cancelScheduledAt: Date.now() + 60 * 60 * 1000,
        })

        const updatedSubscription = (
          await uncancelSubscription(
            subscription,
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()

        expect(updatedSubscription.status).toBe(
          SubscriptionStatus.Active
        )
        expect(updatedSubscription.cancelScheduledAt).toBeNull()
      })
    })

    it('should uncancel a subscription with future trialEnd and revert to Trialing', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const futureTrialEnd = Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days in future
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.CancellationScheduled,
          cancelScheduledAt: Date.now() + 60 * 60 * 1000,
          trialEnd: futureTrialEnd,
        })

        const updatedSubscription = (
          await uncancelSubscription(
            subscription,
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()

        expect(updatedSubscription.status).toBe(
          SubscriptionStatus.Trialing
        )
        expect(updatedSubscription.cancelScheduledAt).toBeNull()
      })
    })

    it('should silently succeed if subscription is not in CancellationScheduled status (idempotent)', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.Active,
        })

        const updatedSubscription = (
          await uncancelSubscription(
            subscription,
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()

        expect(updatedSubscription.status).toBe(
          SubscriptionStatus.Active
        )
        expect(updatedSubscription.id).toBe(subscription.id)
      })
    })

    it('should silently succeed if subscription is in terminal state (idempotent)', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.Canceled,
        })

        const updatedSubscription = (
          await uncancelSubscription(
            subscription,
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()

        expect(updatedSubscription.status).toBe(
          SubscriptionStatus.Canceled
        )
        expect(updatedSubscription.id).toBe(subscription.id)
      })
    })

    it('should revert billing periods from ScheduledToCancel to Upcoming', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const now = Date.now()
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.CancellationScheduled,
          cancelScheduledAt: now + 60 * 60 * 1000,
        })

        // Create a billing period marked as ScheduledToCancel
        const futureBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: now + 2 * 60 * 60 * 1000,
          endDate: now + 3 * 60 * 60 * 1000,
          status: BillingPeriodStatus.ScheduledToCancel,
        })

        await uncancelSubscription(
          subscription,
          createDiscardingEffectsContext(transaction)
        )

        const updatedBP = (
          await selectBillingPeriodById(futureBP.id, transaction)
        ).unwrap()
        expect(updatedBP.status).toBe(BillingPeriodStatus.Upcoming)
      })
    })

    it('should revert current billing period from ScheduledToCancel to Active', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const now = Date.now()
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.CancellationScheduled,
          cancelScheduledAt: now + 60 * 60 * 1000,
        })

        // Create a current billing period (already started) marked as ScheduledToCancel
        const currentBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: now - 60 * 60 * 1000, // Started 1 hour ago
          endDate: now + 60 * 60 * 1000, // Ends 1 hour from now
          status: BillingPeriodStatus.ScheduledToCancel,
        })

        await uncancelSubscription(
          subscription,
          createDiscardingEffectsContext(transaction)
        )

        const updatedBP = (
          await selectBillingPeriodById(currentBP.id, transaction)
        ).unwrap()
        expect(updatedBP.status).toBe(BillingPeriodStatus.Active)
      })
    })

    it('should clear cancelScheduledAt when uncanceling', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const now = Date.now()
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.CancellationScheduled,
          cancelScheduledAt: now + 60 * 60 * 1000,
        })

        const updatedSubscription = (
          await uncancelSubscription(
            subscription,
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()

        expect(updatedSubscription.cancelScheduledAt).toBeNull()
      })
    })

    it('returns ValidationError when paid subscription has no payment method (security)', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const now = Date.now()
        // Create subscription first, then clear payment method
        const tempSubscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          priceId: price.id,
          status: SubscriptionStatus.CancellationScheduled,
          cancelScheduledAt: now + 60 * 60 * 1000,
          isFreePlan: false,
        })

        // Clear the payment method to simulate no payment method
        const paidSubscription = await updateSubscription(
          {
            id: tempSubscription.id,
            defaultPaymentMethodId: null,
            renews: tempSubscription.renews,
          },
          transaction
        )

        // Create a billing period to trigger the reschedule logic
        await setupBillingPeriod({
          subscriptionId: paidSubscription.id,
          startDate: now + 2 * 60 * 60 * 1000,
          endDate: now + 3 * 60 * 60 * 1000,
          status: BillingPeriodStatus.ScheduledToCancel,
        })

        const result = await uncancelSubscription(
          paidSubscription,
          createDiscardingEffectsContext(transaction)
        )
        expect(result.status).toBe('error')
        if (result.status === 'error') {
          expect(result.error).toBeInstanceOf(ValidationError)
          expect(result.error.message).toMatch(
            /Cannot uncancel paid subscription without an active payment method/
          )
        }
      })
    })

    it('should succeed for free subscription without payment method', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const now = Date.now()
        // Create free subscription first, then clear payment method
        const tempSubscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          priceId: price.id,
          status: SubscriptionStatus.CancellationScheduled,
          cancelScheduledAt: now + 60 * 60 * 1000,
          isFreePlan: true,
        })

        // Clear the payment method to simulate no payment method
        const freeSubscription = await updateSubscription(
          {
            id: tempSubscription.id,
            defaultPaymentMethodId: null,
            renews: tempSubscription.renews,
          },
          transaction
        )

        // Create a billing period marked as ScheduledToCancel
        await setupBillingPeriod({
          subscriptionId: freeSubscription.id,
          startDate: now + 2 * 60 * 60 * 1000,
          endDate: now + 3 * 60 * 60 * 1000,
          status: BillingPeriodStatus.ScheduledToCancel,
        })

        const updatedSubscription = (
          await uncancelSubscription(
            freeSubscription,
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()

        expect(updatedSubscription.status).toBe(
          SubscriptionStatus.Active
        )
      })
    })

    it('should succeed for doNotCharge subscription without payment method', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const now = Date.now()
        // Create doNotCharge subscription without payment method
        const doNotChargeSubscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          priceId: price.id,
          status: SubscriptionStatus.CancellationScheduled,
          cancelScheduledAt: now + 60 * 60 * 1000,
          isFreePlan: false, // NOT a free plan
          doNotCharge: true, // But marked as doNotCharge
        })

        // Create a billing period marked as ScheduledToCancel
        await setupBillingPeriod({
          subscriptionId: doNotChargeSubscription.id,
          startDate: now + 2 * 60 * 60 * 1000,
          endDate: now + 3 * 60 * 60 * 1000,
          status: BillingPeriodStatus.ScheduledToCancel,
        })

        // Should succeed without payment method since it's doNotCharge
        const updatedSubscription = (
          await uncancelSubscription(
            doNotChargeSubscription,
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()

        expect(updatedSubscription.status).toBe(
          SubscriptionStatus.Active
        )
      })
    })

    it('should create NEW billing runs for periods with Aborted runs', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const now = Date.now()
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.CancellationScheduled,
          cancelScheduledAt: now + 60 * 60 * 1000,
        })

        // Create a future billing period
        const futureBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: now + 2 * 60 * 60 * 1000,
          endDate: now + 3 * 60 * 60 * 1000,
          status: BillingPeriodStatus.ScheduledToCancel,
        })

        // Create an aborted billing run for the future period
        await setupBillingRun({
          billingPeriodId: futureBP.id,
          subscriptionId: subscription.id,
          paymentMethodId: paymentMethod.id,
          status: BillingRunStatus.Aborted,
          scheduledFor: now + 3 * 60 * 60 * 1000,
        })

        await uncancelSubscription(
          subscription,
          createDiscardingEffectsContext(transaction)
        )

        // Check that a new billing run was created (should have 2 runs now)
        const billingRuns = await selectBillingRuns(
          { billingPeriodId: futureBP.id },
          transaction
        )

        const scheduledRuns = billingRuns.filter(
          (run) => run.status === BillingRunStatus.Scheduled
        )
        expect(scheduledRuns.length).toBe(1)
      })
    })

    it('should NOT create billing runs for Stripe-aborted runs (with lastPaymentIntentEventTimestamp)', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const now = Date.now()
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.CancellationScheduled,
          cancelScheduledAt: now + 60 * 60 * 1000,
        })

        // Create a current billing period (started 1 hour ago, ends 1 hour from now)
        const currentBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: now - 60 * 60 * 1000,
          endDate: now + 60 * 60 * 1000,
          status: BillingPeriodStatus.ScheduledToCancel,
        })

        // Create a Stripe-aborted billing run (has lastPaymentIntentEventTimestamp)
        // This simulates a run that was aborted by Stripe payment failure, not by cancellation
        await setupBillingRun({
          billingPeriodId: currentBP.id,
          subscriptionId: subscription.id,
          paymentMethodId: paymentMethod.id,
          status: BillingRunStatus.Aborted,
          scheduledFor: now + 60 * 60 * 1000,
          lastPaymentIntentEventTimestamp: now - 1000, // Has a timestamp = Stripe aborted
        })

        await uncancelSubscription(
          subscription,
          createDiscardingEffectsContext(transaction)
        )

        // Check that NO new billing run was created (Stripe-aborted runs should be skipped)
        const billingRuns = await selectBillingRuns(
          { billingPeriodId: currentBP.id },
          transaction
        )

        expect(billingRuns.length).toBe(1)
        expect(billingRuns[0].status).toBe(BillingRunStatus.Aborted)
        expect(
          typeof billingRuns[0].lastPaymentIntentEventTimestamp
        ).toBe('number')
      })
    })

    it('should create billing runs for cancellation-aborted runs (without lastPaymentIntentEventTimestamp)', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const now = Date.now()
        const tempSubscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.CancellationScheduled,
          cancelScheduledAt: now + 60 * 60 * 1000,
        })

        // Update subscription to have runBillingAtPeriodStart = false
        // so billing runs are scheduled at period end (which is in the future)
        const subscription = await updateSubscription(
          {
            id: tempSubscription.id,
            runBillingAtPeriodStart: false,
            renews: tempSubscription.renews,
          },
          transaction
        )

        // Create a current billing period (started 1 hour ago, ends 1 hour from now)
        const currentBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: now - 60 * 60 * 1000,
          endDate: now + 60 * 60 * 1000,
          status: BillingPeriodStatus.ScheduledToCancel,
        })

        // Create a cancellation-aborted billing run (no lastPaymentIntentEventTimestamp)
        // This simulates a run that was aborted by scheduleSubscriptionCancellation
        await setupBillingRun({
          billingPeriodId: currentBP.id,
          subscriptionId: subscription.id,
          paymentMethodId: paymentMethod.id,
          status: BillingRunStatus.Aborted,
          scheduledFor: now + 60 * 60 * 1000,
          lastPaymentIntentEventTimestamp: null, // No timestamp = cancellation aborted
        })

        await uncancelSubscription(
          subscription,
          createDiscardingEffectsContext(transaction)
        )

        // Check that a new Scheduled billing run was created
        const billingRuns = await selectBillingRuns(
          { billingPeriodId: currentBP.id },
          transaction
        )

        const scheduledRuns = billingRuns.filter(
          (run) => run.status === BillingRunStatus.Scheduled
        )
        expect(scheduledRuns.length).toBe(1)
      })
    })

    it('should NOT create billing runs when InProgress run exists', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const now = Date.now()
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.CancellationScheduled,
          cancelScheduledAt: now + 60 * 60 * 1000,
        })

        // Create a current billing period (started 1 hour ago, ends 1 hour from now)
        const currentBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: now - 60 * 60 * 1000,
          endDate: now + 60 * 60 * 1000,
          status: BillingPeriodStatus.ScheduledToCancel,
        })

        // Create an InProgress billing run
        await setupBillingRun({
          billingPeriodId: currentBP.id,
          subscriptionId: subscription.id,
          paymentMethodId: paymentMethod.id,
          status: BillingRunStatus.InProgress,
          scheduledFor: now + 60 * 60 * 1000,
        })

        await uncancelSubscription(
          subscription,
          createDiscardingEffectsContext(transaction)
        )

        // Check that NO new billing run was created
        const billingRuns = await selectBillingRuns(
          { billingPeriodId: currentBP.id },
          transaction
        )

        expect(billingRuns.length).toBe(1)
        expect(billingRuns[0].status).toBe(
          BillingRunStatus.InProgress
        )
      })
    })

    it('should NOT create billing runs when AwaitingPaymentConfirmation run exists', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const now = Date.now()
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.CancellationScheduled,
          cancelScheduledAt: now + 60 * 60 * 1000,
        })

        // Create a current billing period (started 1 hour ago, ends 1 hour from now)
        const currentBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: now - 60 * 60 * 1000,
          endDate: now + 60 * 60 * 1000,
          status: BillingPeriodStatus.ScheduledToCancel,
        })

        // Create an AwaitingPaymentConfirmation billing run
        await setupBillingRun({
          billingPeriodId: currentBP.id,
          subscriptionId: subscription.id,
          paymentMethodId: paymentMethod.id,
          status: BillingRunStatus.AwaitingPaymentConfirmation,
          scheduledFor: now + 60 * 60 * 1000,
        })

        await uncancelSubscription(
          subscription,
          createDiscardingEffectsContext(transaction)
        )

        // Check that NO new billing run was created
        const billingRuns = await selectBillingRuns(
          { billingPeriodId: currentBP.id },
          transaction
        )

        expect(billingRuns.length).toBe(1)
        expect(billingRuns[0].status).toBe(
          BillingRunStatus.AwaitingPaymentConfirmation
        )
      })
    })

    it('should leave Scheduled runs as-is (already valid)', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const now = Date.now()
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.CancellationScheduled,
          cancelScheduledAt: now + 60 * 60 * 1000,
        })

        // Create a future billing period
        const futureBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: now + 2 * 60 * 60 * 1000,
          endDate: now + 3 * 60 * 60 * 1000,
          status: BillingPeriodStatus.ScheduledToCancel,
        })

        // Create a scheduled billing run (should NOT be duplicated)
        const existingRun = await setupBillingRun({
          billingPeriodId: futureBP.id,
          subscriptionId: subscription.id,
          paymentMethodId: paymentMethod.id,
          status: BillingRunStatus.Scheduled,
          scheduledFor: now + 3 * 60 * 60 * 1000,
        })

        await uncancelSubscription(
          subscription,
          createDiscardingEffectsContext(transaction)
        )

        // Check that no additional billing run was created
        const billingRuns = await selectBillingRuns(
          { billingPeriodId: futureBP.id },
          transaction
        )

        expect(billingRuns.length).toBe(1)
        expect(billingRuns[0].id).toBe(existingRun.id)
      })
    })

    it('should skip terminal runs (Succeeded/Failed)', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const now = Date.now()
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.CancellationScheduled,
          cancelScheduledAt: now + 60 * 60 * 1000,
        })

        // Create a billing period
        const bp = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: now + 2 * 60 * 60 * 1000,
          endDate: now + 3 * 60 * 60 * 1000,
          status: BillingPeriodStatus.ScheduledToCancel,
        })

        // Create a succeeded billing run (should NOT create another run)
        await setupBillingRun({
          billingPeriodId: bp.id,
          subscriptionId: subscription.id,
          paymentMethodId: paymentMethod.id,
          status: BillingRunStatus.Succeeded,
          scheduledFor: now - 30 * 60 * 1000, // in the past
        })

        await uncancelSubscription(
          subscription,
          createDiscardingEffectsContext(transaction)
        )

        // Check that no new billing run was created
        const billingRuns = await selectBillingRuns(
          { billingPeriodId: bp.id },
          transaction
        )

        expect(billingRuns.length).toBe(1)
        expect(billingRuns[0].status).toBe(BillingRunStatus.Succeeded)
      })
    })

    it('should skip billing runs for trial periods', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const now = Date.now()
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.CancellationScheduled,
          cancelScheduledAt: now + 60 * 60 * 1000,
        })

        // Create a billing period first
        const tempBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: now + 2 * 60 * 60 * 1000,
          endDate: now + 3 * 60 * 60 * 1000,
          status: BillingPeriodStatus.ScheduledToCancel,
        })

        // Update to be a trial period
        const trialBP = await updateBillingPeriod(
          { id: tempBP.id, trialPeriod: true },
          transaction
        )

        await uncancelSubscription(
          subscription,
          createDiscardingEffectsContext(transaction)
        )

        // Check that no billing run was created for the trial period
        const billingRuns = await selectBillingRuns(
          { billingPeriodId: trialBP.id },
          transaction
        )

        expect(billingRuns.length).toBe(0)
      })
    })

    it('should be idempotent - calling multiple times has no side effects', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const now = Date.now()
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.CancellationScheduled,
          cancelScheduledAt: now + 60 * 60 * 1000,
        })

        await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: now + 2 * 60 * 60 * 1000,
          endDate: now + 3 * 60 * 60 * 1000,
          status: BillingPeriodStatus.ScheduledToCancel,
        })

        // Call uncancel twice
        const first = (
          await uncancelSubscription(
            subscription,
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()
        const second = (
          await uncancelSubscription(
            first,
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()

        expect(first.status).toBe(SubscriptionStatus.Active)
        expect(second.status).toBe(SubscriptionStatus.Active)
        expect(second.id).toBe(first.id)
      })
    })

    it('should handle subscription with runBillingAtPeriodStart = true', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const now = Date.now()
        // Create subscription first
        const tempSubscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.CancellationScheduled,
          cancelScheduledAt: now + 60 * 60 * 1000,
        })

        // Update to set runBillingAtPeriodStart = true
        const subscription = await updateSubscription(
          {
            id: tempSubscription.id,
            runBillingAtPeriodStart: true,
            renews: tempSubscription.renews,
          },
          transaction
        )

        // Create a future billing period
        const futureBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: now + 2 * 60 * 60 * 1000,
          endDate: now + 3 * 60 * 60 * 1000,
          status: BillingPeriodStatus.ScheduledToCancel,
        })

        await uncancelSubscription(
          subscription,
          createDiscardingEffectsContext(transaction)
        )

        // Check that a billing run was created scheduled at period start
        const billingRuns = await selectBillingRuns(
          { billingPeriodId: futureBP.id },
          transaction
        )

        const scheduledRuns = billingRuns.filter(
          (run) => run.status === BillingRunStatus.Scheduled
        )
        expect(scheduledRuns.length).toBe(1)
        expect(scheduledRuns[0].scheduledFor).toBe(futureBP.startDate)
      })
    })

    it('should handle subscription with runBillingAtPeriodStart = false', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const now = Date.now()
        // Create subscription first
        const tempSubscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.CancellationScheduled,
          cancelScheduledAt: now + 60 * 60 * 1000,
        })

        // Update to set runBillingAtPeriodStart = false
        const subscription = await updateSubscription(
          {
            id: tempSubscription.id,
            runBillingAtPeriodStart: false,
            renews: tempSubscription.renews,
          },
          transaction
        )

        // Create a future billing period
        const futureBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: now + 2 * 60 * 60 * 1000,
          endDate: now + 3 * 60 * 60 * 1000,
          status: BillingPeriodStatus.ScheduledToCancel,
        })

        await uncancelSubscription(
          subscription,
          createDiscardingEffectsContext(transaction)
        )

        // Check that a billing run was created scheduled at period end
        const billingRuns = await selectBillingRuns(
          { billingPeriodId: futureBP.id },
          transaction
        )

        const scheduledRuns = billingRuns.filter(
          (run) => run.status === BillingRunStatus.Scheduled
        )
        expect(scheduledRuns.length).toBe(1)
        expect(scheduledRuns[0].scheduledFor).toBe(futureBP.endDate)
      })
    })

    it('should only create billing runs for future dates', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const now = Date.now()
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.CancellationScheduled,
          cancelScheduledAt: now + 60 * 60 * 1000,
        })

        // Create a billing period that is in the past (should not get a billing run)
        const pastBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: now - 3 * 60 * 60 * 1000,
          endDate: now - 2 * 60 * 60 * 1000,
          status: BillingPeriodStatus.ScheduledToCancel,
        })

        await uncancelSubscription(
          subscription,
          createDiscardingEffectsContext(transaction)
        )

        // Check that no billing run was created for the past period
        const billingRuns = await selectBillingRuns(
          { billingPeriodId: pastBP.id },
          transaction
        )

        expect(billingRuns.length).toBe(0)
      })
    })

    it('should create billing run for current period when runBillingAtPeriodStart = false and period end is in future', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const now = Date.now()
        const tempSubscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.CancellationScheduled,
          cancelScheduledAt: now + 60 * 60 * 1000,
        })

        // Update subscription to have runBillingAtPeriodStart = false
        const subscription = await updateSubscription(
          {
            id: tempSubscription.id,
            runBillingAtPeriodStart: false,
            renews: tempSubscription.renews,
          },
          transaction
        )

        // Create a current billing period (started, but ends in future)
        const currentBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: now - 60 * 60 * 1000, // Started 1 hour ago
          endDate: now + 2 * 60 * 60 * 1000, // Ends 2 hours from now
          status: BillingPeriodStatus.ScheduledToCancel,
        })

        // Create an aborted billing run (simulating what happens during cancellation)
        await setupBillingRun({
          billingPeriodId: currentBP.id,
          subscriptionId: subscription.id,
          paymentMethodId: paymentMethod.id,
          status: BillingRunStatus.Aborted,
          scheduledFor: now + 2 * 60 * 60 * 1000, // Was scheduled for period end
        })

        await uncancelSubscription(
          subscription,
          createDiscardingEffectsContext(transaction)
        )

        // Check that a new billing run was created for the current period
        const billingRuns = await selectBillingRuns(
          { billingPeriodId: currentBP.id },
          transaction
        )

        const scheduledRuns = billingRuns.filter(
          (run) => run.status === BillingRunStatus.Scheduled
        )
        expect(scheduledRuns.length).toBe(1)
        // Should be scheduled at period end since runBillingAtPeriodStart = false
        expect(scheduledRuns[0].scheduledFor).toBe(currentBP.endDate)
      })
    })

    it('should NOT create billing run for current period when runBillingAtPeriodStart = true (start date is in past)', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const now = Date.now()
        const tempSubscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.CancellationScheduled,
          cancelScheduledAt: now + 60 * 60 * 1000,
        })

        // Update subscription to have runBillingAtPeriodStart = true
        const subscription = await updateSubscription(
          {
            id: tempSubscription.id,
            runBillingAtPeriodStart: true,
            renews: tempSubscription.renews,
          },
          transaction
        )

        // Create a current billing period (started, so start date is in past)
        const currentBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: now - 60 * 60 * 1000, // Started 1 hour ago
          endDate: now + 2 * 60 * 60 * 1000, // Ends 2 hours from now
          status: BillingPeriodStatus.ScheduledToCancel,
        })

        // Create an aborted billing run
        await setupBillingRun({
          billingPeriodId: currentBP.id,
          subscriptionId: subscription.id,
          paymentMethodId: paymentMethod.id,
          status: BillingRunStatus.Aborted,
          scheduledFor: now - 60 * 60 * 1000, // Was scheduled at period start (past)
        })

        await uncancelSubscription(
          subscription,
          createDiscardingEffectsContext(transaction)
        )

        // Check that NO new billing run was created (start date is in past)
        const billingRuns = await selectBillingRuns(
          { billingPeriodId: currentBP.id },
          transaction
        )

        const scheduledRuns = billingRuns.filter(
          (run) => run.status === BillingRunStatus.Scheduled
        )
        expect(scheduledRuns.length).toBe(0)
      })
    })

    it('should handle both current and future billing periods correctly on uncancel', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const now = Date.now()
        const tempSubscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.CancellationScheduled,
          cancelScheduledAt: now + 3 * 60 * 60 * 1000, // Cancel scheduled at end of current period
        })

        // Use runBillingAtPeriodStart = false (bill at period end)
        const subscription = await updateSubscription(
          {
            id: tempSubscription.id,
            runBillingAtPeriodStart: false,
            renews: tempSubscription.renews,
          },
          transaction
        )

        // Create current billing period (Active -> ScheduledToCancel during cancellation)
        const currentBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: now - 60 * 60 * 1000, // Started 1 hour ago
          endDate: now + 3 * 60 * 60 * 1000, // Ends 3 hours from now
          status: BillingPeriodStatus.ScheduledToCancel,
        })

        // Create future billing period (Upcoming -> ScheduledToCancel during cancellation)
        const futureBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: now + 3 * 60 * 60 * 1000, // Starts after current ends
          endDate: now + 6 * 60 * 60 * 1000,
          status: BillingPeriodStatus.ScheduledToCancel,
        })

        // Aborted billing run for current period
        await setupBillingRun({
          billingPeriodId: currentBP.id,
          subscriptionId: subscription.id,
          paymentMethodId: paymentMethod.id,
          status: BillingRunStatus.Aborted,
          scheduledFor: now + 3 * 60 * 60 * 1000,
        })

        // Aborted billing run for future period
        await setupBillingRun({
          billingPeriodId: futureBP.id,
          subscriptionId: subscription.id,
          paymentMethodId: paymentMethod.id,
          status: BillingRunStatus.Aborted,
          scheduledFor: now + 6 * 60 * 60 * 1000,
        })

        await uncancelSubscription(
          subscription,
          createDiscardingEffectsContext(transaction)
        )

        // Verify current billing period reverted to Active
        const updatedCurrentBP = (
          await selectBillingPeriodById(currentBP.id, transaction)
        ).unwrap()
        expect(updatedCurrentBP.status).toBe(
          BillingPeriodStatus.Active
        )

        // Verify future billing period reverted to Upcoming
        const updatedFutureBP = (
          await selectBillingPeriodById(futureBP.id, transaction)
        ).unwrap()
        expect(updatedFutureBP.status).toBe(
          BillingPeriodStatus.Upcoming
        )

        // Verify new billing run created for current period (end date in future)
        const currentBPRuns = await selectBillingRuns(
          { billingPeriodId: currentBP.id },
          transaction
        )
        const currentScheduledRuns = currentBPRuns.filter(
          (run) => run.status === BillingRunStatus.Scheduled
        )
        expect(currentScheduledRuns.length).toBe(1)
        expect(currentScheduledRuns[0].scheduledFor).toBe(
          currentBP.endDate
        )

        // Verify new billing run created for future period
        const futureBPRuns = await selectBillingRuns(
          { billingPeriodId: futureBP.id },
          transaction
        )
        const futureScheduledRuns = futureBPRuns.filter(
          (run) => run.status === BillingRunStatus.Scheduled
        )
        expect(futureScheduledRuns.length).toBe(1)
        expect(futureScheduledRuns[0].scheduledFor).toBe(
          futureBP.endDate
        )
      })
    })
  })

  /* --------------------------------------------------------------------------
     uncancelSubscriptionProcedureTransaction Tests
  --------------------------------------------------------------------------- */
  describe('uncancelSubscriptionProcedureTransaction', () => {
    it('should return the updated subscription when uncanceling', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const now = Date.now()
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.CancellationScheduled,
          cancelScheduledAt: now + 60 * 60 * 1000,
        })

        await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: now - 60 * 60 * 1000,
          endDate: now + 60 * 60 * 1000,
        })

        const { callbacks, effects } = createCapturingCallbacks()
        const response =
          await uncancelSubscriptionProcedureTransaction({
            input: { id: subscription.id },
            ctx: { apiKey: undefined },
            transactionCtx: withAdminCacheContext({
              transaction,
              livemode: true,
              invalidateCache: callbacks.invalidateCache,
              emitEvent: callbacks.emitEvent,
              enqueueLedgerCommand: callbacks.enqueueLedgerCommand,
            }),
          })

        expect(response.unwrap().subscription.id).toBe(
          subscription.id
        )
        expect(response.unwrap().subscription.status).toBe(
          SubscriptionStatus.Active
        )
        expect(response.unwrap().subscription.current).toBe(true)
        // Verify no events were captured via callbacks
        expect(effects.events).toHaveLength(0)
      })
    })

    it('returns ValidationError when paid subscription has no payment method via procedure transaction', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const now = Date.now()
        // Create subscription first
        const tempSubscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          priceId: price.id,
          status: SubscriptionStatus.CancellationScheduled,
          cancelScheduledAt: now + 60 * 60 * 1000,
          isFreePlan: false,
        })

        // Clear the payment method to simulate no payment method
        const paidSubscription = await updateSubscription(
          {
            id: tempSubscription.id,
            defaultPaymentMethodId: null,
            renews: tempSubscription.renews,
          },
          transaction
        )

        await setupBillingPeriod({
          subscriptionId: paidSubscription.id,
          startDate: now + 2 * 60 * 60 * 1000,
          endDate: now + 3 * 60 * 60 * 1000,
          status: BillingPeriodStatus.ScheduledToCancel,
        })

        const result = await uncancelSubscriptionProcedureTransaction(
          {
            input: { id: paidSubscription.id },
            ctx: { apiKey: undefined },
            transactionCtx: withAdminCacheContext({
              transaction,
              livemode: true,
              invalidateCache: noopInvalidateCache,
              emitEvent: noopEmitEvent,
              enqueueLedgerCommand: () => {},
            }),
          }
        )
        expect(result.status).toBe('error')
        if (result.status === 'error') {
          expect(result.error).toBeInstanceOf(ValidationError)
          expect(result.error.message).toMatch(
            /Cannot uncancel paid subscription without an active payment method/
          )
        }
      })
    })
  })
})

/* ===========================================================================
   cancelSubscription with resources
=========================================================================== */
describe('cancelSubscription with resources', async () => {
  it('when a subscription is canceled immediately with active resource claims (both cattle and pet), releases all claims with releaseReason set to subscription_canceled', async () => {
    const { organization, pricingModel, price } = (
      await setupOrg()
    ).unwrap()

    const resource = (
      await setupResource({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        slug: 'seats',
        name: 'Seats',
      })
    ).unwrap()

    const customer = (
      await setupCustomer({
        organizationId: organization.id,
        email: 'test-cancel@test.com',
        livemode: true,
      })
    ).unwrap()

    const paymentMethod = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
        livemode: true,
      })
    ).unwrap()

    const product = (
      await setupProduct({
        organizationId: organization.id,
        name: 'Test Product with Resources',
        pricingModelId: pricingModel.id,
        livemode: true,
      })
    ).unwrap()

    const resourcePrice = await setupPrice({
      productId: product.id,
      name: 'Resource Price',
      unitPrice: 1000,
      livemode: true,
      isDefault: true,
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
    })

    const subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: resourcePrice.id,
      interval: IntervalUnit.Month,
      intervalCount: 1,
      isFreePlan: false,
    })

    const subscriptionItem = await setupSubscriptionItem({
      subscriptionId: subscription.id,
      name: 'Resource Subscription Item',
      quantity: 1,
      unitPrice: 1000,
    })

    // Create a Resource feature
    const resourceFeature = await setupResourceFeature({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Seats Feature',
      slug: 'seats-feature',
      description: 'Resource feature for seats',
      amount: 10,
      resourceId: resource.id,
      livemode: true,
    })

    const subscriptionItemFeature = (
      await setupResourceSubscriptionItemFeature({
        subscriptionItemId: subscriptionItem.id,
        featureId: resourceFeature.id,
        resourceId: resource.id,
        pricingModelId: pricingModel.id,
        amount: 10,
      })
    ).unwrap()

    // Create 3 cattle claims (no externalId)
    const cattleClaim1 = (
      await setupResourceClaim({
        organizationId: organization.id,
        resourceId: resource.id,
        subscriptionId: subscription.id,
        pricingModelId: pricingModel.id,
        externalId: null,
      })
    ).unwrap()

    const cattleClaim2 = (
      await setupResourceClaim({
        organizationId: organization.id,
        resourceId: resource.id,
        subscriptionId: subscription.id,
        pricingModelId: pricingModel.id,
        externalId: null,
      })
    ).unwrap()

    const cattleClaim3 = (
      await setupResourceClaim({
        organizationId: organization.id,
        resourceId: resource.id,
        subscriptionId: subscription.id,
        pricingModelId: pricingModel.id,
        externalId: null,
      })
    ).unwrap()

    // Create 2 pet claims (with externalId)
    const petClaim1 = (
      await setupResourceClaim({
        organizationId: organization.id,
        resourceId: resource.id,
        subscriptionId: subscription.id,
        pricingModelId: pricingModel.id,
        externalId: 'user_1',
      })
    ).unwrap()

    const petClaim2 = (
      await setupResourceClaim({
        organizationId: organization.id,
        resourceId: resource.id,
        subscriptionId: subscription.id,
        pricingModelId: pricingModel.id,
        externalId: 'user_2',
      })
    ).unwrap()

    // Verify we have 5 active claims before cancellation
    const claimsBefore = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectResourceClaims(
        { subscriptionId: subscription.id },
        transaction
      )
    })
    const activeClaimsBefore = claimsBefore.filter(
      (c) => c.releasedAt === null
    )
    expect(activeClaimsBefore.length).toBe(5)

    // Cancel the subscription immediately
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      await cancelSubscriptionImmediately(
        { subscription, customer, skipNotifications: true },
        createDiscardingEffectsContext(transaction)
      )
    })

    // Verify all claims are now released with subscription_canceled reason
    const claimsAfter = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectResourceClaims(
        { subscriptionId: subscription.id },
        transaction
      )
    })

    const activeClaimsAfter = claimsAfter.filter(
      (c) => c.releasedAt === null
    )
    expect(activeClaimsAfter.length).toBe(0)

    const releasedClaims = claimsAfter.filter(
      (c) => c.releasedAt !== null
    )
    expect(releasedClaims.length).toBe(5)

    // Verify all released claims have the correct releaseReason
    for (const claim of releasedClaims) {
      expect(claim.releaseReason).toBe('subscription_canceled')
      expect(typeof claim.releasedAt).toBe('number')
      expect(claim.releasedAt).toBeGreaterThan(0)
    }

    // Verify both cattle and pet claims were released
    const releasedCattleClaims = releasedClaims.filter(
      (c) => c.externalId === null
    )
    const releasedPetClaims = releasedClaims.filter(
      (c) => c.externalId !== null
    )
    expect(releasedCattleClaims.length).toBe(3)
    expect(releasedPetClaims.length).toBe(2)
  })

  it('when a subscription cancellation is scheduled for end of billing period, claims remain active until cancellation executes', async () => {
    const { organization, pricingModel, price } = (
      await setupOrg()
    ).unwrap()

    const resource = (
      await setupResource({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        slug: 'api-keys',
        name: 'API Keys',
      })
    ).unwrap()

    const customer = (
      await setupCustomer({
        organizationId: organization.id,
        email: 'test-scheduled-cancel@test.com',
        livemode: true,
      })
    ).unwrap()

    const paymentMethod = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
        livemode: true,
      })
    ).unwrap()

    const product = (
      await setupProduct({
        organizationId: organization.id,
        name: 'Test Product with API Keys',
        pricingModelId: pricingModel.id,
        livemode: true,
      })
    ).unwrap()

    const resourcePrice = await setupPrice({
      productId: product.id,
      name: 'API Key Price',
      unitPrice: 2000,
      livemode: true,
      isDefault: true,
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
    })

    const now = Date.now()
    const subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: resourcePrice.id,
      interval: IntervalUnit.Month,
      intervalCount: 1,
      isFreePlan: false,
      currentBillingPeriodStart: now - 15 * 24 * 60 * 60 * 1000, // 15 days ago
      currentBillingPeriodEnd: now + 15 * 24 * 60 * 60 * 1000, // 15 days from now
    })

    // Create billing period for the subscription
    await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: subscription.currentBillingPeriodStart!,
      endDate: subscription.currentBillingPeriodEnd!,
      status: BillingPeriodStatus.Active,
    })

    const subscriptionItem = await setupSubscriptionItem({
      subscriptionId: subscription.id,
      name: 'API Key Subscription Item',
      quantity: 1,
      unitPrice: 2000,
    })

    // Create a Resource feature
    const resourceFeature = await setupResourceFeature({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'API Keys Feature',
      slug: 'api-keys-feature',
      description: 'Resource feature for API keys',
      amount: 5,
      resourceId: resource.id,
      livemode: true,
    })

    const subscriptionItemFeature = (
      await setupResourceSubscriptionItemFeature({
        subscriptionItemId: subscriptionItem.id,
        featureId: resourceFeature.id,
        resourceId: resource.id,
        pricingModelId: pricingModel.id,
        amount: 5,
      })
    ).unwrap()

    // Create 5 claims
    for (let i = 0; i < 5; i++) {
      ;(
        await setupResourceClaim({
          organizationId: organization.id,
          resourceId: resource.id,
          subscriptionId: subscription.id,
          pricingModelId: pricingModel.id,
          externalId: i < 3 ? null : `api-key-${i}`, // 3 cattle, 2 pet
        })
      ).unwrap()
    }

    // Verify we have 5 active claims before scheduling cancellation
    const claimsBefore = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectResourceClaims(
        { subscriptionId: subscription.id },
        transaction
      )
    })
    const activeClaimsBefore = claimsBefore.filter(
      (c) => c.releasedAt === null
    )
    expect(activeClaimsBefore.length).toBe(5)

    // Schedule the subscription cancellation for end of billing period
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      ;(
        await scheduleSubscriptionCancellation(
          {
            id: subscription.id,
            cancellation: {
              timing:
                SubscriptionCancellationArrangement.AtEndOfCurrentBillingPeriod,
            },
          },
          createDiscardingEffectsContext(transaction)
        )
      ).unwrap()
    })

    // Verify claims remain active (should NOT be released)
    const claimsAfter = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectResourceClaims(
        { subscriptionId: subscription.id },
        transaction
      )
    })

    const activeClaimsAfter = claimsAfter.filter(
      (c) => c.releasedAt === null
    )
    // All 5 claims should still be active
    expect(activeClaimsAfter.length).toBe(5)

    const releasedClaims = claimsAfter.filter(
      (c) => c.releasedAt !== null
    )
    // No claims should be released yet
    expect(releasedClaims.length).toBe(0)
  })
})

describe('Subscription cancellation cache invalidations', async () => {
  describe('cancelSubscriptionImmediately', () => {
    it('returns customerSubscriptions cache invalidation for the customer', async () => {
      const { organization, price } = (await setupOrg()).unwrap()
      const customer = (
        await setupCustomer({
          organizationId: organization.id,
        })
      ).unwrap()
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: SubscriptionStatus.Active,
      })

      const effects = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const { ctx: effectsCtx, effects } =
          createCapturingEffectsContext(transaction)
        await cancelSubscriptionImmediately(
          {
            subscription,
            customer,
          },
          effectsCtx
        )
        return effects
      })

      expect(effects.cacheInvalidations).toContain(
        CacheDependency.customerSubscriptions(customer.id)
      )
    })

    it('returns cache invalidation for the correct customer when canceling', async () => {
      const { organization, price } = (await setupOrg()).unwrap()
      const customer1 = (
        await setupCustomer({
          organizationId: organization.id,
        })
      ).unwrap()
      const customer2 = (
        await setupCustomer({
          organizationId: organization.id,
        })
      ).unwrap()
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer1.id,
        priceId: price.id,
        status: SubscriptionStatus.Active,
      })

      const effects = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const { ctx: effectsCtx, effects } =
          createCapturingEffectsContext(transaction)
        await cancelSubscriptionImmediately(
          {
            subscription,
            customer: customer1,
          },
          effectsCtx
        )
        return effects
      })

      expect(effects.cacheInvalidations).toContain(
        CacheDependency.customerSubscriptions(customer1.id)
      )
      expect(effects.cacheInvalidations).not.toContain(
        CacheDependency.customerSubscriptions(customer2.id)
      )
    })
  })

  describe('cancelSubscriptionProcedureTransaction', () => {
    it('returns customerSubscriptions cache invalidation when scheduling cancellation', async () => {
      const { organization, price } = (await setupOrg()).unwrap()
      const customer = (
        await setupCustomer({
          organizationId: organization.id,
        })
      ).unwrap()
      const paymentMethod = (
        await setupPaymentMethod({
          organizationId: organization.id,
          customerId: customer.id,
        })
      ).unwrap()
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        paymentMethodId: paymentMethod.id,
        status: SubscriptionStatus.Active,
      })
      await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: subscription.currentBillingPeriodStart!,
        endDate: subscription.currentBillingPeriodEnd!,
        status: BillingPeriodStatus.Active,
      })

      const effects = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const { callbacks, effects } = createCapturingCallbacks()
        await cancelSubscriptionProcedureTransaction({
          input: {
            id: subscription.id,
            cancellation: {
              timing:
                SubscriptionCancellationArrangement.AtEndOfCurrentBillingPeriod,
            },
          },
          ctx: { apiKey: undefined },
          transactionCtx: withAdminCacheContext({
            transaction,
            livemode: true,
            invalidateCache: callbacks.invalidateCache,
            emitEvent: callbacks.emitEvent,
            enqueueLedgerCommand: callbacks.enqueueLedgerCommand,
          }),
        })
        return effects
      })

      expect(effects.cacheInvalidations).toContain(
        CacheDependency.customerSubscriptions(subscription.customerId)
      )
    })
  })

  describe('uncancelSubscription', () => {
    it('returns customerSubscriptions cache invalidation for the customer', async () => {
      const { organization, price } = (await setupOrg()).unwrap()
      const customer = (
        await setupCustomer({
          organizationId: organization.id,
        })
      ).unwrap()
      const paymentMethod = (
        await setupPaymentMethod({
          organizationId: organization.id,
          customerId: customer.id,
        })
      ).unwrap()
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        paymentMethodId: paymentMethod.id,
        status: SubscriptionStatus.Active,
        cancelScheduledAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      })

      const effects = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const { ctx: effectsCtx, effects } =
          createCapturingEffectsContext(transaction)
        await uncancelSubscription(subscription, effectsCtx)
        return effects
      })

      expect(effects.cacheInvalidations).toContain(
        CacheDependency.customerSubscriptions(customer.id)
      )
    })

    it('returns cache invalidation for the correct customer when uncanceling', async () => {
      const { organization, price } = (await setupOrg()).unwrap()
      const customer1 = (
        await setupCustomer({
          organizationId: organization.id,
        })
      ).unwrap()
      const customer2 = (
        await setupCustomer({
          organizationId: organization.id,
        })
      ).unwrap()
      const paymentMethod = (
        await setupPaymentMethod({
          organizationId: organization.id,
          customerId: customer1.id,
        })
      ).unwrap()
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer1.id,
        priceId: price.id,
        paymentMethodId: paymentMethod.id,
        status: SubscriptionStatus.Active,
        cancelScheduledAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      })

      const effects = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const { ctx: effectsCtx, effects } =
          createCapturingEffectsContext(transaction)
        await uncancelSubscription(subscription, effectsCtx)
        return effects
      })

      expect(effects.cacheInvalidations).toContain(
        CacheDependency.customerSubscriptions(customer1.id)
      )
      expect(effects.cacheInvalidations).not.toContain(
        CacheDependency.customerSubscriptions(customer2.id)
      )
    })
  })
})
