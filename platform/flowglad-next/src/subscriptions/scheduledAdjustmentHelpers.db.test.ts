import { beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import {
  IntervalUnit,
  PriceType,
  SubscriptionStatus,
} from '@db-core/enums'
import { Result } from 'better-result'
import {
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupProduct,
  setupSubscription,
  setupSubscriptionItem,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Customer } from '@db-core/schema/customers'
import type { Organization } from '@db-core/schema/organizations'
import type { PaymentMethod } from '@db-core/schema/paymentMethods'
import type { Price } from '@db-core/schema/prices'
import type { Product } from '@db-core/schema/products'
import type { SubscriptionItem } from '@db-core/schema/subscriptionItems'
import type { Subscription } from '@db-core/schema/subscriptions'
import { selectSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods'
import {
  selectSubscriptionById,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'
import { NotFoundError, ValidationError } from '@/errors'
import {
  cancelScheduledAdjustment,
  hasScheduledAdjustment,
} from '@/subscriptions/scheduledAdjustmentHelpers'
import { createDiscardingEffectsContext } from '@/test-utils/transactionCallbacks'

describe('scheduledAdjustmentHelpers', () => {
  let organization: Organization.Record
  let basePrice: Price.ProductPrice
  let baseProduct: Product.Record
  let pricingModel: { id: string }
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let subscription: Subscription.Record
  let downgradePrice: Price.ProductPrice
  let downgradeProduct: Product.Record
  let existingSubscriptionItem: SubscriptionItem.Record

  beforeAll(async () => {
    const orgSetup = await setupOrg()
    organization = orgSetup.organization
    basePrice = orgSetup.price
    baseProduct = orgSetup.product
    pricingModel = orgSetup.pricingModel
  })

  beforeEach(async () => {
    customer = await setupCustomer({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
    })
    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: basePrice.id,
      paymentMethodId: paymentMethod.id,
      status: SubscriptionStatus.Active,
    })

    existingSubscriptionItem = await setupSubscriptionItem({
      subscriptionId: subscription.id,
      name: 'Existing Item',
      quantity: 1,
      unitPrice: basePrice.unitPrice,
      priceId: basePrice.id,
    })

    downgradeProduct = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Downgrade Plan',
    })

    downgradePrice = (await setupPrice({
      productId: downgradeProduct.id,
      name: 'Downgrade Price',
      type: PriceType.Subscription,
      unitPrice: 500,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
    })) as Price.ProductPrice
  })

  describe('hasScheduledAdjustment', () => {
    it('returns false when subscription.scheduledAdjustmentAt is null', async () => {
      await adminTransaction(async ({ transaction }) => {
        const sub = (
          await selectSubscriptionById(subscription.id, transaction)
        ).unwrap()

        expect(sub.scheduledAdjustmentAt).toBeNull()
        expect(hasScheduledAdjustment(sub)).toBe(false)
      })
    })

    it('returns true when subscription.scheduledAdjustmentAt is set to a future timestamp', async () => {
      const futureTimestamp = Date.now() + 86400000
      await adminTransaction(async ({ transaction }) => {
        const updated = await updateSubscription(
          {
            id: subscription.id,
            scheduledAdjustmentAt: futureTimestamp,
            renews: subscription.renews,
          },
          transaction
        )

        expect(updated.scheduledAdjustmentAt).toBe(futureTimestamp)
        expect(hasScheduledAdjustment(updated)).toBe(true)
      })
    })
  })

  describe('cancelScheduledAdjustment', () => {
    it('returns NotFoundError when subscription does not exist', async () => {
      await adminTransaction(async ({ transaction }) => {
        const result = await cancelScheduledAdjustment(
          'non-existent-id',
          createDiscardingEffectsContext(transaction)
        )

        expect(Result.isError(result)).toBe(true)
        if (Result.isError(result)) {
          expect(result.error).toBeInstanceOf(NotFoundError)
        }
      })
    })

    it('returns ValidationError when subscription has no scheduled adjustment', async () => {
      await adminTransaction(async ({ transaction }) => {
        const result = await cancelScheduledAdjustment(
          subscription.id,
          createDiscardingEffectsContext(transaction)
        )

        expect(Result.isError(result)).toBe(true)
        if (Result.isError(result)) {
          expect(result.error).toBeInstanceOf(ValidationError)
          expect(result.error.message).toContain(
            'does not have a scheduled adjustment'
          )
        }
      })
    })

    it('clears scheduledAdjustmentAt and returns canceledItemCount of 0 when no future-dated items exist', async () => {
      const scheduledAt = Date.now() + 86400000

      await adminTransaction(async ({ transaction }) => {
        await updateSubscription(
          {
            id: subscription.id,
            scheduledAdjustmentAt: scheduledAt,
            renews: subscription.renews,
          },
          transaction
        )

        const result = await cancelScheduledAdjustment(
          subscription.id,
          createDiscardingEffectsContext(transaction)
        )

        expect(Result.isOk(result)).toBe(true)
        if (Result.isOk(result)) {
          expect(
            result.value.subscription.scheduledAdjustmentAt
          ).toBeNull()
          expect(result.value.canceledItemCount).toBe(0)
        }
      })
    })

    it('expires future-dated subscription items and clears scheduledAdjustmentAt when scheduled items exist', async () => {
      const now = Date.now()
      const futureAddedDate = now + 86400000

      await adminTransaction(async ({ transaction }) => {
        await updateSubscription(
          {
            id: subscription.id,
            scheduledAdjustmentAt: futureAddedDate,
            renews: subscription.renews,
          },
          transaction
        )

        await setupSubscriptionItem({
          subscriptionId: subscription.id,
          name: 'Future Item 1',
          quantity: 1,
          unitPrice: downgradePrice.unitPrice,
          priceId: downgradePrice.id,
          addedDate: futureAddedDate,
        })

        await setupSubscriptionItem({
          subscriptionId: subscription.id,
          name: 'Future Item 2',
          quantity: 2,
          unitPrice: downgradePrice.unitPrice,
          priceId: downgradePrice.id,
          addedDate: futureAddedDate,
        })

        const result = await cancelScheduledAdjustment(
          subscription.id,
          createDiscardingEffectsContext(transaction)
        )

        expect(Result.isOk(result)).toBe(true)
        if (Result.isOk(result)) {
          expect(
            result.value.subscription.scheduledAdjustmentAt
          ).toBeNull()
          expect(result.value.canceledItemCount).toBe(2)
        }

        const allItems = await selectSubscriptionItems(
          { subscriptionId: subscription.id },
          transaction
        )
        const activeItems = allItems.filter(
          (item) => !item.expiredAt || item.expiredAt > Date.now()
        )
        const expiredFutureItems = allItems.filter(
          (item) =>
            item.name &&
            item.name.startsWith('Future Item') &&
            item.expiredAt !== null &&
            item.expiredAt <= Date.now()
        )

        expect(activeItems.length).toBe(1)
        expect(activeItems[0].name).toBe('Existing Item')
        expect(expiredFutureItems.length).toBe(2)
      })
    })

    it('does not expire currently active items even when they have addedDate in the past', async () => {
      const now = Date.now()
      const futureAddedDate = now + 86400000
      const pastAddedDate = now - 86400000

      await adminTransaction(async ({ transaction }) => {
        await updateSubscription(
          {
            id: subscription.id,
            scheduledAdjustmentAt: futureAddedDate,
            renews: subscription.renews,
          },
          transaction
        )

        await setupSubscriptionItem({
          subscriptionId: subscription.id,
          name: 'Past Added Item',
          quantity: 1,
          unitPrice: basePrice.unitPrice,
          priceId: basePrice.id,
          addedDate: pastAddedDate,
        })

        await setupSubscriptionItem({
          subscriptionId: subscription.id,
          name: 'Future Item',
          quantity: 1,
          unitPrice: downgradePrice.unitPrice,
          priceId: downgradePrice.id,
          addedDate: futureAddedDate,
        })

        const result = await cancelScheduledAdjustment(
          subscription.id,
          createDiscardingEffectsContext(transaction)
        )

        expect(Result.isOk(result)).toBe(true)
        if (Result.isOk(result)) {
          expect(result.value.canceledItemCount).toBe(1)
        }

        const allItems = await selectSubscriptionItems(
          { subscriptionId: subscription.id },
          transaction
        )
        const activeItems = allItems.filter(
          (item) => !item.expiredAt || item.expiredAt > Date.now()
        )

        expect(activeItems.length).toBe(2)
        expect(
          activeItems.some((item) => item.name === 'Existing Item')
        ).toBe(true)
        expect(
          activeItems.some((item) => item.name === 'Past Added Item')
        ).toBe(true)
      })
    })
  })
})
