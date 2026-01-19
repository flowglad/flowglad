import { Result } from 'better-result'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPricingModel,
  setupProduct,
  setupProductFeature,
  setupResource,
  setupSubscription,
  setupSubscriptionItem,
  setupToggleFeature,
} from '@/../seedDatabase'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import type { Feature } from '@/db/schema/features'
import {
  resourceFeatureInsertSchema,
  resourceFeatureSelectSchema,
} from '@/db/schema/features'
import type { Organization } from '@/db/schema/organizations'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Resource } from '@/db/schema/resources'
import {
  createSubscriptionFeatureItems,
  subscriptionItemFeatureInsertFromSubscriptionItemAndFeature,
} from '@/subscriptions/subscriptionItemFeatureHelpers'
import { FeatureType, SubscriptionItemType } from '@/types'
import {
  insertFeature,
  selectFeatureById,
  selectFeatures,
  selectFeaturesTableRowData,
  updateFeatureTransaction,
} from './featureMethods'
import { selectProductFeatures } from './productFeatureMethods'
import {
  insertSubscriptionItemFeature,
  selectSubscriptionItemFeatures,
} from './subscriptionItemFeatureMethods'

describe('insertFeature uniqueness constraints', () => {
  let organization1: Organization.Record
  let pricingModel1: PricingModel.Record
  let organization2: Organization.Record
  let pricingModel2: PricingModel.Record

  beforeEach(async () => {
    const orgData1 = await setupOrg()
    organization1 = orgData1.organization
    pricingModel1 = orgData1.pricingModel

    const orgData2 = await setupOrg()
    organization2 = orgData2.organization
    pricingModel2 = orgData2.pricingModel
  })

  const createToggleFeatureInsert = (
    orgId: string,
    catId: string,
    slug: string,
    name: string
  ): Feature.ToggleInsert => ({
    organizationId: orgId,
    name,
    slug,
    pricingModelId: catId,
    livemode: true,
    description: 'A test feature',
    type: FeatureType.Toggle,
    active: true,
    amount: null,
    renewalFrequency: null,
    usageMeterId: null,
  })

  it('should not allow two features with the same slug, organizationId, and pricingModelId', async () => {
    ;(
      await adminTransaction(async ({ transaction }) => {
        await insertFeature(
          createToggleFeatureInsert(
            organization1.id,
            pricingModel1.id,
            'unique-slug',
            'Test Feature 1'
          ),
          transaction
        )
      })
    ).unwrap()

    await expect(
      adminTransaction(async ({ transaction }) => {
        await insertFeature(
          createToggleFeatureInsert(
            organization1.id,
            pricingModel1.id,
            'unique-slug',
            'Test Feature 2'
          ),
          transaction
        )
      })
    ).rejects.toThrow()
  })

  it('should allow two features with the same slug and organizationId but different pricingModelId', async () => {
    const newPricingModelForOrg1 = await setupPricingModel({
      organizationId: organization1.id,
      name: 'Second PricingModel for Org 1',
    })

    ;(
      await adminTransaction(async ({ transaction }) => {
        await insertFeature(
          createToggleFeatureInsert(
            organization1.id,
            pricingModel1.id,
            'same-slug',
            'Test Feature 1'
          ),
          transaction
        )
        await insertFeature(
          createToggleFeatureInsert(
            organization1.id,
            newPricingModelForOrg1.id,
            'same-slug',
            'Test Feature 2'
          ),
          transaction
        )
      })
    ).unwrap()

    const features = (
      await adminTransaction(async ({ transaction }) => {
        return selectFeatures(
          {
            organizationId: organization1.id,
            slug: 'same-slug',
          },
          transaction
        )
      })
    ).unwrap()
    expect(features.length).toBe(2)
  })

  it('should allow two features with the same slug but different organizationId', async () => {
    ;(
      await adminTransaction(async ({ transaction }) => {
        await insertFeature(
          createToggleFeatureInsert(
            organization1.id,
            pricingModel1.id,
            'same-slug',
            'Feature for Org 1'
          ),
          transaction
        )
        await insertFeature(
          createToggleFeatureInsert(
            organization2.id,
            pricingModel2.id,
            'same-slug',
            'Feature for Org 2'
          ),
          transaction
        )
      })
    ).unwrap()

    const featuresOrg1 = (
      await adminTransaction(async ({ transaction }) => {
        return selectFeatures(
          {
            organizationId: organization1.id,
            slug: 'same-slug',
          },
          transaction
        )
      })
    ).unwrap()
    const featuresOrg2 = (
      await adminTransaction(async ({ transaction }) => {
        return selectFeatures(
          {
            organizationId: organization2.id,
            slug: 'same-slug',
          },
          transaction
        )
      })
    ).unwrap()
    expect(featuresOrg1.length).toBe(1)
    expect(featuresOrg2.length).toBe(1)
  })

  it('should allow two features with different slugs for the same organization and pricingModel', async () => {
    ;(
      await adminTransaction(async ({ transaction }) => {
        await insertFeature(
          createToggleFeatureInsert(
            organization1.id,
            pricingModel1.id,
            'slug-1',
            'Test Feature 1'
          ),
          transaction
        )
        await insertFeature(
          createToggleFeatureInsert(
            organization1.id,
            pricingModel1.id,
            'slug-2',
            'Test Feature 2'
          ),
          transaction
        )
      })
    ).unwrap()

    const features = (
      await adminTransaction(async ({ transaction }) => {
        return selectFeatures(
          {
            organizationId: organization1.id,
            pricingModelId: pricingModel1.id,
          },
          transaction
        )
      })
    ).unwrap()
    expect(features.length).toBe(2)
  })
})

