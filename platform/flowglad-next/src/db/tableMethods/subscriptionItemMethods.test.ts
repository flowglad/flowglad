import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  setupCreditLedgerEntry,
  setupCustomer,
  setupDebitLedgerEntry,
  setupLedgerAccount,
  setupLedgerTransaction,
  setupOrg,
  setupPaymentMethod,
  setupSubscription,
  setupSubscriptionItem,
  setupTestFeaturesAndProductFeatures,
  setupUsageEvent,
  setupUsageLedgerScenario,
  setupUsageMeter,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Customer } from '@/db/schema/customers'
import { ledgerAccounts } from '@/db/schema/ledgerAccounts'
import { ledgerEntries } from '@/db/schema/ledgerEntries'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import {
  type SubscriptionItemFeature,
  subscriptionItemFeatures,
} from '@/db/schema/subscriptionItemFeatures'
import {
  type SubscriptionItem,
  subscriptionItems,
} from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'
import { subscriptionItemFeatureInsertFromSubscriptionItemAndFeature } from '@/subscriptions/subscriptionItemFeatureHelpers'
import {
  FeatureType,
  LedgerEntryType,
  LedgerTransactionType,
  SubscriptionItemType,
  SubscriptionStatus,
} from '@/types'
import { core } from '@/utils/core'
import { insertSubscriptionItemFeature } from './subscriptionItemFeatureMethods'
import {
  bulkCreateOrUpdateSubscriptionItems,
  bulkInsertOrDoNothingSubscriptionItemsByExternalId,
  bulkInsertSubscriptionItems,
  expireSubscriptionItems,
  insertSubscriptionItem,
  selectCurrentlyActiveSubscriptionItems,
  selectRichSubscriptionsAndActiveItems,
  selectSubscriptionAndItems,
  selectSubscriptionItemById,
  selectSubscriptionItems,
  selectSubscriptionItemsAndSubscriptionBySubscriptionId,
  selectSubscriptionItemsWithPricesBySubscriptionIds,
  updateSubscriptionItem,
} from './subscriptionItemMethods'
import { updateSubscription } from './subscriptionMethods'

