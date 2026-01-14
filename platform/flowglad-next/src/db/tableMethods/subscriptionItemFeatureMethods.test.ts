import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupProductFeature,
  setupResource,
  setupSubscription,
  setupSubscriptionItem,
  setupTestFeaturesAndProductFeatures,
  setupUsageMeter,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  resourceSubscriptionItemFeatureClientSelectSchema,
  resourceSubscriptionItemFeatureInsertSchema,
  resourceSubscriptionItemFeatureSelectSchema,
  type SubscriptionItemFeature,
} from '@/db/schema/subscriptionItemFeatures'
import {
  CurrencyCode,
  FeatureType,
  FeatureUsageGrantFrequency,
  PriceType,
  SubscriptionItemType,
} from '@/types'
import core from '@/utils/core'
import type { Customer } from '../schema/customers'
import { Feature } from '../schema/features'
import type { Organization } from '../schema/organizations'
import type { Price } from '../schema/prices'
import type { PricingModel } from '../schema/pricingModels'
import type { ProductFeature } from '../schema/productFeatures'
import type { Product } from '../schema/products'
import type { Resource } from '../schema/resources'
import type { SubscriptionItem } from '../schema/subscriptionItems'
import type { Subscription } from '../schema/subscriptions'
import { insertFeature } from './featureMethods'
import {
  bulkUpsertSubscriptionItemFeaturesByProductFeatureIdAndSubscriptionId,
  detachSubscriptionItemFeaturesFromProductFeature,
  expireSubscriptionItemFeature,
  expireSubscriptionItemFeaturesForSubscriptionItems,
  insertSubscriptionItemFeature,
  selectClientSubscriptionItemFeatureAndFeatureById,
  selectSubscriptionItemFeatureById,
  selectSubscriptionItemFeatures,
  selectSubscriptionItemFeaturesWithFeatureSlug,
  updateSubscriptionItemFeature,
  upsertSubscriptionItemFeatureByProductFeatureIdAndSubscriptionId,
} from './subscriptionItemFeatureMethods'

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
        expect(typeof inserted.id).toBe('string')
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
          expect(u.expiredAt).toBe(date.getTime())
        })
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
        expect(joined[0].slug).toBe(toggleFeature.slug)
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
        expect(typeof up.id).toBe('string')
      })
    })

    it('bulk upserts multiple records', async () => {
      await adminTransaction(async ({ transaction }) => {
        const inserts: SubscriptionItemFeature.Insert[] = [
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
            inserts,
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
        expect(typeof updated.expiredAt).toBe('number')
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

// Tests for pricingModelId derivation functionality added in Wave 4
describe('pricingModelId derivation', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let subscription: Subscription.Record
  let subscriptionItem: SubscriptionItem.Record
  let feature: Feature.Record
  let productFeature: ProductFeature.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product

    price = await setupPrice({
      productId: product.id,
      name: 'Test Price for pricingModelId',
      unitPrice: 1000,
      type: PriceType.Subscription,
      livemode: true,
      isDefault: false,
      currency: CurrencyCode.USD,
    })

    customer = await setupCustomer({
      organizationId: organization.id,
      email: 'test-pricing-model@test.com',
      livemode: true,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
    })

    subscriptionItem = await setupSubscriptionItem({
      subscriptionId: subscription.id,
      name: 'Test Subscription Item',
      quantity: 1,
      unitPrice: 1000,
      priceId: price.id,
    })

    const featureData = await setupTestFeaturesAndProductFeatures({
      organizationId: organization.id,
      productId: product.id,
      livemode: true,
      featureSpecs: [
        { name: 'Test Toggle Feature', type: FeatureType.Toggle },
      ],
    })
    ;[{ feature, productFeature }] = featureData
  })

  describe('insertSubscriptionItemFeature', () => {
    it('should derive pricingModelId from subscription item', async () => {
      await adminTransaction(async ({ transaction }) => {
        const subscriptionItemFeature =
          await insertSubscriptionItemFeature(
            {
              subscriptionItemId: subscriptionItem.id,
              featureId: feature.id,
              productFeatureId: productFeature.id,
              type: FeatureType.Toggle,
              livemode: true,
            },
            transaction
          )

        expect(subscriptionItemFeature.pricingModelId).toBe(
          subscriptionItem.pricingModelId
        )
        expect(subscriptionItemFeature.pricingModelId).toBe(
          pricingModel.id
        )
      })
    })

    it('should use provided pricingModelId without derivation', async () => {
      await adminTransaction(async ({ transaction }) => {
        const subscriptionItemFeature =
          await insertSubscriptionItemFeature(
            {
              subscriptionItemId: subscriptionItem.id,
              featureId: feature.id,
              productFeatureId: productFeature.id,
              type: FeatureType.Toggle,
              livemode: true,
              pricingModelId: pricingModel.id,
            },
            transaction
          )

        expect(subscriptionItemFeature.pricingModelId).toBe(
          pricingModel.id
        )
      })
    })

    it('should throw error when subscription item does not exist', async () => {
      await adminTransaction(async ({ transaction }) => {
        const nonExistentSubscriptionItemId = `si_${core.nanoid()}`

        await expect(
          insertSubscriptionItemFeature(
            {
              subscriptionItemId: nonExistentSubscriptionItemId,
              featureId: feature.id,
              productFeatureId: productFeature.id,
              type: FeatureType.Toggle,
              livemode: true,
            },
            transaction
          )
        ).rejects.toThrow()
      })
    })
  })

  describe('bulkUpsertSubscriptionItemFeaturesByProductFeatureIdAndSubscriptionId', () => {
    it('should derive pricingModelId for each feature in bulk upsert', async () => {
      await adminTransaction(async ({ transaction }) => {
        const subscriptionItemFeatures =
          await bulkUpsertSubscriptionItemFeaturesByProductFeatureIdAndSubscriptionId(
            [
              {
                subscriptionItemId: subscriptionItem.id,
                featureId: feature.id,
                productFeatureId: productFeature.id,
                type: FeatureType.Toggle,
                livemode: true,
              },
            ],
            transaction
          )

        expect(subscriptionItemFeatures).toHaveLength(1)
        expect(subscriptionItemFeatures[0].pricingModelId).toBe(
          subscriptionItem.pricingModelId
        )
        expect(subscriptionItemFeatures[0].pricingModelId).toBe(
          pricingModel.id
        )
      })
    })

    it('should throw error when one subscription item does not exist in bulk upsert', async () => {
      await adminTransaction(async ({ transaction }) => {
        const nonExistentSubscriptionItemId = `si_${core.nanoid()}`

        await expect(
          bulkUpsertSubscriptionItemFeaturesByProductFeatureIdAndSubscriptionId(
            [
              {
                subscriptionItemId: subscriptionItem.id,
                featureId: feature.id,
                productFeatureId: productFeature.id,
                type: FeatureType.Toggle,
                livemode: true,
              },
              {
                subscriptionItemId: nonExistentSubscriptionItemId,
                featureId: feature.id,
                productFeatureId: productFeature.id,
                type: FeatureType.Toggle,
                livemode: true,
              },
            ],
            transaction
          )
        ).rejects.toThrow()
      })
    })
  })
})

describe('Resource SubscriptionItemFeature schema and methods', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let subscription: Subscription.Record
  let subscriptionItem: SubscriptionItem.Record
  let resource: Resource.Record
  let resourceFeature: Feature.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product

    price = await setupPrice({
      productId: product.id,
      name: 'Test Price for Resource',
      unitPrice: 1000,
      type: PriceType.Subscription,
      livemode: true,
      isDefault: false,
      currency: CurrencyCode.USD,
    })

    customer = await setupCustomer({
      organizationId: organization.id,
      email: 'test-resource@test.com',
      livemode: true,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
    })

    subscriptionItem = await setupSubscriptionItem({
      subscriptionId: subscription.id,
      name: 'Test Subscription Item for Resource',
      quantity: 1,
      unitPrice: 1000,
      priceId: price.id,
    })

    // Create a resource
    resource = await setupResource({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      slug: 'team-seats',
      name: 'Team Seats',
    })

    // Create a resource feature
    resourceFeature = await adminTransaction(
      async ({ transaction }) => {
        return insertFeature(
          {
            organizationId: organization.id,
            pricingModelId: pricingModel.id,
            type: FeatureType.Resource,
            name: 'Team Seats Feature',
            slug: 'team-seats-feature',
            description: 'Resource feature for team seats',
            amount: 5,
            usageMeterId: null,
            renewalFrequency: null,
            resourceId: resource.id,
            livemode: true,
            active: true,
          },
          transaction
        )
      }
    )
  })

  describe('insertSubscriptionItemFeature for Resource type', () => {
    it('should insert a resource subscription item feature with type=Resource, resourceId, and amount', async () => {
      await adminTransaction(async ({ transaction }) => {
        const inserted = await insertSubscriptionItemFeature(
          {
            type: FeatureType.Resource,
            subscriptionItemId: subscriptionItem.id,
            featureId: resourceFeature.id,
            productFeatureId: null,
            resourceId: resource.id,
            amount: 10,
            usageMeterId: null,
            renewalFrequency: null,
            livemode: true,
            pricingModelId: pricingModel.id,
          },
          transaction
        )

        expect(inserted.id).toMatch(/^sub_feature_/)
        expect(inserted.type).toBe(FeatureType.Resource)
        expect(inserted.resourceId).toBe(resource.id)
        expect(inserted.amount).toBe(10)
        expect(inserted.usageMeterId).toBeNull()
        expect(inserted.renewalFrequency).toBeNull()
        expect(inserted.subscriptionItemId).toBe(subscriptionItem.id)
        expect(inserted.featureId).toBe(resourceFeature.id)
      })
    })

    it('should select a resource subscription item feature by id', async () => {
      const inserted = await adminTransaction(
        async ({ transaction }) => {
          return insertSubscriptionItemFeature(
            {
              type: FeatureType.Resource,
              subscriptionItemId: subscriptionItem.id,
              featureId: resourceFeature.id,
              productFeatureId: null,
              resourceId: resource.id,
              amount: 5,
              usageMeterId: null,
              renewalFrequency: null,
              livemode: true,
              pricingModelId: pricingModel.id,
            },
            transaction
          )
        }
      )

      await adminTransaction(async ({ transaction }) => {
        const selected = await selectSubscriptionItemFeatureById(
          inserted.id,
          transaction
        )

        expect(selected.id).toBe(inserted.id)
        expect(selected.type).toBe(FeatureType.Resource)
        expect(selected.resourceId).toBe(resource.id)
        expect(selected.amount).toBe(5)
      })
    })
  })

  describe('resourceSubscriptionItemFeatureInsertSchema validation', () => {
    it('should reject resource subscription item feature without resourceId', () => {
      const invalidFeature = {
        type: FeatureType.Resource,
        subscriptionItemId: subscriptionItem.id,
        featureId: resourceFeature.id,
        productFeatureId: null,
        resourceId: null, // Invalid: resourceId is required for Resource type
        amount: 5,
        usageMeterId: null,
        renewalFrequency: null,
        livemode: true,
        pricingModelId: pricingModel.id,
      }

      const result =
        resourceSubscriptionItemFeatureInsertSchema.safeParse(
          invalidFeature
        )
      expect(result.success).toBe(false)
    })

    it('should reject resource subscription item feature with usageMeterId set', () => {
      const invalidFeature = {
        type: FeatureType.Resource,
        subscriptionItemId: subscriptionItem.id,
        featureId: resourceFeature.id,
        productFeatureId: null,
        resourceId: resource.id,
        amount: 5,
        usageMeterId: 'some-meter-id', // Invalid: must be null for Resource type
        renewalFrequency: null,
        livemode: true,
        pricingModelId: pricingModel.id,
      }

      const result =
        resourceSubscriptionItemFeatureInsertSchema.safeParse(
          invalidFeature
        )
      expect(result.success).toBe(false)
    })

    it('should reject resource subscription item feature with renewalFrequency set', () => {
      const invalidFeature = {
        type: FeatureType.Resource,
        subscriptionItemId: subscriptionItem.id,
        featureId: resourceFeature.id,
        productFeatureId: null,
        resourceId: resource.id,
        amount: 5,
        usageMeterId: null,
        renewalFrequency:
          FeatureUsageGrantFrequency.EveryBillingPeriod, // Invalid: must be null for Resource type
        livemode: true,
        pricingModelId: pricingModel.id,
      }

      const result =
        resourceSubscriptionItemFeatureInsertSchema.safeParse(
          invalidFeature
        )
      expect(result.success).toBe(false)
    })

    it('should validate a correct resource subscription item feature', () => {
      const validFeature = {
        type: FeatureType.Resource,
        subscriptionItemId: subscriptionItem.id,
        featureId: resourceFeature.id,
        productFeatureId: null,
        resourceId: resource.id,
        amount: 5,
        usageMeterId: null,
        renewalFrequency: null,
        livemode: true,
        pricingModelId: pricingModel.id,
      }

      const result =
        resourceSubscriptionItemFeatureInsertSchema.safeParse(
          validFeature
        )
      expect(result.success).toBe(true)
    })
  })

  describe('resourceSubscriptionItemFeatureSelectSchema validation', () => {
    it('should validate a selected resource subscription item feature with resourceId in the record', async () => {
      const inserted = await adminTransaction(
        async ({ transaction }) => {
          return insertSubscriptionItemFeature(
            {
              type: FeatureType.Resource,
              subscriptionItemId: subscriptionItem.id,
              featureId: resourceFeature.id,
              productFeatureId: null,
              resourceId: resource.id,
              amount: 5,
              usageMeterId: null,
              renewalFrequency: null,
              livemode: true,
              pricingModelId: pricingModel.id,
            },
            transaction
          )
        }
      )

      const result =
        resourceSubscriptionItemFeatureSelectSchema.safeParse(
          inserted
        )
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.type).toBe(FeatureType.Resource)
        expect(result.data.resourceId).toBe(resource.id)
        expect(result.data.amount).toBe(5)
      }
    })
  })

  describe('resourceSubscriptionItemFeatureClientSelectSchema validation', () => {
    it('should include resourceId in client select schema', async () => {
      const inserted = await adminTransaction(
        async ({ transaction }) => {
          return insertSubscriptionItemFeature(
            {
              type: FeatureType.Resource,
              subscriptionItemId: subscriptionItem.id,
              featureId: resourceFeature.id,
              productFeatureId: null,
              resourceId: resource.id,
              amount: 5,
              usageMeterId: null,
              renewalFrequency: null,
              livemode: true,
              pricingModelId: pricingModel.id,
            },
            transaction
          )
        }
      )

      // The client select schema expects name and slug from the joined feature
      const clientRecord = {
        ...inserted,
        name: resourceFeature.name,
        slug: (resourceFeature as Feature.ResourceRecord).slug,
      }

      const result =
        resourceSubscriptionItemFeatureClientSelectSchema.safeParse(
          clientRecord
        )
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.type).toBe(FeatureType.Resource)
        expect(result.data.resourceId).toBe(resource.id)
        expect(result.data.name).toBe(resourceFeature.name)
        expect(result.data.slug).toBe(
          (resourceFeature as Feature.ResourceRecord).slug
        )
      }
    })
  })

  describe('selectSubscriptionItemFeatures filtering by type', () => {
    it('should filter subscription item features by type=Resource', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Insert a Resource subscription item feature
        await insertSubscriptionItemFeature(
          {
            type: FeatureType.Resource,
            subscriptionItemId: subscriptionItem.id,
            featureId: resourceFeature.id,
            productFeatureId: null,
            resourceId: resource.id,
            amount: 5,
            usageMeterId: null,
            renewalFrequency: null,
            livemode: true,
            pricingModelId: pricingModel.id,
          },
          transaction
        )

        const resourceFeatures = await selectSubscriptionItemFeatures(
          { type: FeatureType.Resource },
          transaction
        )

        expect(resourceFeatures.length).toBeGreaterThanOrEqual(1)
        expect(
          resourceFeatures.every(
            (f) => f.type === FeatureType.Resource
          )
        ).toBe(true)
        expect(
          resourceFeatures.every((f) => f.resourceId !== null)
        ).toBe(true)
      })
    })
  })
})

