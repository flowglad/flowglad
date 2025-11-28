import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import db from '@/db/client'
import {
  subscriptionItemFeatures,
  SubscriptionItemFeature,
} from '@/db/schema/subscriptionItemFeatures'
import {
  selectSubscriptionItemFeatureById,
  selectClientSubscriptionItemFeatureAndFeatureById,
  insertSubscriptionItemFeature,
  updateSubscriptionItemFeature,
  selectSubscriptionItemFeatures,
  selectSubscriptionItemFeaturesWithFeatureSlug,
  upsertSubscriptionItemFeatureByProductFeatureIdAndSubscriptionId,
  bulkUpsertSubscriptionItemFeaturesByProductFeatureIdAndSubscriptionId,
  expireSubscriptionItemFeature,
  expireSubscriptionItemFeaturesForSubscriptionItems,
  detachSubscriptionItemFeaturesFromProductFeature,
} from './subscriptionItemFeatureMethods'
import {
  setupOrg,
  setupCustomer,
  setupPaymentMethod,
  setupSubscription,
  setupSubscriptionItem,
  setupTestFeaturesAndProductFeatures,
  setupUsageMeter,
} from '@/../seedDatabase'
import {
  SubscriptionItemType,
  FeatureType,
  FeatureUsageGrantFrequency,
} from '@/types'