describe('updateFeatureTransaction - active state synchronization', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: any
  let price: any
  let feature: Feature.Record
  let productFeature: any
  let customer: any
  let paymentMethod: any
  let subscription: any
  let subscriptionItem: any

  beforeEach(async () => {
    // Setup organization and product
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product
    price = orgData.price

    // Create a feature
    feature = await setupToggleFeature({
      organizationId: organization.id,
      name: 'Test Feature',
      livemode: true,
      pricingModelId: pricingModel.id,
    })

    // Associate feature with product
    productFeature = await setupProductFeature({
      productId: product.id,
      featureId: feature.id,
      organizationId: organization.id,
    })

    // Setup customer and subscription
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
      priceId: price.id,
      name: 'Test Item',
      quantity: 1,
      unitPrice: price.unitPrice,
      type: SubscriptionItemType.Static,
    })
  })

  describe('when feature is deactivated (active: true → false)', () => {
    it('should expire all associated productFeatures', async () => {
      ;(
        await comprehensiveAdminTransaction(
          async ({ transaction, invalidateCache }) => {
            // Deactivate the feature
            await updateFeatureTransaction(
              {
                id: feature.id,
                type: FeatureType.Toggle,
                active: false,
              },
              { transaction, invalidateCache }
            )

            // Verify productFeature is now expired
            const productFeatures = await selectProductFeatures(
              { featureId: feature.id },
              transaction
            )

            expect(productFeatures.length).toBe(1)
            expect(typeof productFeatures[0].expiredAt).toBe('number')
            expect(productFeatures[0].expiredAt).toBeLessThanOrEqual(
              Date.now()
            )

            return Result.ok(undefined)
          }
        )
      ).unwrap()
    })

    it('should detach existing subscriptionItemFeatures but preserve them', async () => {
      ;(
        await comprehensiveAdminTransaction(
          async ({ transaction, invalidateCache }) => {
            // First create a subscriptionItemFeature
            const subscriptionItemFeatureInsert =
              subscriptionItemFeatureInsertFromSubscriptionItemAndFeature(
                {
                  subscriptionItem,
                  feature,
                  productFeature,
                }
              )
            const subscriptionItemFeature =
              await insertSubscriptionItemFeature(
                subscriptionItemFeatureInsert,
                transaction
              )

            expect(subscriptionItemFeature.productFeatureId).toBe(
              productFeature.id
            )

            // Deactivate the feature
            await updateFeatureTransaction(
              {
                id: feature.id,
                type: FeatureType.Toggle,
                active: false,
              },
              { transaction, invalidateCache }
            )

            // Verify subscriptionItemFeature is detached but preserved
            const detachedFeatures =
              await selectSubscriptionItemFeatures(
                { id: subscriptionItemFeature.id },
                transaction
              )

            expect(detachedFeatures.length).toBe(1)
            const detachedFeature = detachedFeatures[0]!
            expect(detachedFeature.productFeatureId).toBeNull()
            expect(typeof detachedFeature.detachedAt).toBe('number')
            expect(detachedFeature.detachedReason).toBe(
              'product_feature_expired'
            )
            expect(detachedFeature.featureId).toBe(feature.id) // Still has featureId
            expect(detachedFeature.expiredAt).toBeNull() // Not expired, just detached

            return Result.ok(undefined)
          }
        )
      ).unwrap()
    })

    it('should prevent new subscriptions from getting the feature', async () => {
      ;(
        await comprehensiveAdminTransaction(
          async ({ transaction, invalidateCache }) => {
            // Deactivate the feature
            await updateFeatureTransaction(
              {
                id: feature.id,
                type: FeatureType.Toggle,
                active: false,
              },
              { transaction, invalidateCache }
            )

            // Try to create subscription features for a new subscription item
            const newSubscriptionItem = await setupSubscriptionItem({
              subscriptionId: subscription.id,
              priceId: price.id,
              name: 'New Item',
              quantity: 1,
              unitPrice: price.unitPrice,
              type: SubscriptionItemType.Static,
            })

            const createdFeatures =
              await createSubscriptionFeatureItems(
                [newSubscriptionItem],
                transaction
              )

            // Should not create any features because the productFeature is expired
            expect(createdFeatures.length).toBe(0)

            return Result.ok(undefined)
          }
        )
      ).unwrap()
    })
  })

  describe('when feature is reactivated (active: false → true)', () => {
    beforeEach(async () => {
      // First deactivate the feature
      ;(
        await comprehensiveAdminTransaction(
          async ({ transaction, invalidateCache }) => {
            await updateFeatureTransaction(
              {
                id: feature.id,
                type: FeatureType.Toggle,
                active: false,
              },
              { transaction, invalidateCache }
            )
            return Result.ok(undefined)
          }
        )
      ).unwrap()
    })

    it('should unexpire all associated productFeatures', async () => {
      ;(
        await comprehensiveAdminTransaction(
          async ({ transaction, invalidateCache }) => {
            // Verify it's expired first
            const expiredFeatures = await selectProductFeatures(
              { featureId: feature.id },
              transaction
            )
            expect(typeof expiredFeatures[0].expiredAt).toBe('number')

            // Reactivate the feature
            await updateFeatureTransaction(
              {
                id: feature.id,
                type: FeatureType.Toggle,
                active: true,
              },
              { transaction, invalidateCache }
            )

            // Verify productFeature is now unexpired
            const productFeatures = await selectProductFeatures(
              { featureId: feature.id },
              transaction
            )

            expect(productFeatures.length).toBe(1)
            // expiredAt can be null or 0 (epoch) due to timestamptzMs type conversion
            expect([null, 0]).toContain(productFeatures[0].expiredAt)

            return Result.ok(undefined)
          }
        )
      ).unwrap()
    })

    it('should allow new subscriptions to get the feature again', async () => {
      ;(
        await comprehensiveAdminTransaction(
          async ({ transaction, invalidateCache }) => {
            // Reactivate the feature
            await updateFeatureTransaction(
              {
                id: feature.id,
                type: FeatureType.Toggle,
                active: true,
              },
              { transaction, invalidateCache }
            )

            // Create subscription features for a new subscription item
            const newSubscriptionItem = await setupSubscriptionItem({
              subscriptionId: subscription.id,
              priceId: price.id,
              name: 'New Item After Reactivation',
              quantity: 1,
              unitPrice: price.unitPrice,
              type: SubscriptionItemType.Static,
            })

            const createdFeatures =
              await createSubscriptionFeatureItems(
                [newSubscriptionItem],
                transaction
              )

            // Should create the feature because productFeature is unexpired
            expect(createdFeatures.length).toBeGreaterThan(0)
            expect(createdFeatures[0].featureId).toBe(feature.id)

            return Result.ok(undefined)
          }
        )
      ).unwrap()
    })

    it('should NOT automatically grant feature to subscriptions created while inactive', async () => {
      ;(
        await comprehensiveAdminTransaction(
          async ({ transaction, invalidateCache }) => {
            // Create a subscription item while feature is inactive
            const itemWhileInactive = await setupSubscriptionItem({
              subscriptionId: subscription.id,
              priceId: price.id,
              name: 'Item Created While Inactive',
              quantity: 1,
              unitPrice: price.unitPrice,
              type: SubscriptionItemType.Static,
            })

            const featuresWhileInactive =
              await createSubscriptionFeatureItems(
                [itemWhileInactive],
                transaction
              )

            // Should not have the feature
            expect(featuresWhileInactive.length).toBe(0)

            // Reactivate the feature
            await updateFeatureTransaction(
              {
                id: feature.id,
                type: FeatureType.Toggle,
                active: true,
              },
              { transaction, invalidateCache }
            )

            // Verify the old subscription item still doesn't have it
            const existingFeatures =
              await selectSubscriptionItemFeatures(
                { subscriptionItemId: itemWhileInactive.id },
                transaction
              )

            // Still no features for this subscription item
            expect(existingFeatures.length).toBe(0)

            return Result.ok(undefined)
          }
        )
      ).unwrap()
    })
  })

  describe('when active field is not changed', () => {
    it('should not trigger productFeature sync when updating other fields', async () => {
      ;(
        await comprehensiveAdminTransaction(
          async ({ transaction, invalidateCache }) => {
            // Get initial state
            const initialProductFeatures =
              await selectProductFeatures(
                { featureId: feature.id },
                transaction
              )
            const initialExpiredAt =
              initialProductFeatures[0].expiredAt

            // Update feature but not the active field
            await updateFeatureTransaction(
              {
                id: feature.id,
                type: FeatureType.Toggle,
                name: 'Updated Name',
                description: 'Updated description',
              },
              { transaction, invalidateCache }
            )

            // Verify productFeature expiredAt hasn't changed
            const productFeatures = await selectProductFeatures(
              { featureId: feature.id },
              transaction
            )

            expect(productFeatures[0].expiredAt).toBe(
              initialExpiredAt
            )

            return Result.ok(undefined)
          }
        )
      ).unwrap()
    })
  })
})

