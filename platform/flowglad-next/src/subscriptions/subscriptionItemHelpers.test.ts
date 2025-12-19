import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupBillingPeriod,
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupProduct,
  setupProductFeature,
  setupSubscription,
  setupSubscriptionItem,
  setupSubscriptionItemFeature,
  setupToggleFeature,
  setupUsageCredit,
  setupUsageCreditGrantFeature,
  setupUsageMeter,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { Customer } from '@/db/schema/customers'
import type { Feature } from '@/db/schema/features'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { ProductFeature } from '@/db/schema/productFeatures'
import type { Product } from '@/db/schema/products'
import type { SubscriptionItemFeature } from '@/db/schema/subscriptionItemFeatures'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'
import type { UsageMeter } from '@/db/schema/usageMeters'
import { selectLedgerEntries } from '@/db/tableMethods/ledgerEntryMethods'
import { selectSubscriptionItemFeatures } from '@/db/tableMethods/subscriptionItemFeatureMethods'
import {
  insertSubscriptionItem,
  selectCurrentlyActiveSubscriptionItems,
  selectSubscriptionItems,
} from '@/db/tableMethods/subscriptionItemMethods'
import { selectUsageCredits } from '@/db/tableMethods/usageCreditMethods'
import {
  BillingPeriodStatus,
  CurrencyCode,
  FeatureType,
  FeatureUsageGrantFrequency,
  IntervalUnit,
  LedgerEntryDirection,
  LedgerEntryType,
  PriceType,
  SubscriptionItemType,
  UsageCreditSourceReferenceType,
  UsageCreditStatus,
  UsageCreditType,
} from '@/types'
import {
  handleSubscriptionItemAdjustment,
  isNonManualSubscriptionItem,
  isSubscriptionItemActive,
  isSubscriptionItemActiveAndNonManual,
} from './subscriptionItemHelpers'