describe('subscriptionItemFeatureMethods', () => {
  let organization: any
  let customer: any
  let paymentMethod: any
  let subscription: any
  let subscriptionItem: any
  let toggleFeature: any
  let toggleProductFeature: any
  let usageCreditGrantFeature: any
  let usageCreditGrantProductFeature: any
  let usageMeter: any

  beforeEach(async () => {
    // Clear table for isolation
    await db.delete(subscriptionItemFeatures)

    // Setup org, product, price, pricingModel
    const orgData = await setupOrg()
    organization = orgData.organization
    const { product, price, pricingModel } = orgData

    // Setup customer and payment method
    customer = await setupCustomer({
      organizationId: organization.id,
    })
    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    // Setup subscription
    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
    })

    // Setup subscriptionItem
    subscriptionItem = await setupSubscriptionItem({
      subscriptionId: subscription.id,
      name: 'Test Item',
      quantity: 1,
      unitPrice: price.unitPrice,
      type: SubscriptionItemType.Static,
    })

    // Setup features for Toggle and UsageCreditGrant
    const featureData = await setupTestFeaturesAndProductFeatures({
      organizationId: organization.id,
      productId: product.id,
      livemode: true,
      featureSpecs: [
        { name: 'Toggle Feature', type: FeatureType.Toggle },
        {
          name: 'Credit Grant Feature',
          type: FeatureType.UsageCreditGrant,
          usageMeterName: 'Test Meter',
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          amount: 100,
        },
      ],
    })
    ;[
      {
        feature: toggleFeature,
        productFeature: toggleProductFeature,
      },
      {
        feature: usageCreditGrantFeature,
        productFeature: usageCreditGrantProductFeature,
      },
    ] = featureData

    // Setup usageMeter for UsageCreditGrant
    usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Meter',
      pricingModelId: pricingModel.id,
    })
  })

  describe('selectSubscriptionItemFeatureById', () => {
    it('returns a record by ID', async () => {
      await adminTransaction(async ({ transaction }) => {
        const inserted = await insertSubscriptionItemFeature(
          {
            type: FeatureType.Toggle,
            subscriptionItemId: subscriptionItem.id,
            featureId: toggleFeature.id,
            productFeatureId: toggleProductFeature.id,
            usageMeterId: null,
            amount: null,
            renewalFrequency: null,
            livemode: true,
          },
          transaction
        )
        const fetched = await selectSubscriptionItemFeatureById(
          inserted.id,
          transaction
        )
        expect(fetched.id).toBe(inserted.id)
        expect(fetched.type).toBe(FeatureType.Toggle)
      })
    })

    it('throws when ID not found', async () => {
      await expect(
        adminTransaction(async ({ transaction }) => {
          return selectSubscriptionItemFeatureById(
            'bad-id',
            transaction
          )
        })
      ).rejects.toThrow()
    })
  })

  describe('selectClientSubscriptionItemFeatureAndFeatureById', () => {
    it('returns combined record with feature name & slug', async () => {
      await adminTransaction(async ({ transaction }) => {
        const inserted = await insertSubscriptionItemFeature(
          {
            type: FeatureType.Toggle,
            subscriptionItemId: subscriptionItem.id,
            featureId: toggleFeature.id,
            productFeatureId: toggleProductFeature.id,
            usageMeterId: null,
            amount: null,
            renewalFrequency: null,
            livemode: true,
          },
          transaction
        )
        const rows =
          await selectClientSubscriptionItemFeatureAndFeatureById(
            inserted.id,
            transaction
          )
        expect(Array.isArray(rows)).toBe(true)
        expect(rows.length).toBe(1)
        expect(rows[0].id).toBe(inserted.id)
        expect(rows[0].name).toBe(toggleFeature.name)
        expect(rows[0].slug).toBe(toggleFeature.slug)
      })
    })

    it('returns empty array if not found', async () => {
      await adminTransaction(async ({ transaction }) => {
        const rows =
          await selectClientSubscriptionItemFeatureAndFeatureById(
            'bad-id',
            transaction
          )
        expect(rows).toEqual([])
      })
    })
  })

  describe('insertSubscriptionItemFeature', () => {
    it('inserts a Toggle feature record', async () => {
      await adminTransaction(async ({ transaction }) => {
        const inserted = await insertSubscriptionItemFeature(
          {
            type: FeatureType.Toggle,
            subscriptionItemId: subscriptionItem.id,
            featureId: toggleFeature.id,
            productFeatureId: toggleProductFeature.id,
            usageMeterId: null,
            amount: null,
            renewalFrequency: null,
            livemode: true,
          },
          transaction
        )
        expect(inserted.id).toBeDefined()
        expect(inserted.type).toBe(FeatureType.Toggle)
        expect(inserted.usageMeterId).toBeNull()
        expect(inserted.productFeatureId).toBe(
          toggleProductFeature.id
        )
      })
    })

    it('inserts a UsageCreditGrant feature record', async () => {
      await adminTransaction(async ({ transaction }) => {
        const inserted = await insertSubscriptionItemFeature(
          {
            type: FeatureType.UsageCreditGrant,
            subscriptionItemId: subscriptionItem.id,
            featureId: usageCreditGrantFeature.id,
            productFeatureId: usageCreditGrantProductFeature.id,
            usageMeterId: usageMeter.id,
            amount: 100,
            renewalFrequency:
              FeatureUsageGrantFrequency.EveryBillingPeriod,
            livemode: true,
          },
          transaction
        )
        expect(inserted.type).toBe(FeatureType.UsageCreditGrant)
        expect(inserted.usageMeterId).toBe(usageMeter.id)
        expect(inserted.amount).toBe(100)
      })
    })
  })

  describe('updateSubscriptionItemFeature & expire', () => {
    it('updates expiredAt through updateSubscriptionItemFeature', async () => {
      await adminTransaction(async ({ transaction }) => {
        const inserted = await insertSubscriptionItemFeature(
          {
            type: FeatureType.Toggle,
            subscriptionItemId: subscriptionItem.id,
            featureId: toggleFeature.id,
            productFeatureId: toggleProductFeature.id,
            usageMeterId: null,
            amount: null,
            renewalFrequency: null,
            livemode: true,
          },
          transaction
        )
        const now = new Date()
        const updated = await updateSubscriptionItemFeature(
          { ...inserted, expiredAt: now.getTime() },
          transaction
        )
        expect(updated.expiredAt).not.toBeNull()
        expect(updated.expiredAt).toBe(now.getTime())
      })
    })

    it('expires multiple records by subscriptionItemId', async () => {
      await adminTransaction(async ({ transaction }) => {
        await insertSubscriptionItemFeature(
          {
            type: FeatureType.Toggle,
            subscriptionItemId: subscriptionItem.id,
            featureId: toggleFeature.id,
            productFeatureId: toggleProductFeature.id,
            usageMeterId: null,
            amount: null,
            renewalFrequency: null,
            livemode: true,
          },
          transaction
        )
        await insertSubscriptionItemFeature(
          {
            type: FeatureType.UsageCreditGrant,
            subscriptionItemId: subscriptionItem.id,
            featureId: usageCreditGrantFeature.id,
            productFeatureId: usageCreditGrantProductFeature.id,
            usageMeterId: usageMeter.id,
            amount: 50,
            renewalFrequency:
              FeatureUsageGrantFrequency.EveryBillingPeriod,
            livemode: true,
          },
          transaction
        )
        const date = new Date()
        const updated =
          await expireSubscriptionItemFeaturesForSubscriptionItems(
            [subscriptionItem.id],
            date,
            transaction
          )
        expect(updated.length).toBe(2)
        updated.forEach((u: SubscriptionItemFeature.Record) => {
          expect(u.expiredAt).not.toBeNull()
          expect(u.expiredAt).toBe(date.getTime())
        })
      })
    })
  })

  describe('selection & filtering', () => {
    it('selects all and filters by properties', async () => {
      await adminTransaction(async ({ transaction }) => {
        const r1 = await insertSubscriptionItemFeature(
          {
            type: FeatureType.Toggle,
            subscriptionItemId: subscriptionItem.id,
            featureId: toggleFeature.id,
            productFeatureId: toggleProductFeature.id,
            usageMeterId: null,
            amount: null,
            renewalFrequency: null,
            livemode: true,
          },
          transaction
        )
        const r2 = await insertSubscriptionItemFeature(
          {
            type: FeatureType.UsageCreditGrant,
            subscriptionItemId: subscriptionItem.id,
            featureId: usageCreditGrantFeature.id,
            productFeatureId: usageCreditGrantProductFeature.id,
            usageMeterId: usageMeter.id,
            amount: 25,
            renewalFrequency:
              FeatureUsageGrantFrequency.EveryBillingPeriod,
            livemode: true,
          },
          transaction
        )
        const byItem = await selectSubscriptionItemFeatures(
          { subscriptionItemId: subscriptionItem.id },
          transaction
        )
        expect(byItem.length).toBe(2)
        const byFeature = await selectSubscriptionItemFeatures(
          { featureId: toggleFeature.id },
          transaction
        )
        expect(byFeature.length).toBe(1)
        const byType = await selectSubscriptionItemFeatures(
          { type: FeatureType.Toggle },
          transaction
        )
        expect(byType[0].id).toBe(r1.id)
      })
    })
  })

  describe('selectSubscriptionItemFeaturesWithFeatureSlug', () => {
    it('joins slug and name correctly', async () => {
      await adminTransaction(async ({ transaction }) => {
        const inserted = await insertSubscriptionItemFeature(
          {
            type: FeatureType.Toggle,
            subscriptionItemId: subscriptionItem.id,
            featureId: toggleFeature.id,
            productFeatureId: toggleProductFeature.id,
            usageMeterId: null,
            amount: null,
            renewalFrequency: null,
            livemode: true,
          },
          transaction
        )
        const joined =
          await selectSubscriptionItemFeaturesWithFeatureSlug(
            { subscriptionItemId: subscriptionItem.id },
            transaction
          )
        expect(joined.length).toBe(1)
        expect((joined[0] as any).slug).toBe(toggleFeature.slug)
      })
    })
  })

  describe('upsert and bulkUpsert', () => {
    it('upserts single record', async () => {
      await adminTransaction(async ({ transaction }) => {
        const [up] =
          await upsertSubscriptionItemFeatureByProductFeatureIdAndSubscriptionId(
            {
              type: FeatureType.Toggle,
              subscriptionItemId: subscriptionItem.id,
              productFeatureId: toggleProductFeature.id,
              featureId: toggleFeature.id,
              usageMeterId: null,
              amount: null,
              renewalFrequency: null,
              livemode: true,
            },
            transaction
          )
        expect(up.id).toBeDefined()
      })
    })

    it('bulk upserts multiple records', async () => {
      await adminTransaction(async ({ transaction }) => {
        const inserts = [
          {
            type: FeatureType.Toggle,
            subscriptionItemId: subscriptionItem.id,
            productFeatureId: toggleProductFeature.id,
            featureId: toggleFeature.id,
            usageMeterId: null,
            amount: null,
            renewalFrequency: null,
            livemode: true,
          },
          {
            type: FeatureType.UsageCreditGrant,
            subscriptionItemId: subscriptionItem.id,
            productFeatureId: usageCreditGrantProductFeature.id,
            featureId: usageCreditGrantFeature.id,
            usageMeterId: usageMeter.id,
            amount: 10,
            renewalFrequency:
              FeatureUsageGrantFrequency.EveryBillingPeriod,
            livemode: true,
          },
        ]
        const results =
          await bulkUpsertSubscriptionItemFeaturesByProductFeatureIdAndSubscriptionId(
            inserts as any,
            transaction
          )
        expect(results.length).toBe(2)
      })
    })
  })

  describe('expire and detach helpers', () => {
    it('expires a single record via expireSubscriptionItemFeature', async () => {
      await adminTransaction(async ({ transaction }) => {
        const inserted = await insertSubscriptionItemFeature(
          {
            type: FeatureType.Toggle,
            subscriptionItemId: subscriptionItem.id,
            featureId: toggleFeature.id,
            productFeatureId: toggleProductFeature.id,
            usageMeterId: null,
            amount: null,
            renewalFrequency: null,
            livemode: true,
          },
          transaction
        )
        const now = new Date()
        const updated = await expireSubscriptionItemFeature(
          inserted,
          now,
          transaction
        )
        expect(updated.expiredAt).not.toBeNull()
        expect(updated.expiredAt).toBe(now.getTime())
      })
    })

    it('detaches matching productFeatureIds', async () => {
      await adminTransaction(async ({ transaction }) => {
        const rec1 = await insertSubscriptionItemFeature(
          {
            type: FeatureType.Toggle,
            subscriptionItemId: subscriptionItem.id,
            featureId: toggleFeature.id,
            productFeatureId: toggleProductFeature.id,
            usageMeterId: null,
            amount: null,
            renewalFrequency: null,
            livemode: true,
          },
          transaction
        )
        const rec2 = await insertSubscriptionItemFeature(
          {
            type: FeatureType.UsageCreditGrant,
            subscriptionItemId: subscriptionItem.id,
            featureId: usageCreditGrantFeature.id,
            productFeatureId: usageCreditGrantProductFeature.id,
            usageMeterId: usageMeter.id,
            amount: 100,
            renewalFrequency:
              FeatureUsageGrantFrequency.EveryBillingPeriod,
            livemode: true,
          },
          transaction
        )
        const detached =
          await detachSubscriptionItemFeaturesFromProductFeature(
            {
              productFeatureIds: [toggleProductFeature.id],
              detachedReason: 'test',
            },
            transaction
          )
        expect(detached.length).toBe(1)
        expect(detached[0].productFeatureId).toBeNull()
        expect(detached[0].detachedReason).toBe('test')
      })
    })
  })
})