describe('selectFeaturesTableRowData search', () => {
  it('should search by name, slug, or exact ID (case-insensitive, trims whitespace)', async () => {
    const { organization, pricingModel } = await setupOrg()

    const feature = await setupToggleFeature({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Premium Feature',
      slug: 'premium-feature-slug',
      livemode: true,
    })

    ;(
      await adminTransaction(async ({ transaction }) => {
        // Search by name (case-insensitive)
        const byName = await selectFeaturesTableRowData({
          input: {
            pageSize: 10,
            searchQuery: 'PREMIUM',
            filters: { organizationId: organization.id },
          },
          transaction,
        })
        expect(
          byName.items.some((i) => i.feature.id === feature.id)
        ).toBe(true)

        // Search by slug
        const bySlug = await selectFeaturesTableRowData({
          input: {
            pageSize: 10,
            searchQuery: 'premium-feature',
            filters: { organizationId: organization.id },
          },
          transaction,
        })
        expect(
          bySlug.items.some((i) => i.feature.id === feature.id)
        ).toBe(true)

        // Search by exact ID with whitespace trimming
        const byId = await selectFeaturesTableRowData({
          input: {
            pageSize: 10,
            searchQuery: `  ${feature.id}  `,
            filters: { organizationId: organization.id },
          },
          transaction,
        })
        expect(byId.items.length).toBe(1)
        expect(byId.items[0].feature.id).toBe(feature.id)
      })
    ).unwrap()
  })

  it('should return all features when search query is empty or undefined', async () => {
    const { organization, pricingModel } = await setupOrg()

    await setupToggleFeature({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Test Feature',
      livemode: true,
    })

    ;(
      await adminTransaction(async ({ transaction }) => {
        const resultEmpty = await selectFeaturesTableRowData({
          input: {
            pageSize: 10,
            searchQuery: '',
            filters: { organizationId: organization.id },
          },
          transaction,
        })

        const resultUndefined = await selectFeaturesTableRowData({
          input: {
            pageSize: 10,
            searchQuery: undefined,
            filters: { organizationId: organization.id },
          },
          transaction,
        })

        expect(resultEmpty.items.length).toBeGreaterThanOrEqual(1)
        expect(resultEmpty.total).toBe(resultUndefined.total)
      })
    ).unwrap()
  })
})