describe('subscriptionItemHelpers', () => {
  const now = Date.now()
  const oneDayInMs = 24 * 60 * 60 * 1000
  const pastDate = now - oneDayInMs
  const futureDate = now + oneDayInMs

  describe('isSubscriptionItemActive', () => {
    it('should return true when expiredAt is undefined', () => {
      const item: Pick<SubscriptionItem.Upsert, 'expiredAt'> = {
        expiredAt: undefined,
      }
      expect(isSubscriptionItemActive(item)).toBe(true)
    })

    it('should return true when expiredAt is null', () => {
      const item: Pick<SubscriptionItem.Upsert, 'expiredAt'> = {
        expiredAt: null,
      }
      expect(isSubscriptionItemActive(item)).toBe(true)
    })

    it('should return true when expiredAt is in the future', () => {
      const item: Pick<SubscriptionItem.Upsert, 'expiredAt'> = {
        expiredAt: futureDate,
      }
      expect(isSubscriptionItemActive(item)).toBe(true)
    })

    it('should return false when expiredAt is in the past', () => {
      const item: Pick<SubscriptionItem.Upsert, 'expiredAt'> = {
        expiredAt: pastDate,
      }
      expect(isSubscriptionItemActive(item)).toBe(false)
    })

    it('should return false when expiredAt is exactly now', () => {
      const item: Pick<SubscriptionItem.Upsert, 'expiredAt'> = {
        expiredAt: now,
      }
      expect(isSubscriptionItemActive(item)).toBe(false)
    })
  })

  describe('isNonManualSubscriptionItem', () => {
    it('should return true when manuallyCreated is false and priceId is a string', () => {
      const item: Pick<
        SubscriptionItem.ClientUpsert,
        'manuallyCreated' | 'priceId'
      > = {
        manuallyCreated: false,
        priceId: 'price_123',
      }
      expect(isNonManualSubscriptionItem(item)).toBe(true)
    })

    it('should return true when manuallyCreated is undefined and priceId is a string', () => {
      const item: Pick<
        SubscriptionItem.ClientUpsert,
        'manuallyCreated' | 'priceId'
      > = {
        manuallyCreated: undefined,
        priceId: 'price_123',
      }
      expect(isNonManualSubscriptionItem(item)).toBe(true)
    })

    it('should return false when manuallyCreated is true', () => {
      const item: Pick<
        SubscriptionItem.ClientUpsert,
        'manuallyCreated' | 'priceId'
      > = {
        manuallyCreated: true,
        priceId: 'price_123',
      }
      expect(isNonManualSubscriptionItem(item)).toBe(false)
    })

    it('should return false when priceId is null', () => {
      const item: Pick<
        SubscriptionItem.ClientUpsert,
        'manuallyCreated' | 'priceId'
      > = {
        manuallyCreated: false,
        priceId: null,
      }
      expect(isNonManualSubscriptionItem(item)).toBe(false)
    })

    it('should return false when priceId is undefined', () => {
      const item: Pick<
        SubscriptionItem.ClientUpsert,
        'manuallyCreated' | 'priceId'
      > = {
        manuallyCreated: false,
        priceId: undefined,
      }
      expect(isNonManualSubscriptionItem(item)).toBe(false)
    })

    it('should return false when manuallyCreated is true and priceId is null', () => {
      const item: Pick<
        SubscriptionItem.ClientUpsert,
        'manuallyCreated' | 'priceId'
      > = {
        manuallyCreated: true,
        priceId: null,
      }
      expect(isNonManualSubscriptionItem(item)).toBe(false)
    })

    it('should return false when both manuallyCreated and priceId are undefined', () => {
      const item: Pick<
        SubscriptionItem.ClientUpsert,
        'manuallyCreated' | 'priceId'
      > = {
        manuallyCreated: undefined,
        priceId: undefined,
      }
      expect(isNonManualSubscriptionItem(item)).toBe(false)
    })
  })

  describe('isSubscriptionItemActiveAndNonManual', () => {
    it('should return true when item is active and non-manual', () => {
      const item: Pick<SubscriptionItem.Upsert, 'expiredAt'> &
        Pick<
          SubscriptionItem.ClientUpsert,
          'manuallyCreated' | 'priceId'
        > = {
        expiredAt: undefined,
        manuallyCreated: false,
        priceId: 'price_123',
      }
      expect(isSubscriptionItemActiveAndNonManual(item)).toBe(true)
    })

    it('should return true when expiredAt is in future and item is non-manual', () => {
      const item: Pick<SubscriptionItem.Upsert, 'expiredAt'> &
        Pick<
          SubscriptionItem.ClientUpsert,
          'manuallyCreated' | 'priceId'
        > = {
        expiredAt: futureDate,
        manuallyCreated: false,
        priceId: 'price_123',
      }
      expect(isSubscriptionItemActiveAndNonManual(item)).toBe(true)
    })

    it('should return false when item is expired', () => {
      const item: Pick<SubscriptionItem.Upsert, 'expiredAt'> &
        Pick<
          SubscriptionItem.ClientUpsert,
          'manuallyCreated' | 'priceId'
        > = {
        expiredAt: pastDate,
        manuallyCreated: false,
        priceId: 'price_123',
      }
      expect(isSubscriptionItemActiveAndNonManual(item)).toBe(false)
    })

    it('should return false when item is manually created', () => {
      const item: Pick<SubscriptionItem.Upsert, 'expiredAt'> &
        Pick<
          SubscriptionItem.ClientUpsert,
          'manuallyCreated' | 'priceId'
        > = {
        expiredAt: undefined,
        manuallyCreated: true,
        priceId: 'price_123',
      }
      expect(isSubscriptionItemActiveAndNonManual(item)).toBe(false)
    })

    it('should return false when item has no priceId', () => {
      const item: Pick<SubscriptionItem.Upsert, 'expiredAt'> &
        Pick<
          SubscriptionItem.ClientUpsert,
          'manuallyCreated' | 'priceId'
        > = {
        expiredAt: undefined,
        manuallyCreated: false,
        priceId: null,
      }
      expect(isSubscriptionItemActiveAndNonManual(item)).toBe(false)
    })

    it('should return false when item is both expired and manually created', () => {
      const item: Pick<SubscriptionItem.Upsert, 'expiredAt'> &
        Pick<
          SubscriptionItem.ClientUpsert,
          'manuallyCreated' | 'priceId'
        > = {
        expiredAt: pastDate,
        manuallyCreated: true,
        priceId: 'price_123',
      }
      expect(isSubscriptionItemActiveAndNonManual(item)).toBe(false)
    })

    it('should return false when item is expired and has no priceId', () => {
      const item: Pick<SubscriptionItem.Upsert, 'expiredAt'> &
        Pick<
          SubscriptionItem.ClientUpsert,
          'manuallyCreated' | 'priceId'
        > = {
        expiredAt: pastDate,
        manuallyCreated: false,
        priceId: null,
      }
      expect(isSubscriptionItemActiveAndNonManual(item)).toBe(false)
    })

    it('should return true when manuallyCreated is undefined (defaults to false) and priceId exists', () => {
      const item: Pick<SubscriptionItem.Upsert, 'expiredAt'> &
        Pick<
          SubscriptionItem.ClientUpsert,
          'manuallyCreated' | 'priceId'
        > = {
        expiredAt: undefined,
        manuallyCreated: undefined,
        priceId: 'price_123',
      }
      expect(isSubscriptionItemActiveAndNonManual(item)).toBe(true)
    })
  })

  describe('handleSubscriptionItemAdjustment', () => {
    let orgData: Awaited<ReturnType<typeof setupOrg>>
    let customer: Customer.Record
    let paymentMethod: PaymentMethod.Record
    let product: Product.Record
    let price: Price.Record
    let subscription: Subscription.Record
    let subscriptionItem: SubscriptionItem.Record
    let billingPeriod: BillingPeriod.Record
    let usageMeter: UsageMeter.Record
    let feature: Feature.UsageCreditGrantRecord
    let productFeature: ProductFeature.Record

    // Time constants for billing period
    const billingPeriodLength = 30 * oneDayInMs // 30 days
    const billingPeriodStartDate = now - 15 * oneDayInMs // Started 15 days ago
    const billingPeriodEndDate =
      billingPeriodStartDate + billingPeriodLength // Ends in 15 days
    // Items will be created with this addedDate (in the past) so they're active at adjustment time
    const itemAddedDate = billingPeriodStartDate

    beforeEach(async () => {
      orgData = await setupOrg()
      customer = await setupCustomer({
        organizationId: orgData.organization.id,
        livemode: true,
      })
      paymentMethod = await setupPaymentMethod({
        organizationId: orgData.organization.id,
        customerId: customer.id,
        livemode: true,
      })
      product = await setupProduct({
        organizationId: orgData.organization.id,
        name: 'Test Product',
        livemode: true,
        pricingModelId: orgData.pricingModel.id,
      })
      price = await setupPrice({
        productId: product.id,
        name: 'Test Price',
        type: PriceType.Subscription,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        trialPeriodDays: 0,
        currency: CurrencyCode.USD,
      })
      usageMeter = await setupUsageMeter({
        organizationId: orgData.organization.id,
        name: 'Test Usage Meter',
        livemode: true,
        pricingModelId: orgData.pricingModel.id,
      })
      feature = await setupUsageCreditGrantFeature({
        organizationId: orgData.organization.id,
        name: 'Test Credit Feature',
        usageMeterId: usageMeter.id,
        renewalFrequency:
          FeatureUsageGrantFrequency.EveryBillingPeriod,
        livemode: true,
        amount: 100,
        pricingModelId: orgData.pricingModel.id,
      })
      productFeature = await setupProductFeature({
        organizationId: orgData.organization.id,
        productId: product.id,
        featureId: feature.id,
      })
      subscription = await setupSubscription({
        organizationId: orgData.organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: price.id,
        livemode: true,
        currentBillingPeriodStart: billingPeriodStartDate,
        currentBillingPeriodEnd: billingPeriodEndDate,
        renews: true,
      })
      billingPeriod = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: billingPeriodStartDate,
        endDate: billingPeriodEndDate,
        status: BillingPeriodStatus.Active,
      })
      subscriptionItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Test Subscription Item',
        quantity: 1,
        unitPrice: price.unitPrice,
        priceId: price.id,
        addedDate: itemAddedDate,
      })
    })

    describe('subscription item expiration and persistence', () => {
      it('should expire items that do not match new items (different priceId)', async () => {
        const newPrice = await setupPrice({
          productId: product.id,
          name: 'New Price',
          type: PriceType.Subscription,
          unitPrice: 2000,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          livemode: true,
          isDefault: false,
          trialPeriodDays: 0,
          currency: CurrencyCode.USD,
        })

        await adminTransaction(async ({ transaction }) => {
          const newSubscriptionItems: SubscriptionItem.Insert[] = [
            {
              subscriptionId: subscription.id,
              name: 'New Subscription Item',
              quantity: 1,
              unitPrice: newPrice.unitPrice,
              priceId: newPrice.id,
              livemode: true,
              addedDate: now,
              type: SubscriptionItemType.Static,
            },
          ]

          await handleSubscriptionItemAdjustment({
            subscriptionId: subscription.id,
            newSubscriptionItems,
            adjustmentDate: now,
            transaction,
          })

          // Check that old item was expired
          const allItems = await selectSubscriptionItems(
            { subscriptionId: subscription.id },
            transaction
          )

          const expiredItem = allItems.find(
            (item) => item.id === subscriptionItem.id
          )
          expect(expiredItem).toBeDefined()
          expect(expiredItem!.expiredAt).toBe(now)

          // Check that new item was created
          const activeItems =
            await selectCurrentlyActiveSubscriptionItems(
              { subscriptionId: subscription.id },
              now,
              transaction
            )
          expect(activeItems.length).toBe(1)
          expect(activeItems[0].priceId).toBe(newPrice.id)
        })
      })

      it('should preserve items when client includes their id (explicit keep)', async () => {
        await adminTransaction(async ({ transaction }) => {
          const originalAddedDate = subscriptionItem.addedDate

          // Include the existing item's id to signal "keep this item"
          const newSubscriptionItems: (
            | SubscriptionItem.Insert
            | SubscriptionItem.Record
          )[] = [
            {
              ...subscriptionItem, // Spread existing item to include all fields including id
              name: 'Updated Name', // Can update other fields
            },
          ]

          await handleSubscriptionItemAdjustment({
            subscriptionId: subscription.id,
            newSubscriptionItems,
            adjustmentDate: now,
            transaction,
          })

          // Query the database to verify the actual state
          const activeItems =
            await selectCurrentlyActiveSubscriptionItems(
              { subscriptionId: subscription.id },
              now,
              transaction
            )

          expect(activeItems.length).toBe(1)
          expect(activeItems[0].id).toBe(subscriptionItem.id)
          expect(activeItems[0].addedDate).toBe(originalAddedDate)
          expect(activeItems[0].name).toBe('Updated Name')
          expect(activeItems[0].expiredAt).toBeNull()
        })
      })

      it('should throw when provided ID does not exist in current items', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Provide an ID that doesn't exist in current subscription items
          const fakeId = 'sub_item_fake_id_12345'
          const newSubscriptionItems: (
            | SubscriptionItem.Insert
            | SubscriptionItem.Record
          )[] = [
            {
              id: fakeId, // This ID doesn't exist
              subscriptionId: subscription.id,
              name: 'New Item with Fake ID',
              quantity: 1,
              unitPrice: 2000,
              priceId: price.id,
              livemode: true,
              addedDate: now,
              type: SubscriptionItemType.Static,
            } as SubscriptionItem.Record,
          ]

          await expect(
            handleSubscriptionItemAdjustment({
              subscriptionId: subscription.id,
              newSubscriptionItems,
              adjustmentDate: now,
              transaction,
            })
          ).rejects.toThrow(
            `Cannot update subscription item with id ${fakeId} because it is non-existent`
          )
        })
      })

      it('should preserve manual subscription items during adjustments', async () => {
        // Create a manual subscription item
        const manualItem = await adminTransaction(
          async ({ transaction }) => {
            return insertSubscriptionItem(
              {
                subscriptionId: subscription.id,
                name: 'Manual Item',
                quantity: 0,
                unitPrice: 0,
                priceId: null,
                livemode: true,
                addedDate: now - oneDayInMs,
                manuallyCreated: true,
                type: SubscriptionItemType.Static,
              },
              transaction
            )
          }
        )

        await adminTransaction(async ({ transaction }) => {
          // Adjust with completely different items
          const newPrice = await setupPrice({
            productId: product.id,
            name: 'New Price 2',
            type: PriceType.Subscription,
            unitPrice: 3000,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            livemode: true,
            isDefault: false,
            trialPeriodDays: 0,
            currency: CurrencyCode.USD,
          })

          const newSubscriptionItems: SubscriptionItem.Insert[] = [
            {
              subscriptionId: subscription.id,
              name: 'New Plan Item',
              quantity: 1,
              unitPrice: newPrice.unitPrice,
              priceId: newPrice.id,
              livemode: true,
              addedDate: now,
              type: SubscriptionItemType.Static,
            },
          ]

          await handleSubscriptionItemAdjustment({
            subscriptionId: subscription.id,
            newSubscriptionItems,
            adjustmentDate: now,
            transaction,
          })

          // Check that manual item is still active
          const activeItems =
            await selectCurrentlyActiveSubscriptionItems(
              { subscriptionId: subscription.id },
              now,
              transaction
            )

          const stillActiveManualItem = activeItems.find(
            (item) => item.id === manualItem.id
          )
          expect(stillActiveManualItem).toBeDefined()
          expect(stillActiveManualItem!.manuallyCreated).toBe(true)
          expect(stillActiveManualItem!.expiredAt).toBeNull()
        })
      })

      it('should expire old item and create new when client provides item without id', async () => {
        await adminTransaction(async ({ transaction }) => {
          // New item without id = replace the existing item
          const newSubscriptionItems: SubscriptionItem.Insert[] = [
            {
              subscriptionId: subscription.id,
              name: 'Replacement Item',
              quantity: 5,
              unitPrice: subscriptionItem.unitPrice,
              priceId: subscriptionItem.priceId,
              livemode: true,
              addedDate: now,
              type: SubscriptionItemType.Static,
            },
          ]

          await handleSubscriptionItemAdjustment({
            subscriptionId: subscription.id,
            newSubscriptionItems,
            adjustmentDate: now,
            transaction,
          })

          // Old item should be expired (its id was not in newSubscriptionItems)
          const allItems = await selectSubscriptionItems(
            { subscriptionId: subscription.id },
            transaction
          )

          const expiredItem = allItems.find(
            (item) => item.id === subscriptionItem.id
          )
          expect(expiredItem).toBeDefined()
          expect(expiredItem!.expiredAt).toBe(now)
          expect(expiredItem!.id).toBe(subscriptionItem.id)

          // New item should be created
          const activeItems =
            await selectCurrentlyActiveSubscriptionItems(
              { subscriptionId: subscription.id },
              now,
              transaction
            )
          expect(activeItems.length).toBe(1)
          expect(activeItems[0].quantity).toBe(5)
          // New item should have a different id than the expired one
          expect(activeItems[0].id).not.toBe(subscriptionItem.id)
        })
      })
    })

    describe('feature creation and management', () => {
      it('should create subscription item features for new subscription items', async () => {
        // newPrice is for the same product which already has a feature linked (via productFeature in beforeEach)
        const newPrice = await setupPrice({
          productId: product.id,
          name: 'Price With Feature',
          type: PriceType.Subscription,
          unitPrice: 5000,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          livemode: true,
          isDefault: false,
          trialPeriodDays: 0,
          currency: CurrencyCode.USD,
        })

        await adminTransaction(async ({ transaction }) => {
          const newSubscriptionItems: SubscriptionItem.Insert[] = [
            {
              subscriptionId: subscription.id,
              name: 'Item With Feature',
              quantity: 1,
              unitPrice: newPrice.unitPrice,
              priceId: newPrice.id,
              livemode: true,
              addedDate: now,
              type: SubscriptionItemType.Static,
            },
          ]

          await handleSubscriptionItemAdjustment({
            subscriptionId: subscription.id,
            newSubscriptionItems,
            adjustmentDate: now,
            transaction,
          })

          // Query the database to verify subscription items were created
          const activeItems =
            await selectCurrentlyActiveSubscriptionItems(
              { subscriptionId: subscription.id },
              now,
              transaction
            )
          expect(activeItems.length).toBe(1)

          const createdItem = activeItems[0]
          expect(createdItem.priceId).toBe(newPrice.id)

          // Query the database to verify features were actually created
          const createdFeatures =
            await selectSubscriptionItemFeatures(
              { subscriptionItemId: createdItem.id },
              transaction
            )

          expect(createdFeatures.length).toBeGreaterThan(0)
          expect(createdFeatures[0].featureId).toBe(feature.id)
          expect(createdFeatures[0].type).toBe(
            FeatureType.UsageCreditGrant
          )
          expect(createdFeatures[0].usageMeterId).toBe(usageMeter.id)
        })
      })

      it('should expire manual features that overlap with plan features (plan takes precedence)', async () => {
        // Create a manual subscription item with a feature
        const manualItem = await adminTransaction(
          async ({ transaction }) => {
            return insertSubscriptionItem(
              {
                subscriptionId: subscription.id,
                name: 'Manual Item',
                quantity: 0,
                unitPrice: 0,
                priceId: null,
                livemode: true,
                addedDate: now - oneDayInMs,
                manuallyCreated: true,
                type: SubscriptionItemType.Static,
              },
              transaction
            )
          }
        )

        // Add a manual feature to the manual item (same featureId as the product's feature)
        const manualFeature = await setupSubscriptionItemFeature({
          subscriptionItemId: manualItem.id,
          featureId: feature.id,
          productFeatureId: productFeature.id,
          usageMeterId: usageMeter.id,
          amount: 50,
          manuallyCreated: true,
        })

        // Verify manual feature is active before adjustment
        await adminTransaction(async ({ transaction }) => {
          const preAdjustmentFeatures =
            await selectSubscriptionItemFeatures(
              { subscriptionItemId: manualItem.id, expiredAt: null },
              transaction
            )
          expect(preAdjustmentFeatures.length).toBe(1)
          expect(preAdjustmentFeatures[0].id).toBe(manualFeature.id)
          expect(preAdjustmentFeatures[0].expiredAt).toBeNull()
        })

        await adminTransaction(async ({ transaction }) => {
          // Adjust with a plan that includes the same feature
          const newSubscriptionItems: SubscriptionItem.Insert[] = [
            {
              subscriptionId: subscription.id,
              name: 'Plan Item With Feature',
              quantity: 1,
              unitPrice: price.unitPrice,
              priceId: price.id,
              livemode: true,
              addedDate: now,
              type: SubscriptionItemType.Static,
            },
          ]

          await handleSubscriptionItemAdjustment({
            subscriptionId: subscription.id,
            newSubscriptionItems,
            adjustmentDate: now,
            transaction,
          })

          // Verify plan subscription item was created with correct properties
          const activeItems =
            await selectCurrentlyActiveSubscriptionItems(
              { subscriptionId: subscription.id },
              now,
              transaction
            )
          const planItem = activeItems.find(
            (item) => item.priceId === price.id
          )
          expect(planItem).not.toBeNull()
          expect(planItem!.name).toBe('Plan Item With Feature')
          expect(planItem!.quantity).toBe(1)

          // Verify plan feature was created with matching featureId
          const planFeatures = await selectSubscriptionItemFeatures(
            { subscriptionItemId: planItem!.id, expiredAt: null },
            transaction
          )
          expect(planFeatures.length).toBe(1)
          expect(planFeatures[0].featureId).toBe(feature.id)
          expect(planFeatures[0].type).toBe(
            FeatureType.UsageCreditGrant
          )
          expect(planFeatures[0].usageMeterId).toBe(usageMeter.id)
          expect(planFeatures[0].expiredAt).toBeNull()

          // Verify the manual feature was expired at the adjustment time
          const allManualFeatures =
            await selectSubscriptionItemFeatures(
              { subscriptionItemId: manualItem.id },
              transaction
            )
          const expiredManualFeature = allManualFeatures.find(
            (f) => f.id === manualFeature.id
          )
          expect(expiredManualFeature).not.toBeNull()
          expect(expiredManualFeature!.expiredAt).toBe(now)
          expect(expiredManualFeature!.featureId).toBe(feature.id)

          // Verify there's no active manual feature with this featureId anymore
          const activeManualFeatures =
            await selectSubscriptionItemFeatures(
              { subscriptionItemId: manualItem.id, expiredAt: null },
              transaction
            )
          const stillActiveWithSameFeature =
            activeManualFeatures.find(
              (f) => f.featureId === feature.id
            )
          expect(stillActiveWithSameFeature).toBeUndefined()
        })
      })
    })

    describe('prorated credit grants', () => {
      it('should grant prorated credits for mid-period adjustment (EveryBillingPeriod features)', async () => {
        await adminTransaction(async ({ transaction }) => {
          const midPeriodDate =
            billingPeriodStartDate + 15 * oneDayInMs // Halfway through

          const newSubscriptionItems: SubscriptionItem.Insert[] = [
            {
              subscriptionId: subscription.id,
              name: 'Mid Period Item',
              quantity: 1,
              unitPrice: price.unitPrice,
              priceId: price.id,
              livemode: true,
              addedDate: midPeriodDate,
              type: SubscriptionItemType.Static,
            },
          ]

          const result = await handleSubscriptionItemAdjustment({
            subscriptionId: subscription.id,
            newSubscriptionItems,
            adjustmentDate: midPeriodDate,
            transaction,
          })

          // Verify subscription item was created
          const activeItems =
            await selectCurrentlyActiveSubscriptionItems(
              { subscriptionId: subscription.id },
              midPeriodDate,
              transaction
            )
          expect(activeItems.length).toBe(1)
          expect(activeItems[0].priceId).toBe(price.id)

          // Verify feature was created
          const createdFeatures =
            await selectSubscriptionItemFeatures(
              { subscriptionItemId: activeItems[0].id },
              transaction
            )
          expect(createdFeatures.length).toBe(1)
          expect(createdFeatures[0].featureId).toBe(feature.id)
          expect(createdFeatures[0].type).toBe(
            FeatureType.UsageCreditGrant
          )

          // Verify prorated usage credits were granted
          const credits = await selectUsageCredits(
            {
              subscriptionId: subscription.id,
              billingPeriodId: billingPeriod.id,
              usageMeterId: usageMeter.id,
            },
            transaction
          )

          expect(credits.length).toBe(1)

          // Feature amount is 100, we're halfway through the period
          // So prorated amount should be approximately 50% = 50 credits
          const expectedProratedAmount = Math.round(
            feature.amount * 0.5
          )
          expect(credits[0].issuedAmount).toBe(expectedProratedAmount)

          // Verify credit properties
          expect(credits[0].creditType).toBe(UsageCreditType.Grant)
          expect(credits[0].sourceReferenceType).toBe(
            UsageCreditSourceReferenceType.ManualAdjustment
          )
          expect(credits[0].sourceReferenceId).toBe(
            createdFeatures[0].id
          )
          expect(credits[0].status).toBe(UsageCreditStatus.Posted)
          expect(credits[0].expiresAt).toBe(billingPeriod.endDate)

          // Verify ledger entry was created in database
          const ledgerEntries = await selectLedgerEntries(
            {
              sourceUsageCreditId: credits[0].id,
            },
            transaction
          )
          expect(ledgerEntries.length).toBe(1)
          expect(ledgerEntries[0].amount).toBe(expectedProratedAmount)
          expect(ledgerEntries[0].direction).toBe(
            LedgerEntryDirection.Credit
          )
          expect(ledgerEntries[0].entryType).toBe(
            LedgerEntryType.CreditGrantRecognized
          )
        })
      })

      it('should not grant credits if adjustment is at period start', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Verify pre-condition: we have an active subscription item
          const itemsBefore =
            await selectCurrentlyActiveSubscriptionItems(
              { subscriptionId: subscription.id },
              billingPeriodStartDate,
              transaction
            )
          const nonManualItemsBefore = itemsBefore.filter(
            isNonManualSubscriptionItem
          )
          expect(nonManualItemsBefore.length).toBe(1)

          // Adjustment at the very start of the period
          const periodStartDate = billingPeriodStartDate

          const newSubscriptionItems: SubscriptionItem.Insert[] = [
            {
              subscriptionId: subscription.id,
              name: 'Period Start Item',
              quantity: 2,
              unitPrice: price.unitPrice,
              priceId: price.id,
              livemode: true,
              addedDate: periodStartDate,
              type: SubscriptionItemType.Static,
            },
          ]

          const result = await handleSubscriptionItemAdjustment({
            subscriptionId: subscription.id,
            newSubscriptionItems,
            adjustmentDate: periodStartDate,
            transaction,
          })

          // Verify subscription item was created
          expect(
            result.createdOrUpdatedSubscriptionItems.length
          ).toBe(1)
          expect(
            result.createdOrUpdatedSubscriptionItems[0].name
          ).toBe('Period Start Item')
          expect(
            result.createdOrUpdatedSubscriptionItems[0].quantity
          ).toBe(2)

          // Verify features were created for the new item
          expect(result.createdFeatures.length).toBeGreaterThan(0)
          const usageCreditFeature = result.createdFeatures.find(
            (f) => f.type === FeatureType.UsageCreditGrant
          )
          expect(usageCreditFeature).toBeDefined()

          // Verify original item was expired (no id passed = new item, old expired)
          const itemsAfter =
            await selectCurrentlyActiveSubscriptionItems(
              { subscriptionId: subscription.id },
              periodStartDate + 1, // slightly after to capture the new one
              transaction
            )
          const nonManualItemsAfter = itemsAfter.filter(
            isNonManualSubscriptionItem
          )
          expect(nonManualItemsAfter.length).toBe(1)
          expect(nonManualItemsAfter[0].name).toBe(
            'Period Start Item'
          )

          // KEY ASSERTION: No prorated credits should be granted at period start
          // Credits are granted at billing period transitions instead
          const proratedCredits = await selectUsageCredits(
            {
              subscriptionId: subscription.id,
              billingPeriodId: billingPeriod.id,
              sourceReferenceType:
                UsageCreditSourceReferenceType.ManualAdjustment,
            },
            transaction
          )
          expect(proratedCredits.length).toBe(0)
        })
      })

      it('should not double-grant credits if credits already exist for the feature', async () => {
        // First, create a subscription item feature
        const subscriptionItemFeature =
          await setupSubscriptionItemFeature({
            subscriptionItemId: subscriptionItem.id,
            featureId: feature.id,
            productFeatureId: productFeature.id,
            usageMeterId: usageMeter.id,
            amount: 100,
          })

        // Pre-grant credits for this feature (simulating credits granted at period start)
        const preGrantedCredit = await setupUsageCredit({
          organizationId: orgData.organization.id,
          subscriptionId: subscription.id,
          usageMeterId: usageMeter.id,
          billingPeriodId: billingPeriod.id,
          issuedAmount: 100,
          creditType: UsageCreditType.Grant,
          sourceReferenceId: subscriptionItemFeature.id,
          sourceReferenceType:
            UsageCreditSourceReferenceType.ManualAdjustment,
          status: UsageCreditStatus.Posted,
        })

        await adminTransaction(async ({ transaction }) => {
          const midPeriodDate =
            billingPeriodStartDate + 15 * oneDayInMs

          // Verify pre-condition: exactly 1 credit exists
          const creditsBefore = await selectUsageCredits(
            {
              subscriptionId: subscription.id,
              billingPeriodId: billingPeriod.id,
              usageMeterId: usageMeter.id,
            },
            transaction
          )
          expect(creditsBefore.length).toBe(1)
          expect(creditsBefore[0].id).toBe(preGrantedCredit.id)
          expect(creditsBefore[0].issuedAmount).toBe(100)

          // Keep the same item (include its id to preserve it)
          const newSubscriptionItems: (
            | SubscriptionItem.Insert
            | SubscriptionItem.Record
          )[] = [
            {
              ...subscriptionItem,
              name: 'Same Item - Updated',
            },
          ]

          await handleSubscriptionItemAdjustment({
            subscriptionId: subscription.id,
            newSubscriptionItems,
            adjustmentDate: midPeriodDate,
            transaction,
          })

          // Verify no new credits were created - still exactly 1 credit
          const creditsAfter = await selectUsageCredits(
            {
              subscriptionId: subscription.id,
              billingPeriodId: billingPeriod.id,
              usageMeterId: usageMeter.id,
            },
            transaction
          )
          expect(creditsAfter.length).toBe(1)

          // Should be the same credit we pre-granted (not a new one)
          expect(creditsAfter[0].id).toBe(preGrantedCredit.id)
          expect(creditsAfter[0].issuedAmount).toBe(100)

          // Verify no additional ManualAdjustment credits were created
          const allManualAdjustmentCredits = await selectUsageCredits(
            {
              subscriptionId: subscription.id,
              billingPeriodId: billingPeriod.id,
              sourceReferenceType:
                UsageCreditSourceReferenceType.ManualAdjustment,
            },
            transaction
          )
          expect(allManualAdjustmentCredits.length).toBe(1)
        })
      })

      it('should grant full credits for Once features (no proration)', async () => {
        // Create a "Once" frequency usage credit grant feature
        const onceFeature = await setupUsageCreditGrantFeature({
          organizationId: orgData.organization.id,
          name: 'Once Credit Grant Feature',
          pricingModelId: orgData.pricingModel.id,
          livemode: true,
          amount: 500,
          renewalFrequency: FeatureUsageGrantFrequency.Once,
          usageMeterId: usageMeter.id,
        })

        // Create product feature linking it to the product
        const onceProductFeature = await setupProductFeature({
          organizationId: orgData.organization.id,
          productId: product.id,
          featureId: onceFeature.id,
        })

        await adminTransaction(async ({ transaction }) => {
          const midPeriodDate =
            billingPeriodStartDate + 15 * oneDayInMs // Halfway through

          // Create a new subscription item that will get the Once feature
          const newSubscriptionItems: SubscriptionItem.Insert[] = [
            {
              subscriptionId: subscription.id,
              name: 'Upgrade Item With Once Feature',
              quantity: 1,
              unitPrice: price.unitPrice,
              priceId: price.id,
              livemode: true,
              addedDate: midPeriodDate,
              type: SubscriptionItemType.Static,
            },
          ]

          const result = await handleSubscriptionItemAdjustment({
            subscriptionId: subscription.id,
            newSubscriptionItems,
            adjustmentDate: midPeriodDate,
            transaction,
          })

          // Verify features were created including the Once feature
          expect(result.createdFeatures.length).toBeGreaterThan(0)
          const onceFeatureCreated = result.createdFeatures.find(
            (f) =>
              f.featureId === onceFeature.id &&
              f.renewalFrequency === FeatureUsageGrantFrequency.Once
          )
          expect(onceFeatureCreated).toBeDefined()

          // Check for credits from the Once feature
          const onceCredits = await selectUsageCredits(
            {
              subscriptionId: subscription.id,
              billingPeriodId: billingPeriod.id,
              sourceReferenceId: onceFeatureCreated!.id,
            },
            transaction
          )

          // Once feature should have granted credits
          expect(onceCredits.length).toBe(1)

          // Once features get the FULL amount, no proration
          expect(onceCredits[0].issuedAmount).toBe(500)

          // Once credits should NOT have an expiration tied to the billing period
          expect(onceCredits[0].expiresAt).toBeNull()

          // Verify credit properties
          expect(onceCredits[0].creditType).toBe(
            UsageCreditType.Grant
          )
          expect(onceCredits[0].sourceReferenceType).toBe(
            UsageCreditSourceReferenceType.ManualAdjustment
          )
          expect(onceCredits[0].status).toBe(UsageCreditStatus.Posted)

          // Verify ledger entry was created in database
          const ledgerEntries = await selectLedgerEntries(
            {
              sourceUsageCreditId: onceCredits[0].id,
            },
            transaction
          )
          expect(ledgerEntries.length).toBe(1)
          expect(ledgerEntries[0].amount).toBe(500)
          expect(ledgerEntries[0].direction).toBe(
            LedgerEntryDirection.Credit
          )
          expect(ledgerEntries[0].entryType).toBe(
            LedgerEntryType.CreditGrantRecognized
          )
        })
      })

      it('should not expire Once feature credits when subscription item expires', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Create a Once feature
          const onceFeature = await setupUsageCreditGrantFeature({
            organizationId: orgData.organization.id,
            name: 'Once Feature',
            renewalFrequency: FeatureUsageGrantFrequency.Once,
            amount: 500,
            usageMeterId: usageMeter.id,
            livemode: true,
            pricingModelId: orgData.pricingModel.id,
          })

          const onceProductFeature = await setupProductFeature({
            organizationId: orgData.organization.id,
            productId: product.id,
            featureId: onceFeature.id,
          })

          // Create subscription item with Once feature
          const itemWithOnceFeature = await setupSubscriptionItem({
            subscriptionId: subscription.id,
            name: 'Item with Once Feature',
            quantity: 1,
            unitPrice: 1000,
            priceId: price.id,
            addedDate: itemAddedDate,
          })

          const onceFeatureRecord =
            await setupSubscriptionItemFeature({
              subscriptionItemId: itemWithOnceFeature.id,
              featureId: onceFeature.id,
              productFeatureId: onceProductFeature.id,
              usageMeterId: usageMeter.id,
              amount: 500,
            })

          // Grant credits for the Once feature
          const onceCredit = await setupUsageCredit({
            organizationId: orgData.organization.id,
            subscriptionId: subscription.id,
            usageMeterId: usageMeter.id,
            billingPeriodId: billingPeriod.id,
            issuedAmount: 500,
            creditType: UsageCreditType.Grant,
            sourceReferenceId: onceFeatureRecord.id,
            sourceReferenceType:
              UsageCreditSourceReferenceType.ManualAdjustment,
            status: UsageCreditStatus.Posted,
            expiresAt: null, // Once credits don't expire
          })

          // Now expire the subscription item by adjusting to a new item
          const newSubscriptionItems: SubscriptionItem.Insert[] = [
            {
              subscriptionId: subscription.id,
              name: 'Replacement Item',
              quantity: 1,
              unitPrice: 2000,
              priceId: price.id,
              livemode: true,
              addedDate: now,
              type: SubscriptionItemType.Static,
            },
          ]

          await handleSubscriptionItemAdjustment({
            subscriptionId: subscription.id,
            newSubscriptionItems,
            adjustmentDate: now,
            transaction,
          })

          // Verify the subscription item was expired
          const allItems = await selectSubscriptionItems(
            { subscriptionId: subscription.id },
            transaction
          )
          const expiredItem = allItems.find(
            (item) => item.id === itemWithOnceFeature.id
          )
          expect(expiredItem?.expiredAt).toBe(now)

          // But the Once feature credit should still be valid (not expired)
          const creditsAfter = await selectUsageCredits(
            {
              subscriptionId: subscription.id,
              sourceReferenceId: onceFeatureRecord.id,
            },
            transaction
          )
          expect(creditsAfter.length).toBe(1)
          expect(creditsAfter[0].id).toBe(onceCredit.id)
          expect(creditsAfter[0].expiresAt).toBeNull() // Once credits never expire
          expect(creditsAfter[0].status).toBe(
            UsageCreditStatus.Posted
          )
        })
      })
    })

    describe('edge cases', () => {
      it('should handle empty newSubscriptionItems array', async () => {
        await adminTransaction(async ({ transaction }) => {
          const result = await handleSubscriptionItemAdjustment({
            subscriptionId: subscription.id,
            newSubscriptionItems: [],
            adjustmentDate: now,
            transaction,
          })

          expect(result.createdOrUpdatedSubscriptionItems).toEqual([])
          expect(result.createdFeatures).toEqual([])

          // Original item should be expired since no new items match it
          const allItems = await selectSubscriptionItems(
            { subscriptionId: subscription.id },
            transaction
          )

          const expiredItem = allItems.find(
            (item) => item.id === subscriptionItem.id
          )
          expect(expiredItem).toBeDefined()
          expect(expiredItem!.expiredAt).toBe(now)
        })
      })

      it('should handle subscription with no existing items', async () => {
        // Create a new subscription with no items
        const emptySubscription = await setupSubscription({
          organizationId: orgData.organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          livemode: true,
          currentBillingPeriodStart: billingPeriodStartDate,
          currentBillingPeriodEnd: billingPeriodEndDate,
          renews: true,
        })

        await adminTransaction(async ({ transaction }) => {
          const newSubscriptionItems: SubscriptionItem.Insert[] = [
            {
              subscriptionId: emptySubscription.id,
              name: 'First Item',
              quantity: 1,
              unitPrice: 1000,
              priceId: price.id,
              livemode: true,
              addedDate: now,
              type: SubscriptionItemType.Static,
            },
          ]

          const result = await handleSubscriptionItemAdjustment({
            subscriptionId: emptySubscription.id,
            newSubscriptionItems,
            adjustmentDate: now,
            transaction,
          })

          expect(
            result.createdOrUpdatedSubscriptionItems.length
          ).toBe(1)
          expect(
            result.createdOrUpdatedSubscriptionItems[0].priceId
          ).toBe(price.id)
        })
      })

      it('should handle multiple items being added and removed simultaneously', async () => {
        // Create additional subscription items with addedDate in the past
        const item2 = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          name: 'Item 2',
          quantity: 2,
          unitPrice: 500,
          priceId: price.id,
          addedDate: itemAddedDate,
        })

        const item3 = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          name: 'Item 3',
          quantity: 3,
          unitPrice: 750,
          priceId: price.id,
          addedDate: itemAddedDate,
        })

        await adminTransaction(async ({ transaction }) => {
          // Keep item2 (include its id), remove item1 and item3 (don't include their ids), add new item
          const newSubscriptionItems: (
            | SubscriptionItem.Insert
            | SubscriptionItem.Record
          )[] = [
            {
              ...item2, // Spread existing item to include id (keeps this item)
              name: 'Keep Item 2',
            },
            {
              // No id = create new item
              subscriptionId: subscription.id,
              name: 'New Item 4',
              quantity: 4,
              unitPrice: 1500,
              priceId: price.id,
              livemode: true,
              addedDate: now,
              type: SubscriptionItemType.Static,
            },
          ]

          await handleSubscriptionItemAdjustment({
            subscriptionId: subscription.id,
            newSubscriptionItems,
            adjustmentDate: now,
            transaction,
          })

          const activeItems =
            await selectCurrentlyActiveSubscriptionItems(
              { subscriptionId: subscription.id },
              now,
              transaction
            )

          // Should have 2 active items
          expect(activeItems.length).toBe(2)

          // item2 should be preserved (same id)
          const preservedItem = activeItems.find(
            (item) => item.id === item2.id
          )
          expect(preservedItem).toBeDefined()

          // item1 and item3 should be expired (their ids were not in newSubscriptionItems)
          const allItems = await selectSubscriptionItems(
            { subscriptionId: subscription.id },
            transaction
          )

          const expiredItem1 = allItems.find(
            (item) => item.id === subscriptionItem.id
          )
          const expiredItem3 = allItems.find(
            (item) => item.id === item3.id
          )

          expect(expiredItem1?.expiredAt).toBe(now)
          expect(expiredItem3?.expiredAt).toBe(now)
        })
      })

      it('should create separate items for duplicate new items without IDs', async () => {
        await adminTransaction(async ({ transaction }) => {
          const newPrice = await setupPrice({
            productId: product.id,
            name: 'Test Price',
            type: PriceType.Subscription,
            unitPrice: 1000,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            livemode: true,
            isDefault: false,
            trialPeriodDays: 0,
            currency: CurrencyCode.USD,
          })

          // Two identical items without IDs (quantity 1 each)
          const twoIdenticalItems: SubscriptionItem.Insert[] = [
            {
              subscriptionId: subscription.id,
              name: 'Item A',
              quantity: 1,
              unitPrice: newPrice.unitPrice,
              priceId: newPrice.id,
              livemode: true,
              addedDate: now,
              type: SubscriptionItemType.Static,
            },
            {
              subscriptionId: subscription.id,
              name: 'Item A', // Same name, same price
              quantity: 1,
              unitPrice: newPrice.unitPrice,
              priceId: newPrice.id,
              livemode: true,
              addedDate: now,
              type: SubscriptionItemType.Static,
            },
          ]

          const result = await handleSubscriptionItemAdjustment({
            subscriptionId: subscription.id,
            newSubscriptionItems: twoIdenticalItems,
            adjustmentDate: now,
            transaction,
          })

          // Should create 2 separate subscription item records
          expect(
            result.createdOrUpdatedSubscriptionItems.length
          ).toBe(2)
          expect(
            result.createdOrUpdatedSubscriptionItems[0].id
          ).not.toBe(result.createdOrUpdatedSubscriptionItems[1].id)

          // Should create 2 feature records (one per item)
          expect(result.createdFeatures.length).toBe(2)

          // Should grant credits for both items
          const credits = await selectUsageCredits(
            {
              subscriptionId: subscription.id,
              billingPeriodId: billingPeriod.id,
              sourceReferenceType:
                UsageCreditSourceReferenceType.ManualAdjustment,
            },
            transaction
          )

          // Total credits should be 2x the feature amount (one per item, each with quantity 1)
          const totalCredits = credits.reduce(
            (sum, credit) => sum + credit.issuedAmount,
            0
          )
          expect(totalCredits).toBe(100) // 50 per item × 2 items (prorated)
        })
      })

      it('should account for quantity when creating subscription items', async () => {
        await adminTransaction(async ({ transaction }) => {
          const newPrice = await setupPrice({
            productId: product.id,
            name: 'Test Price',
            type: PriceType.Subscription,
            unitPrice: 1000,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            livemode: true,
            isDefault: false,
            trialPeriodDays: 0,
            currency: CurrencyCode.USD,
          })

          const oneItemQuantityTwo: SubscriptionItem.Insert[] = [
            {
              subscriptionId: subscription.id,
              name: 'Item B',
              quantity: 2, // Quantity 2 instead of 2 separate items
              unitPrice: newPrice.unitPrice,
              priceId: newPrice.id,
              livemode: true,
              addedDate: now,
              type: SubscriptionItemType.Static,
            },
          ]

          const result = await handleSubscriptionItemAdjustment({
            subscriptionId: subscription.id,
            newSubscriptionItems: oneItemQuantityTwo,
            adjustmentDate: now,
            transaction,
          })

          // Should create 1 subscription item record with quantity 2
          expect(
            result.createdOrUpdatedSubscriptionItems.length
          ).toBe(1)
          expect(
            result.createdOrUpdatedSubscriptionItems[0].quantity
          ).toBe(2)

          // Should create 1 feature record with amount × quantity
          expect(result.createdFeatures.length).toBe(1)
          expect(result.createdFeatures[0].amount).toBe(200) // 100 × quantity 2

          // Should grant credits accounting for quantity
          const credits = await selectUsageCredits(
            {
              subscriptionId: subscription.id,
              billingPeriodId: billingPeriod.id,
              sourceReferenceType:
                UsageCreditSourceReferenceType.ManualAdjustment,
            },
            transaction
          )

          // Total credits should be 2x the feature amount (prorated)
          const totalCredits = credits.reduce(
            (sum, credit) => sum + credit.issuedAmount,
            0
          )
          expect(totalCredits).toBe(100) // 200 × 0.5 (prorated) = 100

          // Verify the structure: one credit record with prorated amount
          const creditsFromAdjustment = credits.filter(
            (credit) =>
              credit.sourceReferenceType ===
              UsageCreditSourceReferenceType.ManualAdjustment
          )
          expect(creditsFromAdjustment.length).toBe(1)
        })
      })
    })
  })
})