describe('subscriptionItemMethods', async () => {
  let organization: Organization.Record
  let price: Price.Record
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let subscription: Subscription.Record
  let subscriptionItem: SubscriptionItem.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    price = orgData.price

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
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
    })

    subscriptionItem = await setupSubscriptionItem({
      subscriptionId: subscription.id,
      name: 'Test Subscription Item',
      quantity: 1,
      unitPrice: 1000,
      priceId: price.id,
    })
  })

  describe('selectSubscriptionItemById', () => {
    it('should return a subscription item when a valid ID is provided and the item exists', async () => {
      await adminTransaction(async ({ transaction }) => {
        const result = await selectSubscriptionItemById(
          subscriptionItem.id,
          transaction
        )
        expect(result).toMatchObject({ id: subscriptionItem.id })
        expect(result?.id).toBe(subscriptionItem.id)
      })
    })

    it('should throw when the ID does not exist', async () => {
      const nonExistentId = core.nanoid()
      await adminTransaction(async ({ transaction }) => {
        await expect(
          selectSubscriptionItemById(nonExistentId, transaction)
        ).rejects.toThrow(
          `No subscription items found with id: ${nonExistentId}`
        )
      })
    })
  })

  describe('insertSubscriptionItem', () => {
    it('should insert a new subscription item and return it', async () => {
      const newItemData: SubscriptionItem.Insert = {
        subscriptionId: subscription.id,
        name: 'New Test Item',
        quantity: 2,
        unitPrice: 2000,
        priceId: price.id,
        livemode: true,
        addedDate: Date.now(),
        expiredAt: null,
        externalId: core.nanoid(),
        metadata: {},
        type: SubscriptionItemType.Static,
      }
      await adminTransaction(async ({ transaction }) => {
        const result = await insertSubscriptionItem(
          newItemData,
          transaction
        )
        expect(result).toMatchObject({})
        expect(result.name).toBe(newItemData.name)
        expect(result.quantity).toBe(newItemData.quantity)

        const retrieved = await selectSubscriptionItemById(
          result.id,
          transaction
        )
        expect(retrieved).toEqual(result)
      })
    })

    it('should throw an error if required fields are missing (delegated to schema validation)', async () => {
      const invalidItemData = {
        subscriptionId: subscription.id,
        name: 'Invalid Item',
        // quantity is missing
        unitPrice: 100,
        priceId: price.id,
      }
      await adminTransaction(async ({ transaction }) => {
        await expect(
          // @ts-expect-error testing invalid data for zod
          insertSubscriptionItem(invalidItemData, transaction)
        ).rejects.toThrow()
      })
    })
  })

  describe('updateSubscriptionItem', () => {
    it('should update an existing subscription item and return the updated item', async () => {
      const updates: Partial<SubscriptionItem.Insert> = {
        name: 'Updated Item Name',
        quantity: 5,
      }
      await adminTransaction(async ({ transaction }) => {
        const result = await updateSubscriptionItem(
          {
            id: subscriptionItem.id,
            ...updates,
            type: SubscriptionItemType.Static,
          },
          transaction
        )
        expect(result).toMatchObject({ name: updates.name })
        expect(result?.name).toBe(updates.name)
        expect(result?.quantity).toBe(updates.quantity)

        const retrieved = await selectSubscriptionItemById(
          subscriptionItem.id,
          transaction
        )
        expect(retrieved?.name).toBe(updates.name)
      })
    })

    it('should return null if the subscription item to update does not exist', async () => {
      await adminTransaction(async ({ transaction }) => {
        await expect(
          updateSubscriptionItem(
            {
              id: core.nanoid(),
              name: 'Non Existent',
              type: SubscriptionItemType.Static,
            },
            transaction
          )
        ).rejects.toThrow()
      })
    })
  })

  describe('selectSubscriptionItems', () => {
    it('should return an array of subscription items matching the where conditions', async () => {
      await adminTransaction(async ({ transaction }) => {
        const results = await selectSubscriptionItems(
          { subscriptionId: subscription.id },
          transaction
        )
        expect(results.length).toBeGreaterThan(0)
        expect(
          results.every(
            (item) => item.subscriptionId === subscription.id
          )
        ).toBe(true)
      })
    })

    it('should return an empty array if no subscription items match the where conditions', async () => {
      await adminTransaction(async ({ transaction }) => {
        const results = await selectSubscriptionItems(
          { subscriptionId: core.nanoid() },
          transaction
        )
        expect(results).toEqual([])
      })
    })
  })

  describe('bulkInsertSubscriptionItems', () => {
    it('should insert multiple subscription items and return them', async () => {
      const itemsToInsert: SubscriptionItem.Insert[] = [
        {
          subscriptionId: subscription.id,
          name: 'Bulk Item 1',
          quantity: 1,
          unitPrice: 100,
          priceId: price.id,
          livemode: true,
          addedDate: Date.now(),
          expiredAt: null,
          externalId: core.nanoid(),
          metadata: {},
          type: SubscriptionItemType.Static,
        },
        {
          subscriptionId: subscription.id,
          name: 'Bulk Item 2',
          quantity: 2,
          unitPrice: 200,
          priceId: price.id,
          livemode: true,
          addedDate: Date.now(),
          expiredAt: null,
          externalId: core.nanoid(),
          metadata: {},
          type: SubscriptionItemType.Static,
        },
      ]
      await adminTransaction(async ({ transaction }) => {
        const results = await bulkInsertSubscriptionItems(
          itemsToInsert,
          transaction
        )
        expect(results.length).toBe(itemsToInsert.length)
        for (const insertedItem of results) {
          const original = itemsToInsert.find(
            (p) => p.externalId === insertedItem.externalId
          )
          expect(typeof original).toBe('object')
          expect(insertedItem.name).toBe(original?.name)
        }
      })
    })
  })

  describe('selectSubscriptionAndItems', () => {
    it('should return the subscription and its associated items when a valid where clause for subscriptions is provided', async () => {
      await adminTransaction(async ({ transaction }) => {
        const result = await selectSubscriptionAndItems(
          { id: subscription.id },
          transaction
        )
        expect(result).toMatchObject({})
        expect(result?.subscription.id).toBe(subscription.id)
        expect(result?.subscriptionItems.length).toBeGreaterThan(0)
        expect(
          result?.subscriptionItems.every(
            (item) => item.subscriptionId === subscription.id
          )
        ).toBe(true)
      })
    })

    it('should return null if no subscription matches the where clause', async () => {
      await adminTransaction(async ({ transaction }) => {
        const result = await selectSubscriptionAndItems(
          { id: core.nanoid() },
          transaction
        )
        expect(result).toBeNull()
      })
    })
  })

  describe('selectSubscriptionItemsAndSubscriptionBySubscriptionId', () => {
    it('should return the subscription and its items when a valid subscriptionId is provided', async () => {
      await adminTransaction(async ({ transaction }) => {
        const result =
          await selectSubscriptionItemsAndSubscriptionBySubscriptionId(
            subscription.id,
            transaction
          )
        expect(result).toMatchObject({})
        expect(result?.subscription.id).toBe(subscription.id)
        expect(result?.subscriptionItems.length).toBeGreaterThan(0)
      })
    })

    it('should return null if the subscriptionId does not exist', async () => {
      await adminTransaction(async ({ transaction }) => {
        const result =
          await selectSubscriptionItemsAndSubscriptionBySubscriptionId(
            core.nanoid(),
            transaction
          )
        expect(result).toBeNull()
      })
    })
  })

  describe('bulkCreateOrUpdateSubscriptionItems', () => {
    it('should insert new items and update existing ones based on their IDs', async () => {
      const newItemExternalId = core.nanoid()
      const itemsToUpsert: SubscriptionItem.Upsert[] = [
        {
          // Existing item to update
          id: subscriptionItem.id,
          subscriptionId: subscription.id,
          name: 'Updated Existing Item via Bulk',
          quantity: 10,
          unitPrice: subscriptionItem.unitPrice,
          priceId: subscriptionItem.priceId,
          livemode: subscriptionItem.livemode,
          addedDate: subscriptionItem.addedDate,
          expiredAt: subscriptionItem.expiredAt,
          externalId: subscriptionItem.externalId,
          metadata: subscriptionItem.metadata,
          type: SubscriptionItemType.Static,
        }, // Cast to any to bypass strict Insert type checking for id
        {
          // New item to insert
          subscriptionId: subscription.id,
          name: 'New Item via Bulk',
          quantity: 1,
          unitPrice: 500,
          priceId: price.id,
          livemode: true,
          addedDate: Date.now(),
          expiredAt: null,
          externalId: newItemExternalId,
          metadata: {},
          type: SubscriptionItemType.Static,
        },
      ]
      await adminTransaction(async ({ transaction }) => {
        const results = await bulkCreateOrUpdateSubscriptionItems(
          itemsToUpsert,
          transaction
        )
        expect(results.length).toBe(itemsToUpsert.length)
        const updatedItem = results.find(
          (r) => r.id === subscriptionItem.id
        )
        expect(updatedItem).toMatchObject({ quantity: 10 })
        expect(updatedItem?.name).toBe(
          'Updated Existing Item via Bulk'
        )
        expect(updatedItem?.quantity).toBe(10)

        const newItem = results.find(
          (r) => r.externalId === newItemExternalId
        )
        expect(newItem).toMatchObject({ name: 'New Item via Bulk' })
        expect(newItem?.name).toBe('New Item via Bulk')

        const count = await transaction
          .select()
          .from(subscriptionItems)
          .where(
            eq(subscriptionItems.subscriptionId, subscription.id)
          )
        expect(count.length).toBe(2) // Initial + 1 new
      })
    })
  })

  describe('expireSubscriptionItems', () => {
    it('should update the expiredAt field of the specified subscription item and its features', async () => {
      const expiryDate = new Date()
      let feature: SubscriptionItemFeature.Record | undefined
      const featureSetup = await setupTestFeaturesAndProductFeatures({
        organizationId: organization.id,
        productId: price.productId,
        livemode: true,
        featureSpecs: [
          {
            name: 'Test Feature',
            type: FeatureType.Toggle,
          },
        ],
      })
      await adminTransaction(async ({ transaction }) => {
        feature = await insertSubscriptionItemFeature(
          subscriptionItemFeatureInsertFromSubscriptionItemAndFeature(
            {
              subscriptionItem,
              feature: featureSetup[0].feature,
              productFeature: featureSetup[0].productFeature,
            }
          ),
          transaction
        )

        await expireSubscriptionItems(
          [subscriptionItem.id],
          expiryDate,
          transaction
        )
        const updatedItem = await selectSubscriptionItemById(
          subscriptionItem.id,
          transaction
        )
        expect(updatedItem?.expiredAt).toEqual(expiryDate.getTime())

        const [updatedFeature] = await transaction
          .select()
          .from(subscriptionItemFeatures)
          .where(eq(subscriptionItemFeatures.id, feature!.id))
        expect(updatedFeature?.expiredAt).toEqual(
          expiryDate.getTime()
        )
      })
    })

    it('should expire multiple subscription items and all their features', async () => {
      const expiryDate = new Date()

      // Setup features
      const featureSetup = await setupTestFeaturesAndProductFeatures({
        organizationId: organization.id,
        productId: price.productId,
        livemode: true,
        featureSpecs: [
          {
            name: 'Feature 1',
            type: FeatureType.Toggle,
          },
          {
            name: 'Feature 2',
            type: FeatureType.Toggle,
          },
          {
            name: 'Feature 3',
            type: FeatureType.Toggle,
          },
        ],
      })

      await adminTransaction(async ({ transaction }) => {
        // Create additional subscription items
        const item2 = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          name: 'Item 2',
          quantity: 1,
          unitPrice: 200,
          priceId: price.id,
        })

        const item3 = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          name: 'Item 3',
          quantity: 1,
          unitPrice: 300,
          priceId: price.id,
        })

        // Add features to item 1 (subscriptionItem)
        const item1Feature1 = await insertSubscriptionItemFeature(
          subscriptionItemFeatureInsertFromSubscriptionItemAndFeature(
            {
              subscriptionItem,
              feature: featureSetup[0].feature,
              productFeature: featureSetup[0].productFeature,
            }
          ),
          transaction
        )

        const item1Feature2 = await insertSubscriptionItemFeature(
          subscriptionItemFeatureInsertFromSubscriptionItemAndFeature(
            {
              subscriptionItem,
              feature: featureSetup[1].feature,
              productFeature: featureSetup[1].productFeature,
            }
          ),
          transaction
        )

        // Add features to item 2
        const item2Feature1 = await insertSubscriptionItemFeature(
          subscriptionItemFeatureInsertFromSubscriptionItemAndFeature(
            {
              subscriptionItem: item2,
              feature: featureSetup[0].feature,
              productFeature: featureSetup[0].productFeature,
            }
          ),
          transaction
        )

        const item2Feature2 = await insertSubscriptionItemFeature(
          subscriptionItemFeatureInsertFromSubscriptionItemAndFeature(
            {
              subscriptionItem: item2,
              feature: featureSetup[2].feature,
              productFeature: featureSetup[2].productFeature,
            }
          ),
          transaction
        )

        // Add feature to item 3
        const item3Feature1 = await insertSubscriptionItemFeature(
          subscriptionItemFeatureInsertFromSubscriptionItemAndFeature(
            {
              subscriptionItem: item3,
              feature: featureSetup[1].feature,
              productFeature: featureSetup[1].productFeature,
            }
          ),
          transaction
        )

        // Expire all items at once
        await expireSubscriptionItems(
          [subscriptionItem.id, item2.id, item3.id],
          expiryDate,
          transaction
        )

        // Verify all items are expired
        const updatedItem1 = await selectSubscriptionItemById(
          subscriptionItem.id,
          transaction
        )
        expect(updatedItem1?.expiredAt).toEqual(expiryDate.getTime())

        const updatedItem2 = await selectSubscriptionItemById(
          item2.id,
          transaction
        )
        expect(updatedItem2?.expiredAt).toEqual(expiryDate.getTime())

        const updatedItem3 = await selectSubscriptionItemById(
          item3.id,
          transaction
        )
        expect(updatedItem3?.expiredAt).toEqual(expiryDate.getTime())

        // Verify all features are expired
        const [updatedItem1Feature1] = await transaction
          .select()
          .from(subscriptionItemFeatures)
          .where(eq(subscriptionItemFeatures.id, item1Feature1.id))
        expect(updatedItem1Feature1?.expiredAt).toEqual(
          expiryDate.getTime()
        )

        const [updatedItem1Feature2] = await transaction
          .select()
          .from(subscriptionItemFeatures)
          .where(eq(subscriptionItemFeatures.id, item1Feature2.id))
        expect(updatedItem1Feature2?.expiredAt).toEqual(
          expiryDate.getTime()
        )

        const [updatedItem2Feature1] = await transaction
          .select()
          .from(subscriptionItemFeatures)
          .where(eq(subscriptionItemFeatures.id, item2Feature1.id))
        expect(updatedItem2Feature1?.expiredAt).toEqual(
          expiryDate.getTime()
        )

        const [updatedItem2Feature2] = await transaction
          .select()
          .from(subscriptionItemFeatures)
          .where(eq(subscriptionItemFeatures.id, item2Feature2.id))
        expect(updatedItem2Feature2?.expiredAt).toEqual(
          expiryDate.getTime()
        )

        const [updatedItem3Feature1] = await transaction
          .select()
          .from(subscriptionItemFeatures)
          .where(eq(subscriptionItemFeatures.id, item3Feature1.id))
        expect(updatedItem3Feature1?.expiredAt).toEqual(
          expiryDate.getTime()
        )
      })
    })
  })

  describe('selectSubscriptionItemsWithPricesBySubscriptionIds', () => {
    it('should return an empty array when given an empty array of subscription IDs', async () => {
      await adminTransaction(async ({ transaction }) => {
        const results =
          await selectSubscriptionItemsWithPricesBySubscriptionIds(
            [],
            transaction
          )
        expect(results).toEqual([])
      })
    })

    it('should return subscription items with their associated prices for valid subscription IDs', async () => {
      await adminTransaction(async ({ transaction }) => {
        const results =
          await selectSubscriptionItemsWithPricesBySubscriptionIds(
            [subscription.id],
            transaction
          )

        expect(results.length).toBe(1)
        expect(results[0].subscriptionItem.id).toBe(
          subscriptionItem.id
        )
        expect(results[0].subscriptionItem.subscriptionId).toBe(
          subscription.id
        )
        expect(results[0].price).toMatchObject({ id: price.id })
        expect(results[0].price?.id).toBe(price.id)
      })
    })

    it('should return items from multiple subscriptions when given multiple subscription IDs', async () => {
      const secondSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: price.id,
      })

      const secondSubscriptionItem = await setupSubscriptionItem({
        subscriptionId: secondSubscription.id,
        name: 'Second Subscription Item',
        quantity: 2,
        unitPrice: 2000,
        priceId: price.id,
      })

      await adminTransaction(async ({ transaction }) => {
        const results =
          await selectSubscriptionItemsWithPricesBySubscriptionIds(
            [subscription.id, secondSubscription.id],
            transaction
          )

        expect(results.length).toBe(2)

        const firstSubItems = results.filter(
          (r) => r.subscriptionItem.subscriptionId === subscription.id
        )
        const secondSubItems = results.filter(
          (r) =>
            r.subscriptionItem.subscriptionId ===
            secondSubscription.id
        )

        expect(firstSubItems.length).toBe(1)
        expect(firstSubItems[0].subscriptionItem.id).toBe(
          subscriptionItem.id
        )

        expect(secondSubItems.length).toBe(1)
        expect(secondSubItems[0].subscriptionItem.id).toBe(
          secondSubscriptionItem.id
        )
      })
    })

    it('should return an empty array when given non-existent subscription IDs', async () => {
      await adminTransaction(async ({ transaction }) => {
        const results =
          await selectSubscriptionItemsWithPricesBySubscriptionIds(
            [core.nanoid(), core.nanoid()],
            transaction
          )
        expect(results).toEqual([])
      })
    })
  })

  describe('selectRichSubscriptionsAndActiveItems', () => {
    it('should return rich subscriptions with only active items', async () => {
      const now = Date.now()
      const futureDate = now + 24 * 60 * 60 * 1000 // tomorrow
      const pastDate = now - 24 * 60 * 60 * 1000 // yesterday

      await adminTransaction(async ({ transaction, livemode }) => {
        // Create an expired item
        const expiredSetup = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          name: 'Expired Item',
          quantity: 1,
          unitPrice: 100,
          priceId: price.id,
          addedDate: pastDate,
        })
        // explicitly expire it.
        await updateSubscriptionItem(
          {
            id: expiredSetup.id,
            expiredAt: pastDate,
            type: SubscriptionItemType.Static,
          },
          transaction
        )

        await updateSubscriptionItem(
          {
            id: subscriptionItem.id,
            expiredAt: pastDate,
            type: SubscriptionItemType.Static,
          },
          transaction
        ) // Expire the original item

        // Create a new active item (item1)
        const item1 = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          name: 'Currently Active Item',
          quantity: 1,
          unitPrice: 100,
          priceId: price.id,
          addedDate: now,
        })
        // Item that expires in future (item2)
        const item2 = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          name: 'Future Expiring Item',
          quantity: 1,
          unitPrice: 100,
          priceId: price.id,
          addedDate: now,
        })
        // Update item1 to expire in the future, making item2 the one that simply has addedDate = now and expiredAt = null
        await updateSubscriptionItem(
          {
            id: item1.id,
            expiredAt: futureDate,
            type: SubscriptionItemType.Static,
          },
          transaction
        )

        const richSubscriptions =
          await selectRichSubscriptionsAndActiveItems(
            { organizationId: organization.id },
            transaction,
            livemode
          )
        expect(richSubscriptions.length).toBe(1)
        const subWithItems = richSubscriptions[0]
        expect(subWithItems.id).toBe(subscription.id)

        // We expect item1 (now future expiring) and item2 (active, no explicit expiry)
        expect(subWithItems.subscriptionItems.length).toBe(2)
        expect(
          subWithItems.subscriptionItems.find(
            (si) => si.id === item1.id
          )
        ).toMatchObject({ id: item1.id })
        expect(
          subWithItems.subscriptionItems.find(
            (si) => si.id === item2.id
          )
        ).toMatchObject({ id: item2.id })

        // These should not be present
        expect(
          subWithItems.subscriptionItems.find(
            (si) => si.id === expiredSetup.id
          )
        ).toBeUndefined()
        expect(
          subWithItems.subscriptionItems.find(
            (si) => si.id === subscriptionItem.id // original item, now expired
          )
        ).toBeUndefined()

        // Check current status
        expect(subWithItems.current).toBe(true) // Assuming default subscription status is active
      })
    })

    it('should correctly determine current status for non-active subscriptions', async () => {
      await adminTransaction(async ({ transaction, livemode }) => {
        await updateSubscription(
          {
            id: subscription.id,
            status: SubscriptionStatus.Canceled,
            renews: subscription.renews,
          },
          transaction
        )

        const richSubscriptions =
          await selectRichSubscriptionsAndActiveItems(
            { organizationId: organization.id },
            transaction,
            livemode
          )
        expect(richSubscriptions.length).toBe(1)
        expect(richSubscriptions[0].current).toBe(false)
      })
    })

    it('should only include feature items for active subscription items', async () => {
      const now = Date.now()
      const pastDate = now - 24 * 60 * 60 * 1000 // yesterday

      await adminTransaction(async ({ transaction, livemode }) => {
        // First expire the original subscription item from beforeEach
        await updateSubscriptionItem(
          {
            id: subscriptionItem.id,
            expiredAt: pastDate,
            type: SubscriptionItemType.Static,
          },
          transaction
        )

        // Create a feature setup
        const featureSetup =
          await setupTestFeaturesAndProductFeatures({
            organizationId: organization.id,
            productId: price.productId,
            livemode: true,
            featureSpecs: [
              {
                name: 'Test Feature',
                type: FeatureType.Toggle,
              },
            ],
          })

        // Create an active item with a feature
        const activeItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          name: 'Active Item with Feature',
          quantity: 1,
          unitPrice: 100,
          priceId: price.id,
        })
        const activeFeature = await insertSubscriptionItemFeature(
          subscriptionItemFeatureInsertFromSubscriptionItemAndFeature(
            {
              subscriptionItem: activeItem,
              feature: featureSetup[0].feature,
              productFeature: featureSetup[0].productFeature,
            }
          ),
          transaction
        )

        // Create an expired item with a feature
        const expiredItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          name: 'Expired Item with Feature',
          quantity: 1,
          unitPrice: 100,
          priceId: price.id,
          addedDate: pastDate,
        })
        await updateSubscriptionItem(
          {
            id: expiredItem.id,
            expiredAt: pastDate,
            type: SubscriptionItemType.Static,
          },
          transaction
        )
        const expiredFeature = await insertSubscriptionItemFeature(
          subscriptionItemFeatureInsertFromSubscriptionItemAndFeature(
            {
              subscriptionItem: expiredItem,
              feature: featureSetup[0].feature,
              productFeature: featureSetup[0].productFeature,
            }
          ),
          transaction
        )

        const richSubscriptions =
          await selectRichSubscriptionsAndActiveItems(
            { organizationId: organization.id },
            transaction,
            livemode
          )

        expect(richSubscriptions.length).toBe(1)
        const subWithItems = richSubscriptions[0]

        // Verify only active item is included
        expect(subWithItems.subscriptionItems.length).toBe(1)
        expect(subWithItems.subscriptionItems[0].id).toBe(
          activeItem.id
        )

        // Verify only feature for active item is included
        expect(subWithItems.experimental?.featureItems.length).toBe(1)
        expect(subWithItems.experimental?.featureItems[0].id).toBe(
          activeFeature.id
        )
        expect(
          subWithItems.experimental?.featureItems[0]
            .subscriptionItemId
        ).toBe(activeItem.id)
      })
    })

    it('should only include unexpired subscriptionItemFeatures', async () => {
      await adminTransaction(async ({ transaction, livemode }) => {
        const now = Date.now()
        const pastDate = now - 1000 * 60 * 60 * 24 // 1 day ago

        // Expire the subscription item from beforeEach to avoid interference
        await updateSubscriptionItem(
          {
            id: subscriptionItem.id,
            expiredAt: pastDate,
            type: SubscriptionItemType.Static,
          },
          transaction
        )

        // Create a feature setup with a product and feature
        const featureSetup =
          await setupTestFeaturesAndProductFeatures({
            organizationId: organization.id,
            productId: price.productId,
            livemode: true,
            featureSpecs: [
              {
                name: 'Active Feature',
                type: FeatureType.Toggle,
              },
              {
                name: 'Expired Feature',
                type: FeatureType.Toggle,
              },
            ],
          })

        // Create an active subscription item
        const activeItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          name: 'Active Item',
          quantity: 1,
          unitPrice: 100,
          priceId: price.id,
        })

        // Create an unexpired feature for the active item (no expiredAt)
        const activeFeature = await insertSubscriptionItemFeature(
          subscriptionItemFeatureInsertFromSubscriptionItemAndFeature(
            {
              subscriptionItem: activeItem,
              feature: featureSetup[0].feature,
              productFeature: featureSetup[0].productFeature,
            }
          ),
          transaction
        )

        // Create an expired feature for the active item
        const expiredFeature = await insertSubscriptionItemFeature(
          {
            ...subscriptionItemFeatureInsertFromSubscriptionItemAndFeature(
              {
                subscriptionItem: activeItem,
                feature: featureSetup[1].feature,
                productFeature: featureSetup[1].productFeature,
              }
            ),
            expiredAt: pastDate, // Expired
          },
          transaction
        )

        const richSubscriptions =
          await selectRichSubscriptionsAndActiveItems(
            { organizationId: organization.id },
            transaction,
            livemode
          )

        expect(richSubscriptions.length).toBe(1)
        const subWithItems = richSubscriptions[0]

        // Verify active item is included
        expect(subWithItems.subscriptionItems.length).toBe(1)
        expect(subWithItems.subscriptionItems[0].id).toBe(
          activeItem.id
        )

        // Verify only unexpired features are included
        expect(subWithItems.experimental?.featureItems.length).toBe(1)
        expect(subWithItems.experimental?.featureItems[0].id).toBe(
          activeFeature.id
        )
        // Verify expired feature is NOT included
        const featureIds =
          subWithItems.experimental?.featureItems.map((f) => f.id)
        expect(featureIds).not.toContain(expiredFeature.id)
      })
    })

    it('should include all meter balances for the subscription regardless of subscription item association', async () => {
      // Setup first usage meter scenario with a subscription item
      const scenario1 = await setupUsageLedgerScenario({
        usageEventAmounts: [100, 200],
        livemode: true,
      })

      await adminTransaction(async ({ transaction, livemode }) => {
        // Update the first meter's ledger entries to include the usageMeterId
        await transaction
          .update(ledgerEntries)
          .set({ usageMeterId: scenario1.usageMeter.id })
          .where(
            and(
              eq(
                ledgerEntries.ledgerAccountId,
                scenario1.ledgerAccount.id
              ),
              eq(
                ledgerEntries.subscriptionId,
                scenario1.subscription.id
              )
            )
          )

        // Create second usage meter and its ledger entries within the transaction
        const secondUsageMeter = await setupUsageMeter({
          organizationId: organization.id,
          name: 'Second Usage Meter',
        })

        const secondUsageEvent = await setupUsageEvent({
          subscriptionId: scenario1.subscription.id,
          amount: 100,
          usageMeterId: secondUsageMeter.id,
          usageDate: Date.now(),
          organizationId: organization.id,
          priceId: price.id,
          billingPeriodId: scenario1.billingPeriod.id,
          transactionId: core.nanoid(),
          customerId: customer.id,
        })

        const ledgerTransaction = await setupLedgerTransaction({
          organizationId: organization.id,
          subscriptionId: scenario1.subscription.id,
          type: LedgerTransactionType.UsageEventProcessed,
        })

        const secondLedgerAccount = await setupLedgerAccount({
          organizationId: organization.id,
          subscriptionId: scenario1.subscription.id,
          usageMeterId: secondUsageMeter.id,
          livemode: true,
        })

        const secondLedgerEntry = await setupDebitLedgerEntry({
          organizationId: organization.id,
          subscriptionId: scenario1.subscription.id,
          usageMeterId: secondUsageMeter.id,
          amount: 200,
          entryType: LedgerEntryType.UsageCost,
          sourceUsageEventId: secondUsageEvent.id,
          ledgerTransactionId: ledgerTransaction.id,
          ledgerAccountId: secondLedgerAccount.id,
        })

        const richSubscriptions =
          await selectRichSubscriptionsAndActiveItems(
            { organizationId: scenario1.organization.id },
            transaction,
            livemode
          )

        expect(richSubscriptions.length).toBe(1)
        const subWithItems = richSubscriptions[0]
        expect(subWithItems.subscriptionItems.length).toBe(1)
        expect(subWithItems.subscriptionItems[0].id).toBe(
          scenario1.subscriptionItem.id
        )

        // Verify meter balances - should include both meters
        expect(
          subWithItems.experimental?.usageMeterBalances.length
        ).toBe(2)

        const meterBalances =
          subWithItems.experimental?.usageMeterBalances ?? []
        const associatedMeterBalance = meterBalances.find(
          (b) => b.id === scenario1.usageMeter.id
        )
        const unassociatedMeterBalance = meterBalances.find(
          (b) => b.id === secondUsageMeter.id
        )

        expect(associatedMeterBalance).toMatchObject({
          availableBalance: -300,
        })
        expect(associatedMeterBalance?.availableBalance).toBe(-300)
        expect(unassociatedMeterBalance).toMatchObject({
          availableBalance: -200,
        })
        expect(unassociatedMeterBalance?.availableBalance).toBe(-200)
      })
    })

    it('should handle subscriptions with no items or features', async () => {
      await adminTransaction(async ({ transaction, livemode }) => {
        // First expire the original subscription item from beforeEach
        await updateSubscriptionItem(
          {
            id: subscriptionItem.id,
            expiredAt: 0, // Set to epoch to ensure it's expired
            type: SubscriptionItemType.Static,
          },
          transaction
        )

        // Create a new subscription with no items
        const emptySubscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })

        const richSubscriptions =
          await selectRichSubscriptionsAndActiveItems(
            { organizationId: organization.id },
            transaction,
            livemode
          )

        expect(richSubscriptions.length).toBe(2) // Original + new empty subscription

        const emptySub = richSubscriptions.find(
          (s) => s.id === emptySubscription.id
        )
        expect(typeof emptySub).toBe('object')
        expect(emptySub?.subscriptionItems).toEqual([])
        expect(emptySub?.experimental?.featureItems).toEqual([])
        expect(emptySub?.experimental?.usageMeterBalances).toEqual([])
      })
    })
  })

  describe('bulkInsertOrDoNothingSubscriptionItemsByExternalId', async () => {
    const itemExternalId1 = `ext_${core.nanoid()}`
    const itemExternalId2 = `ext_${core.nanoid()}`
    const itemsToInsert: Omit<
      SubscriptionItem.Insert,
      'subscriptionId' | 'priceId'
    >[] = [
      {
        name: 'Bulk External ID Item 1',
        quantity: 1,
        unitPrice: 100,
        livemode: true,
        addedDate: Date.now(),
        expiredAt: null,
        externalId: itemExternalId1,
        metadata: {},
        type: SubscriptionItemType.Static,
      },
      {
        name: 'Bulk External ID Item 2',
        quantity: 2,
        unitPrice: 200,
        livemode: true,
        addedDate: Date.now(),
        expiredAt: null,
        externalId: itemExternalId2,
        metadata: {},
        type: SubscriptionItemType.Static,
      },
    ]

    it('should insert new subscription items if no item with the same externalId exists', async () => {
      await adminTransaction(async ({ transaction }) => {
        const results =
          await bulkInsertOrDoNothingSubscriptionItemsByExternalId(
            itemsToInsert.map((item) => {
              return {
                ...item,
                subscriptionId: subscription.id,
                priceId: price.id,
                type: SubscriptionItemType.Static,
              }
            }),
            transaction
          )
        expect(results.length).toBe(itemsToInsert.length)
        const selected = await selectSubscriptionItems(
          { subscriptionId: subscription.id },
          transaction
        )
        // Initial + 2 new ones
        expect(selected.length).toBe(1 + itemsToInsert.length)
      })
    })

    it('should do nothing if subscription items with the same externalId already exist', async () => {
      await adminTransaction(async ({ transaction }) => {
        // First insert
        await bulkInsertOrDoNothingSubscriptionItemsByExternalId(
          itemsToInsert.map((item) => {
            return {
              ...item,
              subscriptionId: subscription.id,
              priceId: price.id,
              type: SubscriptionItemType.Static,
            }
          }),
          transaction
        )
        const initialCount = (
          await selectSubscriptionItems(
            { subscriptionId: subscription.id },
            transaction
          )
        ).length

        // Attempt to insert again
        const results =
          await bulkInsertOrDoNothingSubscriptionItemsByExternalId(
            itemsToInsert.map((item) => {
              return {
                ...item,
                subscriptionId: subscription.id,
                priceId: price.id,
                type: SubscriptionItemType.Static,
              }
            }),
            transaction
          )
        expect(results.length).toBe(0) // No new items should be returned as they were ignored

        const finalCount = (
          await selectSubscriptionItems(
            { subscriptionId: subscription.id },
            transaction
          )
        ).length
        expect(finalCount).toBe(initialCount) // Count should remain the same
      })
    })
  })

  describe('selectCurrentlyActiveSubscriptionItems', () => {
    const anchorDate = new Date()
    const futureDate = anchorDate.getTime() + 1000 * 60 * 60 * 24 // 1 day after anchor
    const pastDate = anchorDate.getTime() - 1000 * 60 * 60 * 24 // 1 day before anchor

    it('should return items not expired or expiring after anchorDate', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Expire the default item before anchorDate
        await updateSubscriptionItem(
          {
            id: subscriptionItem.id,
            expiredAt: pastDate,
            type: SubscriptionItemType.Static,
          },
          transaction
        )

        // Item expiring after anchorDate
        const futureExpiringItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          name: 'Future Expiring',
          quantity: 1,
          unitPrice: 100,
          priceId: price.id,
          addedDate: pastDate, // Ensure it's added before anchorDate
        })
        await updateSubscriptionItem(
          {
            id: futureExpiringItem.id,
            expiredAt: futureDate,
            type: SubscriptionItemType.Static,
          },
          transaction
        )

        // Item with no expiry date
        const noExpiryItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          name: 'No Expiry',
          quantity: 1,
          unitPrice: 100,
          priceId: price.id,
          addedDate: pastDate, // Ensure it's added before anchorDate
        })
        // Ensure expiredAt is explicitly null for this test case
        await updateSubscriptionItem(
          {
            id: noExpiryItem.id,
            expiredAt: null,
            type: SubscriptionItemType.Static,
          },
          transaction
        )

        const results = await selectCurrentlyActiveSubscriptionItems(
          { subscriptionId: subscription.id },
          anchorDate,
          transaction
        )

        expect(results.length).toBe(2)
        expect(
          results.find((item) => item.id === futureExpiringItem.id)
        ).toMatchObject({ id: futureExpiringItem.id })
        expect(
          results.find((item) => item.id === noExpiryItem.id)
        ).toMatchObject({ id: noExpiryItem.id })
        expect(
          results.find((item) => item.id === subscriptionItem.id)
        ).toBeUndefined()
      })
    })

    it('should apply whereConditions in addition to active filter', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Update the original subscription item to have addedDate before anchorDate
        await updateSubscriptionItem(
          {
            id: subscriptionItem.id,
            addedDate: pastDate, // Ensure it's added before anchorDate
            type: SubscriptionItemType.Static,
          },
          transaction
        )

        // Item that is active but has a different name
        await setupSubscriptionItem({
          subscriptionId: subscription.id,
          name: 'Another Active Item',
          quantity: 1,
          unitPrice: 100,
          priceId: price.id,
          addedDate: pastDate, // Ensure it's added before anchorDate
        })
        // subscriptionItem is active by default (expiredAt is null)

        const results = await selectCurrentlyActiveSubscriptionItems(
          {
            name: subscriptionItem.name,
            subscriptionId: subscription.id,
          }, // Filter by the original item's name
          anchorDate,
          transaction
        )
        expect(results.length).toBe(1)
        expect(results[0].id).toBe(subscriptionItem.id)
        expect(results[0].name).toBe(subscriptionItem.name)
      })
    })
  })

  describe('pricingModelId derivation', () => {
    it('insertSubscriptionItem should derive pricingModelId from subscription', async () => {
      await adminTransaction(async ({ transaction }) => {
        const item = await insertSubscriptionItem(
          {
            subscriptionId: subscription.id,
            type: SubscriptionItemType.Static,
            addedDate: Date.now(),
            unitPrice: 1000,
            quantity: 1,
            livemode: true,
            priceId: price.id,
          },
          transaction
        )

        expect(item.pricingModelId).toBe(subscription.pricingModelId)
      })
    })

    it('insertSubscriptionItem should honor provided pricingModelId', async () => {
      await adminTransaction(async ({ transaction }) => {
        const orgData = await setupOrg()
        const item = await insertSubscriptionItem(
          {
            subscriptionId: subscription.id,
            type: SubscriptionItemType.Static,
            addedDate: Date.now(),
            unitPrice: 1000,
            quantity: 1,
            livemode: true,
            priceId: price.id,
            pricingModelId: orgData.pricingModel.id, // explicitly provided
          },
          transaction
        )

        expect(item.pricingModelId).toBe(orgData.pricingModel.id)
      })
    })

    it('bulkInsertSubscriptionItems should derive pricingModelId for all items', async () => {
      await adminTransaction(async ({ transaction }) => {
        const items = await bulkInsertSubscriptionItems(
          [
            {
              subscriptionId: subscription.id,
              type: SubscriptionItemType.Static,
              addedDate: Date.now(),
              unitPrice: 1000,
              quantity: 1,
              livemode: true,
              priceId: price.id,
            },
            {
              subscriptionId: subscription.id,
              type: SubscriptionItemType.Static,
              addedDate: Date.now(),
              unitPrice: 2000,
              quantity: 2,
              livemode: true,
              priceId: price.id,
            },
          ],
          transaction
        )

        expect(items).toHaveLength(2)
        expect(items[0].pricingModelId).toBe(
          subscription.pricingModelId
        )
        expect(items[1].pricingModelId).toBe(
          subscription.pricingModelId
        )
      })
    })

    it('bulkInsertOrDoNothingSubscriptionItemsByExternalId should derive pricingModelId', async () => {
      await adminTransaction(async ({ transaction }) => {
        const externalId1 = `ext_${core.nanoid()}`
        const externalId2 = `ext_${core.nanoid()}`

        const items =
          await bulkInsertOrDoNothingSubscriptionItemsByExternalId(
            [
              {
                subscriptionId: subscription.id,
                type: SubscriptionItemType.Static,
                addedDate: Date.now(),
                unitPrice: 1000,
                quantity: 1,
                livemode: true,
                externalId: externalId1,
                priceId: price.id,
              },
              {
                subscriptionId: subscription.id,
                type: SubscriptionItemType.Static,
                addedDate: Date.now(),
                unitPrice: 2000,
                quantity: 2,
                livemode: true,
                externalId: externalId2,
                priceId: price.id,
              },
            ],
            transaction
          )

        expect(items).toHaveLength(2)
        expect(items[0].pricingModelId).toBe(
          subscription.pricingModelId
        )
        expect(items[1].pricingModelId).toBe(
          subscription.pricingModelId
        )
      })
    })

    it('bulkCreateOrUpdateSubscriptionItems should derive pricingModelId for new items', async () => {
      await adminTransaction(async ({ transaction }) => {
        const newItem = {
          subscriptionId: subscription.id,
          type: SubscriptionItemType.Static,
          addedDate: Date.now(),
          unitPrice: 1000,
          quantity: 1,
          livemode: true,
          priceId: price.id,
        } as const

        const items = await bulkCreateOrUpdateSubscriptionItems(
          [newItem],
          transaction
        )

        expect(items).toHaveLength(1)
        expect(items[0].pricingModelId).toBe(
          subscription.pricingModelId
        )
      })
    })

    it('insertSubscriptionItem should throw error when subscription does not exist', async () => {
      await adminTransaction(async ({ transaction }) => {
        const nonExistentSubscriptionId = `sub_${core.nanoid()}`

        await expect(
          insertSubscriptionItem(
            {
              subscriptionId: nonExistentSubscriptionId,
              type: SubscriptionItemType.Static,
              addedDate: Date.now(),
              unitPrice: 1000,
              quantity: 1,
              livemode: true,
              priceId: price.id,
            },
            transaction
          )
        ).rejects.toThrow()
      })
    })

    it('bulkInsertSubscriptionItems should throw error when any subscription does not exist', async () => {
      await adminTransaction(async ({ transaction }) => {
        const nonExistentSubscriptionId = `sub_${core.nanoid()}`

        await expect(
          bulkInsertSubscriptionItems(
            [
              {
                subscriptionId: subscription.id,
                type: SubscriptionItemType.Static,
                addedDate: Date.now(),
                unitPrice: 1000,
                quantity: 1,
                livemode: true,
                priceId: price.id,
              },
              {
                subscriptionId: nonExistentSubscriptionId, // invalid
                type: SubscriptionItemType.Static,
                addedDate: Date.now(),
                unitPrice: 2000,
                quantity: 2,
                livemode: true,
                priceId: price.id,
              },
            ],
            transaction
          )
        ).rejects.toThrow()
      })
    })

    it('bulkInsertOrDoNothingSubscriptionItemsByExternalId should throw error when subscription does not exist', async () => {
      await adminTransaction(async ({ transaction }) => {
        const nonExistentSubscriptionId = `sub_${core.nanoid()}`
        const externalId = `ext_${core.nanoid()}`

        await expect(
          bulkInsertOrDoNothingSubscriptionItemsByExternalId(
            [
              {
                subscriptionId: nonExistentSubscriptionId,
                type: SubscriptionItemType.Static,
                addedDate: Date.now(),
                unitPrice: 1000,
                quantity: 1,
                livemode: true,
                externalId,
                priceId: price.id,
              },
            ],
            transaction
          )
        ).rejects.toThrow()
      })
    })

    it('bulkCreateOrUpdateSubscriptionItems should throw error when subscription does not exist for new items', async () => {
      await adminTransaction(async ({ transaction }) => {
        const nonExistentSubscriptionId = `sub_${core.nanoid()}`

        await expect(
          bulkCreateOrUpdateSubscriptionItems(
            [
              {
                subscriptionId: nonExistentSubscriptionId,
                type: SubscriptionItemType.Static,
                addedDate: Date.now(),
                unitPrice: 1000,
                quantity: 1,
                livemode: true,
                priceId: price.id,
              },
            ],
            transaction
          )
        ).rejects.toThrow()
      })
    })
  })
})