describe('Resource Feature schema and methods', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let resource: Resource.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel

    resource = await setupResource({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      slug: 'seats',
      name: 'Seats',
    })
  })

  const createResourceFeatureInsert = (params?: {
    resourceId?: string
    amount?: number
    slug?: string
  }): Feature.ResourceInsert => ({
    organizationId: organization.id,
    pricingModelId: pricingModel.id,
    type: FeatureType.Resource,
    name: 'Resource Feature',
    slug: params?.slug ?? 'resource-feature-slug',
    description: 'A resource feature for testing',
    amount: params?.amount ?? 5,
    resourceId: params?.resourceId ?? resource.id,
    usageMeterId: null,
    renewalFrequency: null,
    livemode: true,
    active: true,
  })

  describe('insertFeature for Resource type', () => {
    it('should insert a resource feature with required fields: type=Resource, resourceId, and positive amount', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          const inserted = await insertFeature(
            createResourceFeatureInsert({
              resourceId: resource.id,
              amount: 10,
            }),
            transaction
          )

          expect(inserted.id).toMatch(/^feature_/)
          expect(inserted.type).toBe(FeatureType.Resource)
          expect(inserted.resourceId).toBe(resource.id)
          expect(inserted.amount).toBe(10)
          expect(inserted.usageMeterId).toBeNull()
          expect(inserted.renewalFrequency).toBeNull()
          expect(inserted.organizationId).toBe(organization.id)
          expect(inserted.pricingModelId).toBe(pricingModel.id)
        })
      ).unwrap()
    })

    it('should select a resource feature by id and return the complete record', async () => {
      const inserted = (
        await adminTransaction(async ({ transaction }) => {
          return insertFeature(
            createResourceFeatureInsert(),
            transaction
          )
        })
      ).unwrap()

      ;(
        await adminTransaction(async ({ transaction }) => {
          const selected = await selectFeatureById(
            inserted.id,
            transaction
          )

          expect(selected.id).toBe(inserted.id)
          expect(selected.type).toBe(FeatureType.Resource)
          expect(selected.resourceId).toBe(resource.id)
          expect(selected.amount).toBe(5)
        })
      ).unwrap()
    })
  })

  describe('resourceFeatureInsertSchema validation', () => {
    it('should reject resource feature without resourceId', () => {
      const invalidFeature = {
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        type: FeatureType.Resource,
        name: 'Invalid Resource Feature',
        slug: 'invalid-resource-feature',
        description: 'A resource feature without resourceId',
        amount: 5,
        resourceId: null, // Invalid: resourceId is required
        usageMeterId: null,
        renewalFrequency: null,
        livemode: true,
        active: true,
      }

      const result =
        resourceFeatureInsertSchema.safeParse(invalidFeature)
      expect(result.success).toBe(false)
    })

    it('should reject resource feature with usageMeterId set (usageMeterId must be null)', () => {
      const invalidFeature = {
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        type: FeatureType.Resource,
        name: 'Invalid Resource Feature',
        slug: 'invalid-resource-feature-with-usage-meter',
        description: 'A resource feature with usageMeterId',
        amount: 5,
        resourceId: resource.id,
        usageMeterId: 'some-usage-meter-id', // Invalid: must be null for Resource type
        renewalFrequency: null,
        livemode: true,
        active: true,
      }

      const result =
        resourceFeatureInsertSchema.safeParse(invalidFeature)
      expect(result.success).toBe(false)
    })

    it('should reject resource feature with renewalFrequency set (renewalFrequency must be null)', () => {
      const invalidFeature = {
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        type: FeatureType.Resource,
        name: 'Invalid Resource Feature',
        slug: 'invalid-resource-feature-with-renewal',
        description: 'A resource feature with renewalFrequency',
        amount: 5,
        resourceId: resource.id,
        usageMeterId: null,
        renewalFrequency: 'EveryBillingPeriod', // Invalid: must be null for Resource type
        livemode: true,
        active: true,
      }

      const result =
        resourceFeatureInsertSchema.safeParse(invalidFeature)
      expect(result.success).toBe(false)
    })

    it('should require a positive amount for resource features', () => {
      const featureWithZeroAmount = {
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        type: FeatureType.Resource,
        name: 'Resource Feature Zero Amount',
        slug: 'resource-feature-zero',
        description: 'A resource feature with zero amount',
        amount: 0, // Invalid: should be positive
        resourceId: resource.id,
        usageMeterId: null,
        renewalFrequency: null,
        livemode: true,
        active: true,
      }

      const result = resourceFeatureInsertSchema.safeParse(
        featureWithZeroAmount
      )
      expect(result.success).toBe(false)
    })

    it('should validate a correct resource feature', () => {
      const validFeature = {
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        type: FeatureType.Resource,
        name: 'Valid Resource Feature',
        slug: 'valid-resource-feature',
        description: 'A valid resource feature',
        amount: 5,
        resourceId: resource.id,
        usageMeterId: null,
        renewalFrequency: null,
        livemode: true,
        active: true,
      }

      const result =
        resourceFeatureInsertSchema.safeParse(validFeature)
      expect(result.success).toBe(true)
    })
  })

  describe('resourceFeatureSelectSchema validation', () => {
    it('should validate a selected resource feature record with type=Resource', async () => {
      const inserted = (
        await adminTransaction(async ({ transaction }) => {
          return insertFeature(
            createResourceFeatureInsert(),
            transaction
          )
        })
      ).unwrap()

      const result = resourceFeatureSelectSchema.safeParse(inserted)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.type).toBe(FeatureType.Resource)
        expect(result.data.resourceId).toBe(resource.id)
      }
    })
  })
})