/**
 * Basic unit tests for selectSubscriptionItemFeaturesWithFeatureSlug.
 *
 * These tests verify the function returns correct data.
 * Cache behavior is tested in integration tests (cache.integration.test.ts)
 * since unit tests use a no-op Redis stub.
 */
describe('selectSubscriptionItemFeaturesWithFeatureSlug', () => {
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let subscription: Subscription.Record
  let subscriptionItem: SubscriptionItem.Record
  let toggleFeature: Feature.Record
  let toggleProductFeature: ProductFeature.Record

  beforeEach(async () => {
    // Each test uses its own unique subscriptionItem.id, so no global cleanup needed
    const orgData = await setupOrg()
    product = orgData.product

    price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      unitPrice: 1000,
      type: PriceType.Subscription,
      livemode: true,
      isDefault: false,
      currency: CurrencyCode.USD,
    })

    customer = await setupCustomer({
      organizationId: orgData.organization.id,
      email: 'cached-test@test.com',
      livemode: true,
    })

    subscription = await setupSubscription({
      organizationId: orgData.organization.id,
      customerId: customer.id,
      priceId: price.id,
    })

    subscriptionItem = await setupSubscriptionItem({
      subscriptionId: subscription.id,
      name: 'Test Subscription Item',
      quantity: 1,
      unitPrice: 1000,
      priceId: price.id,
    })

    const featureData = await setupTestFeaturesAndProductFeatures({
      organizationId: orgData.organization.id,
      productId: product.id,
      livemode: true,
      featureSpecs: [
        { name: 'Toggle Feature', type: FeatureType.Toggle },
      ],
    })
    ;[
      {
        feature: toggleFeature,
        productFeature: toggleProductFeature,
      },
    ] = featureData
  })

  it('returns features with name and slug for a subscription item', async () => {
    await adminTransaction(async ({ transaction }) => {
      // Insert a subscription item feature
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

      const features =
        await selectSubscriptionItemFeaturesWithFeatureSlug(
          { subscriptionItemId: subscriptionItem.id },
          transaction
        )

      expect(features.length).toBe(1)
      expect(features[0].subscriptionItemId).toBe(subscriptionItem.id)
      expect(features[0].featureId).toBe(toggleFeature.id)
      expect(features[0].name).toBe(toggleFeature.name)
      expect(features[0].slug).toBe(toggleFeature.slug)
      expect(features[0].type).toBe(FeatureType.Toggle)
    })
  })

  it('returns empty array for subscription item with no features', async () => {
    await adminTransaction(async ({ transaction }) => {
      const features =
        await selectSubscriptionItemFeaturesWithFeatureSlug(
          { subscriptionItemId: subscriptionItem.id },
          transaction
        )

      expect(features).toEqual([])
    })
  })
})
