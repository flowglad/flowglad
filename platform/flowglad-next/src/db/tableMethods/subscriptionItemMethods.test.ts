import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  selectSubscriptionItemById,
  insertSubscriptionItem,
  updateSubscriptionItem,
  selectSubscriptionItems,
  bulkInsertSubscriptionItems,
  selectSubscriptionAndItems,
  selectSubscriptionItemsAndSubscriptionBySubscriptionId,
  expireSubscriptionItem,
  selectRichSubscriptionsAndActiveItems,
  bulkInsertOrDoNothingSubscriptionItemsByExternalId,
  selectCurrentlyActiveSubscriptionItems,
  bulkCreateOrUpdateSubscriptionItems,
} from './subscriptionItemMethods'
import {
  setupOrg,
  setupCustomer,
  setupPaymentMethod,
  setupSubscription,
  setupSubscriptionItem,
  setupTestFeaturesAndProductFeatures,
  setupUsageMeter,
  setupCreditLedgerEntry,
  setupUsageEvent,
  setupDebitLedgerEntry,
  setupLedgerTransaction,
  setupLedgerAccount,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  SubscriptionItem,
  subscriptionItems,
} from '@/db/schema/subscriptionItems'
import { Subscription } from '@/db/schema/subscriptions'
import { Price } from '@/db/schema/prices'
import { Organization } from '@/db/schema/organizations'
import { Customer } from '@/db/schema/customers'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { core } from '@/utils/core'
import {
  FeatureType,
  LedgerEntryType,
  LedgerTransactionType,
  SubscriptionItemType,
  SubscriptionStatus,
} from '@/types'
import { updateSubscription } from './subscriptionMethods'
import {
  SubscriptionItemFeature,
  subscriptionItemFeatures,
} from '@/db/schema/subscriptionItemFeatures'
import { insertSubscriptionItemFeature } from './subscriptionItemFeatureMethods'
import { eq, and } from 'drizzle-orm'
import { subscriptionItemFeatureInsertFromSubscriptionItemAndFeature } from '@/subscriptions/subscriptionItemFeatureHelpers'
import { setupUsageLedgerScenario } from '@/../seedDatabase'
import { ledgerEntries } from '@/db/schema/ledgerEntries'
import { ledgerAccounts } from '@/db/schema/ledgerAccounts'

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
        expect(result).toBeDefined()
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
        usageMeterId: null,
        usageEventsPerUnit: null,
      }
      await adminTransaction(async ({ transaction }) => {
        const result = await insertSubscriptionItem(
          newItemData,
          transaction
        )
        expect(result).toBeDefined()
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
            usageMeterId: null,
            usageEventsPerUnit: null,
          },
          transaction
        )
        expect(result).toBeDefined()
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
              usageMeterId: null,
              usageEventsPerUnit: null,
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
          usageMeterId: null,
          usageEventsPerUnit: null,
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
          usageMeterId: null,
          usageEventsPerUnit: null,
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
          expect(original).toBeDefined()
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
        expect(result).toBeDefined()
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
        expect(result).toBeDefined()
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
          usageMeterId: null,
          usageEventsPerUnit: null,
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
          usageMeterId: null,
          usageEventsPerUnit: null,
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
        expect(updatedItem).toBeDefined()
        expect(updatedItem?.name).toBe(
          'Updated Existing Item via Bulk'
        )
        expect(updatedItem?.quantity).toBe(10)

        const newItem = results.find(
          (r) => r.externalId === newItemExternalId
        )
        expect(newItem).toBeDefined()
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

  describe('expireSubscriptionItem', () => {
    it('should update the expiredAt field of the specified subscription item and its features', async () => {
      const expiryDate = new Date()
      let feature: SubscriptionItemFeature.Record | undefined =
        undefined
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
            subscriptionItem,
            featureSetup[0].productFeature,
            featureSetup[0].feature
          ),
          transaction
        )

        await expireSubscriptionItem(
          subscriptionItem.id,
          expiryDate,
          transaction
        )
        const updatedItem = await selectSubscriptionItemById(
          subscriptionItem.id,
          transaction
        )
        expect(updatedItem?.expiredAt).toEqual(expiryDate)

        const [updatedFeature] = await transaction
          .select()
          .from(subscriptionItemFeatures)
          .where(eq(subscriptionItemFeatures.id, feature!.id))
        expect(updatedFeature?.expiredAt).toEqual(expiryDate)
      })
    })
  })

  describe('selectRichSubscriptionsAndActiveItems', () => {
    it('should return rich subscriptions with only active items', async () => {
      const now = Date.now()
      const futureDate = now + 24 * 60 * 60 * 1000 // tomorrow
      const pastDate = now - 24 * 60 * 60 * 1000 // yesterday

      await adminTransaction(async ({ transaction }) => {
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
            usageMeterId: null,
            usageEventsPerUnit: null,
          },
          transaction
        )

        await updateSubscriptionItem(
          {
            id: subscriptionItem.id,
            expiredAt: pastDate,
            type: SubscriptionItemType.Static,
            usageMeterId: null,
            usageEventsPerUnit: null,
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
            usageMeterId: null,
            usageEventsPerUnit: null,
          },
          transaction
        )

        const richSubscriptions =
          await selectRichSubscriptionsAndActiveItems(
            { organizationId: organization.id },
            transaction
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
        ).toBeDefined()
        expect(
          subWithItems.subscriptionItems.find(
            (si) => si.id === item2.id
          )
        ).toBeDefined()

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
      await adminTransaction(async ({ transaction }) => {
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
            transaction
          )
        expect(richSubscriptions.length).toBe(1)
        expect(richSubscriptions[0].current).toBe(false)
      })
    })

    it('should only include feature items for active subscription items', async () => {
      const now = Date.now()
      const pastDate = now - 24 * 60 * 60 * 1000 // yesterday

      await adminTransaction(async ({ transaction }) => {
        // First expire the original subscription item from beforeEach
        await updateSubscriptionItem(
          {
            id: subscriptionItem.id,
            expiredAt: pastDate,
            type: SubscriptionItemType.Static,
            usageMeterId: null,
            usageEventsPerUnit: null,
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
            activeItem,
            featureSetup[0].productFeature,
            featureSetup[0].feature
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
            usageMeterId: null,
            usageEventsPerUnit: null,
          },
          transaction
        )
        const expiredFeature = await insertSubscriptionItemFeature(
          subscriptionItemFeatureInsertFromSubscriptionItemAndFeature(
            expiredItem,
            featureSetup[0].productFeature,
            featureSetup[0].feature
          ),
          transaction
        )

        const richSubscriptions =
          await selectRichSubscriptionsAndActiveItems(
            { organizationId: organization.id },
            transaction
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

    it('should include all meter balances for the subscription regardless of subscription item association', async () => {
      // Setup first usage meter scenario with a subscription item
      const scenario1 = await setupUsageLedgerScenario({
        usageEventAmounts: [100, 200],
        livemode: true,
      })

      await adminTransaction(async ({ transaction }) => {
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
            transaction
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

        expect(associatedMeterBalance).toBeDefined()
        expect(associatedMeterBalance?.availableBalance).toBe(-300)
        expect(unassociatedMeterBalance).toBeDefined()
        expect(unassociatedMeterBalance?.availableBalance).toBe(-200)
      })
    })

    it('should handle subscriptions with no items or features', async () => {
      await adminTransaction(async ({ transaction }) => {
        // First expire the original subscription item from beforeEach
        await updateSubscriptionItem(
          {
            id: subscriptionItem.id,
            expiredAt: 0, // Set to epoch to ensure it's expired
            type: SubscriptionItemType.Static,
            usageMeterId: null,
            usageEventsPerUnit: null,
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
            transaction
          )

        expect(richSubscriptions.length).toBe(2) // Original + new empty subscription

        const emptySub = richSubscriptions.find(
          (s) => s.id === emptySubscription.id
        )
        expect(emptySub).toBeDefined()
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
        usageMeterId: null,
        usageEventsPerUnit: null,
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
        usageMeterId: null,
        usageEventsPerUnit: null,
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
                usageMeterId: null,
                usageEventsPerUnit: null,
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
              usageMeterId: null,
              usageEventsPerUnit: null,
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
                usageMeterId: null,
                usageEventsPerUnit: null,
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
            usageMeterId: null,
            usageEventsPerUnit: null,
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
        })
        await updateSubscriptionItem(
          {
            id: futureExpiringItem.id,
            expiredAt: futureDate,
            type: SubscriptionItemType.Static,
            usageMeterId: null,
            usageEventsPerUnit: null,
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
        })
        // Ensure expiredAt is explicitly null for this test case
        await updateSubscriptionItem(
          {
            id: noExpiryItem.id,
            expiredAt: null,
            type: SubscriptionItemType.Static,
            usageMeterId: null,
            usageEventsPerUnit: null,
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
        ).toBeDefined()
        expect(
          results.find((item) => item.id === noExpiryItem.id)
        ).toBeDefined()
        expect(
          results.find((item) => item.id === subscriptionItem.id)
        ).toBeUndefined()
      })
    })

    it('should apply whereConditions in addition to active filter', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Item that is active but has a different name
        await setupSubscriptionItem({
          subscriptionId: subscription.id,
          name: 'Another Active Item',
          quantity: 1,
          unitPrice: 100,
          priceId: price.id,
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
})
