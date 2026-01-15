import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupBillingPeriod,
  setupBillingRun,
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupPricingModel,
  setupProduct,
  setupProductFeature,
  setupSubscription,
  setupSubscriptionItem,
  setupSubscriptionItemFeature,
  setupUsageCreditGrantFeature,
  setupUsageMeter,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Customer } from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import type { Price } from '@/db/schema/prices'
import {
  type PricingModel,
  pricingModels,
} from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import type { Subscription } from '@/db/schema/subscriptions'
import { selectBillingPeriodById } from '@/db/tableMethods/billingPeriodMethods'
import { selectBillingRunById } from '@/db/tableMethods/billingRunMethods'
import {
  selectCustomerById,
  updateCustomer,
} from '@/db/tableMethods/customerMethods'
import { selectPricingModelById } from '@/db/tableMethods/pricingModelMethods'
import { selectSubscriptionItemFeatures } from '@/db/tableMethods/subscriptionItemFeatureMethods'
import { selectSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods'
import {
  currentSubscriptionStatuses,
  selectSubscriptions,
} from '@/db/tableMethods/subscriptionMethods'
import {
  migrateCustomerPricingModelProcedureTransaction,
  migratePricingModelForCustomer,
} from '@/subscriptions/migratePricingModel'
import {
  createCapturingCallbacks,
  createCapturingEffectsContext,
  createDiscardingEffectsContext,
  noopEmitEvent,
  noopEnqueueLedgerCommand,
  noopInvalidateCache,
} from '@/test-utils/transactionCallbacks'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  CancellationReason,
  FeatureType,
  FeatureUsageGrantFrequency,
  IntervalUnit,
  PriceType,
  SubscriptionItemType,
  SubscriptionStatus,
} from '@/types'
import { customerBillingTransaction } from '@/utils/bookkeeping/customerBilling'
import { CacheDependency } from '@/utils/cache'

describe('Pricing Model Migration Test Suite', async () => {
  const { organization, price: orgDefaultPrice } = await setupOrg()
  let customer: Customer.Record
  let pricingModel1: PricingModel.Record
  let pricingModel2: PricingModel.Record
  let product1: Product.Record
  let product2: Product.Record
  let price1: Price.Record
  let price2: Price.Record

  beforeEach(async () => {
    // Setup two pricing models
    pricingModel1 = await setupPricingModel({
      organizationId: organization.id,
      name: 'Pricing Model 1',
    })

    pricingModel2 = await setupPricingModel({
      organizationId: organization.id,
      name: 'Pricing Model 2',
    })

    // Setup products and prices on each pricing model
    product1 = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel1.id,
      name: 'Product 1',
      default: true,
    })

    price1 = await setupPrice({
      name: 'Free Plan Price 1',
      livemode: false,
      productId: product1.id,
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 0, // Free plan
      isDefault: true,
    })

    product2 = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel2.id,
      name: 'Product 2',
      default: true,
    })

    price2 = await setupPrice({
      name: 'Free Plan Price 2',
      livemode: false,
      productId: product2.id,
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 0, // Free plan
      isDefault: true,
    })

    // Setup customer on pricing model 1
    customer = await setupCustomer({
      organizationId: organization.id,
      pricingModelId: pricingModel1.id,
    })
  })

  describe('Basic Migration Scenarios', () => {
    it('should migrate customer with single free plan to a default subscription on the new pricing model', async () => {
      // Setup: Customer has default free subscription on pricing model 1
      const freeSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price1.id,
        status: SubscriptionStatus.Active,
      })

      // Execute migration
      const { result, effects } = await adminTransaction(
        async ({ transaction }) => {
          const { ctx, effects } =
            createCapturingEffectsContext(transaction)
          const result = await migratePricingModelForCustomer(
            {
              customer,
              oldPricingModelId: pricingModel1.id,
              newPricingModelId: pricingModel2.id,
            },
            ctx
          )
          return { result, effects }
        }
      )

      // Verify customer's pricingModelId was updated
      expect(result.unwrap().customer.pricingModelId).toBe(
        pricingModel2.id
      )

      // Verify old subscription was canceled
      expect(result.unwrap().canceledSubscriptions).toHaveLength(1)
      expect(result.unwrap().canceledSubscriptions[0].id).toBe(
        freeSubscription.id
      )
      expect(result.unwrap().canceledSubscriptions[0].status).toBe(
        SubscriptionStatus.Canceled
      )
      expect(
        result.unwrap().canceledSubscriptions[0].cancellationReason
      ).toBe(CancellationReason.PricingModelMigration)

      // Verify new subscription was created
      expect(result.unwrap().newSubscription).toMatchObject({})
      expect(result.unwrap().newSubscription.customerId).toBe(
        customer.id
      )
      expect(result.unwrap().newSubscription.priceId).toBe(price2.id)
      expect(result.unwrap().newSubscription.status).toBe(
        SubscriptionStatus.Active
      )

      // Verify events
      expect(effects.events).toHaveLength(2) // 1 canceled + 1 created
      expect(
        effects.events.filter(
          (e) => e.type === 'subscription.canceled'
        )
      ).toHaveLength(1)
      expect(
        effects.events.filter(
          (e) => e.type === 'subscription.created'
        )
      ).toHaveLength(1)
    })

    it('should migrate customer with paid plan to a default subscription on the new pricing model', async () => {
      // Setup: Customer has default free subscription on pricing model 1
      const freeSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price1.id,
        status: SubscriptionStatus.Active,
      })

      // Setup: Create a separate paid product and price on pricing model 1
      const paidProduct = await setupProduct({
        organizationId: organization.id,
        pricingModelId: pricingModel1.id,
        name: 'Paid Product',
        default: false,
      })

      const paidPrice = await setupPrice({
        name: 'Paid Plan Price',
        livemode: false,
        productId: paidProduct.id,
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        unitPrice: 1000, // $10.00
        isDefault: true,
      })

      const paidSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
      })

      // Execute migration
      const result = await adminTransaction(
        async ({ transaction }) => {
          return await migratePricingModelForCustomer(
            {
              customer,
              oldPricingModelId: pricingModel1.id,
              newPricingModelId: pricingModel2.id,
            },
            createDiscardingEffectsContext(transaction)
          )
        }
      )

      // Verify customer's pricingModelId was updated
      expect(result.unwrap().customer.pricingModelId).toBe(
        pricingModel2.id
      )

      // Verify both free and paid subscriptions were canceled
      expect(result.unwrap().canceledSubscriptions).toHaveLength(2)
      const canceledIds = result
        .unwrap()
        .canceledSubscriptions.map((s) => s.id)
        .sort()
      expect(canceledIds).toEqual(
        [freeSubscription.id, paidSubscription.id].sort()
      )
      expect(
        result
          .unwrap()
          .canceledSubscriptions.every(
            (s) => s.status === SubscriptionStatus.Canceled
          )
      ).toBe(true)
      expect(
        result
          .unwrap()
          .canceledSubscriptions.every(
            (s) =>
              s.cancellationReason ===
              CancellationReason.PricingModelMigration
          )
      ).toBe(true)

      // Verify new free subscription was created on new pricing model
      expect(result.unwrap().newSubscription.priceId).toBe(price2.id)
      expect(result.unwrap().newSubscription.status).toBe(
        SubscriptionStatus.Active
      )
    })

    it('should migrate customer with multiple subscriptions to a default subscription on the new pricing model, canceling the old subscriptions', async () => {
      // Setup: Customer has default free subscription on pricing model 1
      const freeSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price1.id,
        status: SubscriptionStatus.Active,
      })

      // Setup: Create first paid product and price on pricing model 1
      const paidProduct1 = await setupProduct({
        organizationId: organization.id,
        pricingModelId: pricingModel1.id,
        name: 'Paid Product 1',
        default: false,
      })

      const paidPrice1 = await setupPrice({
        name: 'Paid Plan Price 1',
        livemode: false,
        productId: paidProduct1.id,
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        unitPrice: 2000,
        isDefault: true,
      })

      const paidSubscription1 = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice1.id,
        status: SubscriptionStatus.Active,
      })

      // Setup: Create second paid product and price on pricing model 1
      const paidProduct2 = await setupProduct({
        organizationId: organization.id,
        pricingModelId: pricingModel1.id,
        name: 'Paid Product 2',
        default: false,
      })

      const paidPrice2 = await setupPrice({
        name: 'Paid Plan Price 2',
        livemode: false,
        productId: paidProduct2.id,
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        unitPrice: 3000,
        isDefault: true,
      })

      const paidSubscription2 = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice2.id,
        status: SubscriptionStatus.Active,
      })

      // Execute migration
      const result = await adminTransaction(
        async ({ transaction }) => {
          return await migratePricingModelForCustomer(
            {
              customer,
              oldPricingModelId: pricingModel1.id,
              newPricingModelId: pricingModel2.id,
            },
            createDiscardingEffectsContext(transaction)
          )
        }
      )

      // Verify customer's pricingModelId was updated
      expect(result.unwrap().customer.pricingModelId).toBe(
        pricingModel2.id
      )

      // Verify all subscriptions (1 free + 2 paid) were canceled
      expect(result.unwrap().canceledSubscriptions).toHaveLength(3)
      expect(
        result
          .unwrap()
          .canceledSubscriptions.map((s) => s.id)
          .sort()
      ).toEqual(
        [
          freeSubscription.id,
          paidSubscription1.id,
          paidSubscription2.id,
        ].sort()
      )

      // Verify all were canceled with migration reason
      for (const sub of result.unwrap().canceledSubscriptions) {
        expect(sub.status).toBe(SubscriptionStatus.Canceled)
        expect(sub.cancellationReason).toBe(
          CancellationReason.PricingModelMigration
        )
      }

      // Verify only one new subscription was created
      expect(result.unwrap().newSubscription).toMatchObject({})
      expect(result.unwrap().newSubscription.priceId).toBe(price2.id)
    })

    it('should migrate customer with no subscriptions to a default subscription on the new pricing model', async () => {
      // Execute migration on customer with no subscriptions
      const { result, effects } = await adminTransaction(
        async ({ transaction }) => {
          const { ctx, effects } =
            createCapturingEffectsContext(transaction)
          const result = await migratePricingModelForCustomer(
            {
              customer,
              oldPricingModelId: pricingModel1.id,
              newPricingModelId: pricingModel2.id,
            },
            ctx
          )
          return { result, effects }
        }
      )

      // Verify customer's pricingModelId was updated
      expect(result.unwrap().customer.pricingModelId).toBe(
        pricingModel2.id
      )

      // Verify no subscriptions were canceled
      expect(result.unwrap().canceledSubscriptions).toHaveLength(0)

      // Verify new subscription was created
      expect(result.unwrap().newSubscription).toMatchObject({})
      expect(result.unwrap().newSubscription.priceId).toBe(price2.id)
      expect(result.unwrap().newSubscription.status).toBe(
        SubscriptionStatus.Active
      )

      // Verify events (only subscription.created)
      expect(effects.events.length).toBeGreaterThanOrEqual(1)
      expect(
        effects.events.some((e) => e.type === 'subscription.created')
      ).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    it('should throw error if new pricing model has no default product', async () => {
      // Setup: Create pricing model with no default product
      const emptyPricingModel = await setupPricingModel({
        organizationId: organization.id,
        name: 'Empty Pricing Model',
      })

      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price1.id,
        status: SubscriptionStatus.Active,
      })

      // Execute migration - should throw error
      await expect(
        adminTransaction(async ({ transaction }) => {
          return await migratePricingModelForCustomer(
            {
              customer,
              oldPricingModelId: pricingModel1.id,
              newPricingModelId: emptyPricingModel.id,
            },
            createDiscardingEffectsContext(transaction)
          )
        })
      ).rejects.toThrow('No default product found for pricing model')
    })

    it('should handle customer already on target pricing model as no-op', async () => {
      // Setup: Customer already on pricing model 2
      const updatedCustomer = await adminTransaction(
        async ({ transaction }) => {
          return await updateCustomer(
            {
              id: customer.id,
              pricingModelId: pricingModel2.id,
            },
            transaction
          )
        }
      )

      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price2.id,
        status: SubscriptionStatus.Active,
      })

      // Execute migration (same pricing model)
      const { result, effects } = await adminTransaction(
        async ({ transaction }) => {
          const { ctx, effects } =
            createCapturingEffectsContext(transaction)
          const result = await migratePricingModelForCustomer(
            {
              customer: updatedCustomer,
              oldPricingModelId: pricingModel2.id,
              newPricingModelId: pricingModel2.id,
            },
            ctx
          )
          return { result, effects }
        }
      )

      // Verify no subscriptions were canceled
      expect(result.unwrap().canceledSubscriptions).toHaveLength(0)

      // Verify existing subscription is returned
      expect(result.unwrap().newSubscription.id).toBe(subscription.id)

      // Verify customer's pricingModelId remains on target model
      expect(result.unwrap().customer.pricingModelId).toBe(
        pricingModel2.id
      )

      // Verify no events were generated
      expect(effects.events).toHaveLength(0)
    })
  })

  describe('Integration with getCustomerBilling', () => {
    it('should return correct subscriptions after migration via customerBillingTransaction', async () => {
      // Setup: Customer with default free subscription on pricing model 1
      const freeSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price1.id,
        status: SubscriptionStatus.Active,
      })

      // Setup: Add a paid subscription on pricing model 1
      const paidProduct = await setupProduct({
        organizationId: organization.id,
        pricingModelId: pricingModel1.id,
        name: 'Paid Product Before Migration',
        default: false,
      })

      const paidPrice = await setupPrice({
        productId: paidProduct.id,
        name: 'Paid Price',
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        unitPrice: 5000,
        livemode: false,
        isDefault: true,
      })

      const paidSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
      })

      // Execute migration (automatically updates customer's pricingModelId)
      const migrationResult = await adminTransaction(
        async ({ transaction }) => {
          return await migratePricingModelForCustomer(
            {
              customer,
              oldPricingModelId: pricingModel1.id,
              newPricingModelId: pricingModel2.id,
            },
            createDiscardingEffectsContext(transaction)
          )
        }
      )

      // Verify customer's pricingModelId was updated
      expect(migrationResult.unwrap().customer.pricingModelId).toBe(
        pricingModel2.id
      )

      // Verify billing state via customerBillingTransaction
      const billingState = await adminTransaction(
        async ({ transaction }) => {
          return await customerBillingTransaction(
            {
              externalId: customer.externalId,
              organizationId: organization.id,
            },
            transaction
          )
        }
      )

      // Verify the new pricing model is returned
      expect(billingState.pricingModel.id).toBe(pricingModel2.id)

      // Verify all subscriptions are present (current and canceled)
      expect(
        billingState.subscriptions.length
      ).toBeGreaterThanOrEqual(3)

      // Verify only the new subscription is in currentSubscriptions
      expect(billingState.currentSubscriptions).toHaveLength(1)
      expect(billingState.currentSubscriptions[0].priceId).toBe(
        price2.id
      )
      expect(billingState.currentSubscriptions[0].status).toBe(
        SubscriptionStatus.Active
      )

      // Verify currentSubscription is the new subscription
      expect(billingState.currentSubscription.priceId).toBe(price2.id)
      expect(billingState.currentSubscription.status).toBe(
        SubscriptionStatus.Active
      )

      // Verify old subscriptions are canceled and not in currentSubscriptions
      const oldFreeSubscription = billingState.subscriptions.find(
        (s) => s.id === freeSubscription.id
      )
      const oldPaidSubscription = billingState.subscriptions.find(
        (s) => s.id === paidSubscription.id
      )

      expect(typeof oldFreeSubscription).toBe('object')
      expect(oldFreeSubscription!.status).toBe(
        SubscriptionStatus.Canceled
      )
      expect(oldFreeSubscription!.cancellationReason).toBe(
        CancellationReason.PricingModelMigration
      )

      expect(typeof oldPaidSubscription).toBe('object')
      expect(oldPaidSubscription!.status).toBe(
        SubscriptionStatus.Canceled
      )
      expect(oldPaidSubscription!.cancellationReason).toBe(
        CancellationReason.PricingModelMigration
      )

      // Verify old subscriptions are NOT in currentSubscriptions
      expect(
        billingState.currentSubscriptions.find(
          (s) => s.id === freeSubscription.id
        )
      ).toBeUndefined()
      expect(
        billingState.currentSubscriptions.find(
          (s) => s.id === paidSubscription.id
        )
      ).toBeUndefined()
    })

    it('should only show products and prices from new pricing model in catalog', async () => {
      // Setup: Customer starts on pricing model 1
      await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price1.id,
        status: SubscriptionStatus.Active,
      })

      // Execute migration to pricing model 2
      const migrationResult = await adminTransaction(
        async ({ transaction }) => {
          return await migratePricingModelForCustomer(
            {
              customer,
              oldPricingModelId: pricingModel1.id,
              newPricingModelId: pricingModel2.id,
            },
            createDiscardingEffectsContext(transaction)
          )
        }
      )

      // Verify customer's pricingModelId was updated
      expect(migrationResult.unwrap().customer.pricingModelId).toBe(
        pricingModel2.id
      )

      // Get billing state
      const billingState = await adminTransaction(
        async ({ transaction }) => {
          return await customerBillingTransaction(
            {
              externalId: customer.externalId,
              organizationId: organization.id,
            },
            transaction
          )
        }
      )

      // Verify the pricing model is pricingModel2
      expect(billingState.pricingModel.id).toBe(pricingModel2.id)

      // Verify only products from pricing model 2 are in the catalog
      expect(billingState.pricingModel.products).toHaveLength(1)
      expect(billingState.pricingModel.products[0].id).toBe(
        product2.id
      )

      // Verify no products from pricing model 1 are in the catalog
      const oldProductInCatalog =
        billingState.pricingModel.products.find(
          (p) => p.id === product1.id
        )
      expect(oldProductInCatalog).toBeUndefined()

      // Verify only prices from pricing model 2 are shown
      const allPrices = billingState.pricingModel.products.flatMap(
        (p) => p.prices
      )
      expect(allPrices.some((p) => p.id === price2.id)).toBe(true)
      expect(allPrices.some((p) => p.id === price1.id)).toBe(false)
    })

    it('should show features from new pricing model after migration', async () => {
      // Setup: Create features on both pricing models
      const usageMeter1 = await setupUsageMeter({
        organizationId: organization.id,
        pricingModelId: pricingModel1.id,
        name: 'Old Pricing Model Meter',
      })

      const feature1 = await setupUsageCreditGrantFeature({
        organizationId: organization.id,
        name: 'Old Pricing Model Feature',
        usageMeterId: usageMeter1.id,
        amount: 1000,
        renewalFrequency: FeatureUsageGrantFrequency.Once,
        livemode: false,
      })

      const productFeature1 = await setupProductFeature({
        organizationId: organization.id,
        productId: product1.id,
        featureId: feature1.id,
        livemode: false,
      })

      const usageMeter2 = await setupUsageMeter({
        organizationId: organization.id,
        pricingModelId: pricingModel2.id,
        name: 'New Pricing Model Meter',
      })

      const feature2 = await setupUsageCreditGrantFeature({
        organizationId: organization.id,
        name: 'New Pricing Model Feature',
        usageMeterId: usageMeter2.id,
        amount: 2000,
        renewalFrequency: FeatureUsageGrantFrequency.Once,
        livemode: false,
      })

      const productFeature2 = await setupProductFeature({
        organizationId: organization.id,
        productId: product2.id,
        featureId: feature2.id,
        livemode: false,
      })

      // Setup: Customer starts with subscription on pricing model 1
      const subscription1 = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price1.id,
        status: SubscriptionStatus.Active,
      })

      const subscriptionItem1 = await setupSubscriptionItem({
        subscriptionId: subscription1.id,
        priceId: price1.id,
        name: price1.name ?? 'Item 1',
        quantity: 1,
        unitPrice: price1.unitPrice,
        type: SubscriptionItemType.Static,
      })

      await setupSubscriptionItemFeature({
        subscriptionItemId: subscriptionItem1.id,
        featureId: feature1.id,
        type: FeatureType.UsageCreditGrant,
        usageMeterId: usageMeter1.id,
        productFeatureId: productFeature1.id,
      })

      // Execute migration
      const migrationResult = await adminTransaction(
        async ({ transaction }) => {
          return await migratePricingModelForCustomer(
            {
              customer,
              oldPricingModelId: pricingModel1.id,
              newPricingModelId: pricingModel2.id,
            },
            createDiscardingEffectsContext(transaction)
          )
        }
      )

      // Verify customer's pricingModelId was updated
      expect(migrationResult.unwrap().customer.pricingModelId).toBe(
        pricingModel2.id
      )

      // Get billing state
      const billingState = await adminTransaction(
        async ({ transaction }) => {
          return await customerBillingTransaction(
            {
              externalId: customer.externalId,
              organizationId: organization.id,
            },
            transaction
          )
        }
      )

      // Verify the pricing model is pricingModel2
      expect(billingState.pricingModel.id).toBe(pricingModel2.id)

      // Verify the catalog shows features from the new pricing model
      const newProduct = billingState.pricingModel.products.find(
        (p) => p.id === product2.id
      )
      expect(typeof newProduct).toBe('object')
      expect(newProduct!.features).toHaveLength(1)
      expect(newProduct!.features[0].id).toBe(feature2.id)

      // Verify features from the old pricing model are not in the catalog
      const oldProductInCatalog =
        billingState.pricingModel.products.find(
          (p) => p.id === product1.id
        )
      expect(oldProductInCatalog).toBeUndefined()
    })

    it('should return experimental field with only new pricing model features for checkFeatureAccess and checkUsageBalance', async () => {
      // Setup: Create usage meters and features on both pricing models
      const oldUsageMeter = await setupUsageMeter({
        organizationId: organization.id,
        pricingModelId: pricingModel1.id,
        name: 'Old Meter for Experimental',
        slug: 'old-meter-experimental',
      })

      const oldFeature = await setupUsageCreditGrantFeature({
        organizationId: organization.id,
        name: 'Old Feature for Experimental',
        usageMeterId: oldUsageMeter.id,
        amount: 500,
        renewalFrequency: FeatureUsageGrantFrequency.Once,
        livemode: false,
      })

      const oldProductFeature = await setupProductFeature({
        organizationId: organization.id,
        productId: product1.id,
        featureId: oldFeature.id,
        livemode: false,
      })

      const newUsageMeter = await setupUsageMeter({
        organizationId: organization.id,
        pricingModelId: pricingModel2.id,
        name: 'New Meter for Experimental',
        slug: 'new-meter-experimental',
      })

      const newFeature = await setupUsageCreditGrantFeature({
        organizationId: organization.id,
        name: 'New Feature for Experimental',
        usageMeterId: newUsageMeter.id,
        amount: 1500,
        renewalFrequency: FeatureUsageGrantFrequency.Once,
        livemode: false,
      })

      const newProductFeature = await setupProductFeature({
        organizationId: organization.id,
        productId: product2.id,
        featureId: newFeature.id,
        livemode: false,
      })

      // Setup: Customer starts with subscription on old pricing model
      const oldSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price1.id,
        status: SubscriptionStatus.Active,
      })

      const oldSubscriptionItem = await setupSubscriptionItem({
        subscriptionId: oldSubscription.id,
        priceId: price1.id,
        name: price1.name ?? 'Old Item',
        quantity: 1,
        unitPrice: price1.unitPrice,
        type: SubscriptionItemType.Static,
      })

      await setupSubscriptionItemFeature({
        subscriptionItemId: oldSubscriptionItem.id,
        featureId: oldFeature.id,
        type: FeatureType.UsageCreditGrant,
        usageMeterId: oldUsageMeter.id,
        productFeatureId: oldProductFeature.id,
      })

      // Execute migration
      const migrationResult = await adminTransaction(
        async ({ transaction }) => {
          return await migratePricingModelForCustomer(
            {
              customer,
              oldPricingModelId: pricingModel1.id,
              newPricingModelId: pricingModel2.id,
            },
            createDiscardingEffectsContext(transaction)
          )
        }
      )

      // Verify customer's pricingModelId was updated
      expect(migrationResult.unwrap().customer.pricingModelId).toBe(
        pricingModel2.id
      )

      // Get billing state
      const billingState = await adminTransaction(
        async ({ transaction }) => {
          return await customerBillingTransaction(
            {
              externalId: customer.externalId,
              organizationId: organization.id,
            },
            transaction
          )
        }
      )

      // Verify currentSubscriptions has only the new subscription
      expect(billingState.currentSubscriptions).toHaveLength(1)
      const currentSub = billingState.currentSubscriptions[0]
      expect(currentSub.priceId).toBe(price2.id)

      // Verify experimental field exists and contains the right structure
      expect(typeof currentSub.experimental).toBe('object')

      // Verify experimental.featureItems only contains features from new pricing model
      if (
        currentSub.experimental?.featureItems &&
        currentSub.experimental.featureItems.length > 0
      ) {
        for (const featureItem of currentSub.experimental
          .featureItems) {
          // All feature items should be from the new pricing model
          expect(featureItem.usageMeterId).toBe(newUsageMeter.id)
          expect(featureItem.usageMeterId).not.toBe(oldUsageMeter.id)
        }
      }

      // Verify experimental.usageMeterBalances only contains balances from new pricing model
      if (
        currentSub.experimental?.usageMeterBalances &&
        currentSub.experimental.usageMeterBalances.length > 0
      ) {
        for (const balance of currentSub.experimental
          .usageMeterBalances) {
          // All usage meter balances should be from the new pricing model's usage meter
          expect(balance.subscriptionId).not.toBe(oldSubscription.id)
          expect(balance.pricingModelId).toBe(pricingModel2.id)
        }
      }

      // Verify old subscription is canceled and not in currentSubscriptions
      const oldSubInHistory = billingState.subscriptions.find(
        (s) => s.id === oldSubscription.id
      )
      expect(typeof oldSubInHistory).toBe('object')
      expect(oldSubInHistory!.status).toBe(
        SubscriptionStatus.Canceled
      )

      // Verify old subscription is not in currentSubscriptions (which is what checkFeatureAccess/checkUsageBalance use)
      expect(
        billingState.currentSubscriptions.find(
          (s) => s.id === oldSubscription.id
        )
      ).toBeUndefined()

      // This ensures that when FlowgladServer constructs checkFeatureAccess and checkUsageBalance,
      // it will only use features/balances from the new pricing model
    })
  })

  describe('Subscription Cleanup', () => {
    it('should abort all scheduled billing runs when migrating', async () => {
      // Setup: Create subscription with billing period and scheduled billing runs
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price1.id,
        status: SubscriptionStatus.Active,
      })

      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })

      const now = new Date()
      const billingPeriod = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: new Date(now.getTime() - 60 * 60 * 1000), // 1 hour ago
        endDate: new Date(now.getTime() + 60 * 60 * 1000), // 1 hour later
        status: BillingPeriodStatus.Active,
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

      // Execute migration
      await adminTransaction(async ({ transaction }) => {
        await migratePricingModelForCustomer(
          {
            customer,
            oldPricingModelId: pricingModel1.id,
            newPricingModelId: pricingModel2.id,
          },
          createDiscardingEffectsContext(transaction)
        )
      })

      // Verify all scheduled billing runs are now aborted
      await adminTransaction(async ({ transaction }) => {
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

    it('should expire all subscription items when migrating', async () => {
      // Setup: Create product with features
      const paidProduct = await setupProduct({
        organizationId: organization.id,
        pricingModelId: pricingModel1.id,
        name: 'Paid Product with Features',
        default: false,
      })

      const paidPrice = await setupPrice({
        productId: paidProduct.id,
        name: 'Paid Price',
        type: PriceType.Subscription,
        unitPrice: 5000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: false,
        isDefault: true,
      })

      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice.id,
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
        pricingModelId: pricingModel1.id,
        name: 'Test Meter',
      })

      const feature = await setupUsageCreditGrantFeature({
        organizationId: organization.id,
        name: 'Test Feature',
        usageMeterId: usageMeter.id,
        amount: 1000,
        renewalFrequency: FeatureUsageGrantFrequency.Once,
        livemode: false,
      })

      const productFeature = await setupProductFeature({
        organizationId: organization.id,
        productId: paidProduct.id,
        featureId: feature.id,
        livemode: false,
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

      // Execute migration
      const canceledAt = await adminTransaction(
        async ({ transaction }) => {
          const result = await migratePricingModelForCustomer(
            {
              customer,
              oldPricingModelId: pricingModel1.id,
              newPricingModelId: pricingModel2.id,
            },
            createDiscardingEffectsContext(transaction)
          )
          return result.unwrap().canceledSubscriptions[0].canceledAt
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

    it('should make current billing period completed and cancel future ones when migrating', async () => {
      // Setup: Create subscription with multiple billing periods
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price1.id,
        status: SubscriptionStatus.Active,
      })

      const now = new Date()

      // Create an active billing period (current)
      const activeBP = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: new Date(now.getTime() - 60 * 60 * 1000), // 1 hour ago
        endDate: new Date(now.getTime() + 60 * 60 * 1000), // 1 hour later
        status: BillingPeriodStatus.Active,
      })

      // Create a future billing period
      const futureBP = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: new Date(now.getTime() + 2 * 60 * 60 * 1000), // 2 hours later
        endDate: new Date(now.getTime() + 3 * 60 * 60 * 1000), // 3 hours later
        status: BillingPeriodStatus.Upcoming,
      })

      // Execute migration
      await adminTransaction(async ({ transaction }) => {
        await migratePricingModelForCustomer(
          {
            customer,
            oldPricingModelId: pricingModel1.id,
            newPricingModelId: pricingModel2.id,
          },
          createDiscardingEffectsContext(transaction)
        )
      })

      // Verify billing period updates
      await adminTransaction(async ({ transaction }) => {
        const updatedActiveBP = await selectBillingPeriodById(
          activeBP.id,
          transaction
        )
        const updatedFutureBP = await selectBillingPeriodById(
          futureBP.id,
          transaction
        )

        // Active period should be completed and end date should be set to cancellation time
        expect(updatedActiveBP.status).toBe(
          BillingPeriodStatus.Completed
        )
        expect(updatedActiveBP.endDate).toBeLessThanOrEqual(
          Date.now()
        )

        // Future period should be canceled
        expect(updatedFutureBP.status).toBe(
          BillingPeriodStatus.Canceled
        )
      })
    })
  })

  describe('Validation', () => {
    it('should fail when new pricing model does not exist', async () => {
      await expect(
        adminTransaction(async ({ transaction }) => {
          return await migratePricingModelForCustomer(
            {
              customer,
              oldPricingModelId: pricingModel1.id,
              newPricingModelId: 'non-existent-id',
            },
            createDiscardingEffectsContext(transaction)
          )
        })
      ).rejects.toThrow('No pricing models found with id')
    })

    it('should fail when new pricing model belongs to different organization', async () => {
      // Setup: Create pricing model for different organization
      const { organization: org2 } = await setupOrg()
      const otherPricingModel = await setupPricingModel({
        organizationId: org2.id,
        name: 'Other Org Pricing Model',
      })

      await expect(
        adminTransaction(async ({ transaction }) => {
          return await migratePricingModelForCustomer(
            {
              customer,
              oldPricingModelId: pricingModel1.id,
              newPricingModelId: otherPricingModel.id,
            },
            createDiscardingEffectsContext(transaction)
          )
        })
      ).rejects.toThrow('does not belong to organization')
    })
  })

  describe('Procedure Transaction Function', () => {
    it('should successfully migrate and update customer pricingModelId', async () => {
      // Setup: Customer with subscription on pricing model 1
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price1.id,
        status: SubscriptionStatus.Active,
      })

      // Execute via procedure transaction function
      const result = await adminTransaction(
        async ({ transaction }) => {
          return await migrateCustomerPricingModelProcedureTransaction(
            {
              input: {
                externalId: customer.externalId,
                newPricingModelId: pricingModel2.id,
              },
              ctx: {
                apiKey: undefined,
                organizationId: organization.id,
              },
              transactionCtx: {
                transaction,
                invalidateCache: noopInvalidateCache,
                emitEvent: noopEmitEvent,
                enqueueLedgerCommand: noopEnqueueLedgerCommand,
              },
            }
          )
        }
      )

      // Verify customer's pricingModelId was updated
      expect(result.unwrap().customer.pricingModelId).toBe(
        pricingModel2.id
      )

      // Verify subscriptions were handled correctly
      expect(result.unwrap().canceledSubscriptions).toHaveLength(1)
      expect(result.unwrap().canceledSubscriptions[0].id).toBe(
        subscription.id
      )
      expect(result.unwrap().newSubscription.priceId).toBe(price2.id)

      // Verify customer in database was updated
      const updatedCustomer = await adminTransaction(
        async ({ transaction }) => {
          return await selectCustomerById(customer.id, transaction)
        }
      )
      expect(updatedCustomer.pricingModelId).toBe(pricingModel2.id)
    })

    it('should throw UNAUTHORIZED when organizationId is missing', async () => {
      await expect(
        adminTransaction(async ({ transaction }) => {
          return await migrateCustomerPricingModelProcedureTransaction(
            {
              input: {
                externalId: customer.externalId,
                newPricingModelId: pricingModel2.id,
              },
              ctx: {
                apiKey: undefined,
                organizationId: undefined as unknown as string,
              },
              transactionCtx: {
                transaction,
                invalidateCache: noopInvalidateCache,
                emitEvent: noopEmitEvent,
                enqueueLedgerCommand: noopEnqueueLedgerCommand,
              },
            }
          )
        })
      ).rejects.toThrow('Organization ID is required')
    })

    it('should throw NOT_FOUND when customer does not exist', async () => {
      await expect(
        adminTransaction(async ({ transaction }) => {
          return await migrateCustomerPricingModelProcedureTransaction(
            {
              input: {
                externalId: 'non-existent-customer',
                newPricingModelId: pricingModel2.id,
              },
              ctx: {
                apiKey: undefined,
                organizationId: organization.id,
              },
              transactionCtx: {
                transaction,
                invalidateCache: noopInvalidateCache,
                emitEvent: noopEmitEvent,
                enqueueLedgerCommand: noopEnqueueLedgerCommand,
              },
            }
          )
        })
      ).rejects.toThrow(
        'Customer with external ID non-existent-customer not found'
      )
    })

    it('should throw NOT_FOUND when new pricing model does not exist', async () => {
      await expect(
        adminTransaction(async ({ transaction }) => {
          return await migrateCustomerPricingModelProcedureTransaction(
            {
              input: {
                externalId: customer.externalId,
                newPricingModelId: 'non-existent-pricing-model',
              },
              ctx: {
                apiKey: undefined,
                organizationId: organization.id,
              },
              transactionCtx: {
                transaction,
                invalidateCache: noopInvalidateCache,
                emitEvent: noopEmitEvent,
                enqueueLedgerCommand: noopEnqueueLedgerCommand,
              },
            }
          )
        })
      ).rejects.toThrow('No pricing models found with id')
    })

    it('should throw FORBIDDEN when pricing model belongs to different organization', async () => {
      // Setup: Create pricing model for different organization
      const { organization: org2 } = await setupOrg()
      const otherPricingModel = await setupPricingModel({
        organizationId: org2.id,
        name: 'Other Org Pricing Model',
      })

      await expect(
        adminTransaction(async ({ transaction }) => {
          return await migrateCustomerPricingModelProcedureTransaction(
            {
              input: {
                externalId: customer.externalId,
                newPricingModelId: otherPricingModel.id,
              },
              ctx: {
                apiKey: undefined,
                organizationId: organization.id,
              },
              transactionCtx: {
                transaction,
                invalidateCache: noopInvalidateCache,
                emitEvent: noopEmitEvent,
                enqueueLedgerCommand: noopEnqueueLedgerCommand,
              },
            }
          )
        })
      ).rejects.toThrow(
        'Pricing model does not belong to your organization'
      )
    })

    it('should throw BAD_REQUEST when customer livemode does not match pricing model livemode', async () => {
      // Setup: Ensure customer has livemode=false
      await adminTransaction(async ({ transaction }) => {
        await updateCustomer(
          {
            id: customer.id,
            livemode: false,
          },
          transaction
        )
      })

      // Setup: Create a live pricing model with a default product
      const livePricingModel = await setupPricingModel({
        organizationId: organization.id,
        name: 'Live Pricing Model',
      })

      // Update pricing model to livemode=true
      await adminTransaction(async ({ transaction }) => {
        await transaction
          .update(pricingModels)
          .set({ livemode: true })
          .where(eq(pricingModels.id, livePricingModel.id))
      })

      // Create a default product with default price for the live pricing model
      const liveProduct = await setupProduct({
        organizationId: organization.id,
        pricingModelId: livePricingModel.id,
        name: 'Live Product',
        default: true,
      })

      await setupPrice({
        name: 'Live Free Plan',
        livemode: true,
        productId: liveProduct.id,
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        unitPrice: 0,
        isDefault: true,
      })

      // customer.livemode is false, livePricingModel.livemode is true
      await expect(
        adminTransaction(async ({ transaction }) => {
          return await migrateCustomerPricingModelProcedureTransaction(
            {
              input: {
                externalId: customer.externalId,
                newPricingModelId: livePricingModel.id,
              },
              ctx: {
                apiKey: undefined,
                organizationId: organization.id,
              },
              transactionCtx: {
                transaction,
                invalidateCache: noopInvalidateCache,
                emitEvent: noopEmitEvent,
                enqueueLedgerCommand: noopEnqueueLedgerCommand,
              },
            }
          )
        })
      ).rejects.toThrow(
        'Pricing model livemode must match customer livemode'
      )
    })
  })

  describe('Historical Data Preservation', () => {
    it('should preserve canceled subscription data', async () => {
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price1.id,
        status: SubscriptionStatus.Active,
      })

      // Execute migration
      await adminTransaction(async ({ transaction }) => {
        return await migratePricingModelForCustomer(
          {
            customer,
            oldPricingModelId: pricingModel1.id,
            newPricingModelId: pricingModel2.id,
          },
          createDiscardingEffectsContext(transaction)
        )
      })

      // Verify old subscription still exists in database
      const allSubscriptions = await adminTransaction(
        async ({ transaction }) => {
          return await selectSubscriptions(
            { customerId: customer.id },
            transaction
          )
        }
      )

      const canceledSubscription = allSubscriptions.find(
        (s) => s.id === subscription.id
      )
      expect(typeof canceledSubscription).toBe('object')
      expect(canceledSubscription!.status).toBe(
        SubscriptionStatus.Canceled
      )
      expect(canceledSubscription!.cancellationReason).toBe(
        CancellationReason.PricingModelMigration
      )
    })

    it('should not affect subscriptions of other customers on same pricing model', async () => {
      // Setup: Another customer on the same pricing model
      const otherCustomer = await setupCustomer({
        organizationId: organization.id,
        pricingModelId: pricingModel1.id,
      })

      const otherSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: otherCustomer.id,
        priceId: price1.id,
        status: SubscriptionStatus.Active,
      })

      // Setup: Original customer's subscription
      await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price1.id,
        status: SubscriptionStatus.Active,
      })

      // Execute migration for first customer only
      await adminTransaction(async ({ transaction }) => {
        return await migratePricingModelForCustomer(
          {
            customer,
            oldPricingModelId: pricingModel1.id,
            newPricingModelId: pricingModel2.id,
          },
          createDiscardingEffectsContext(transaction)
        )
      })

      // Verify other customer's subscription is unaffected
      const otherCustomerSubs = await adminTransaction(
        async ({ transaction }) => {
          return await selectSubscriptions(
            {
              customerId: otherCustomer.id,
              status: currentSubscriptionStatuses,
            },
            transaction
          )
        }
      )

      expect(otherCustomerSubs).toHaveLength(1)
      expect(otherCustomerSubs[0].id).toBe(otherSubscription.id)
      expect(otherCustomerSubs[0].status).toBe(
        SubscriptionStatus.Active
      )
    })
  })

  describe('Cache Invalidations', () => {
    it('should return customerSubscriptions cache invalidation when migrating with subscriptions', async () => {
      await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price1.id,
        status: SubscriptionStatus.Active,
      })

      const effects = await adminTransaction(
        async ({ transaction }) => {
          const { ctx, effects } =
            createCapturingEffectsContext(transaction)
          await migratePricingModelForCustomer(
            {
              customer,
              oldPricingModelId: pricingModel1.id,
              newPricingModelId: pricingModel2.id,
            },
            ctx
          )
          return effects
        }
      )

      // Should have cache invalidations for the customer's subscriptions
      expect(effects.cacheInvalidations).toContain(
        CacheDependency.customerSubscriptions(customer.id)
      )
    })

    it('should return customerSubscriptions cache invalidation when migrating with no existing subscriptions', async () => {
      // Customer with no subscriptions
      const effects = await adminTransaction(
        async ({ transaction }) => {
          const { ctx, effects } =
            createCapturingEffectsContext(transaction)
          await migratePricingModelForCustomer(
            {
              customer,
              oldPricingModelId: pricingModel1.id,
              newPricingModelId: pricingModel2.id,
            },
            ctx
          )
          return effects
        }
      )

      // Should still have cache invalidation from the new subscription creation
      expect(effects.cacheInvalidations).toContain(
        CacheDependency.customerSubscriptions(customer.id)
      )
    })

    it('should return correct customerSubscriptions cache invalidation for the specific customer', async () => {
      // Create another customer
      const otherCustomer = await setupCustomer({
        organizationId: organization.id,
        pricingModelId: pricingModel1.id,
      })

      await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price1.id,
        status: SubscriptionStatus.Active,
      })

      const effects = await adminTransaction(
        async ({ transaction }) => {
          const { ctx, effects } =
            createCapturingEffectsContext(transaction)
          await migratePricingModelForCustomer(
            {
              customer,
              oldPricingModelId: pricingModel1.id,
              newPricingModelId: pricingModel2.id,
            },
            ctx
          )
          return effects
        }
      )

      // Should invalidate the migrated customer's cache
      expect(effects.cacheInvalidations).toContain(
        CacheDependency.customerSubscriptions(customer.id)
      )
      // Should NOT invalidate the other customer's cache
      expect(effects.cacheInvalidations).not.toContain(
        CacheDependency.customerSubscriptions(otherCustomer.id)
      )
    })

    it('should return cache invalidations from procedure transaction', async () => {
      await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price1.id,
        status: SubscriptionStatus.Active,
      })

      const effects = await adminTransaction(
        async ({ transaction }) => {
          const { callbacks, effects } = createCapturingCallbacks()
          await migrateCustomerPricingModelProcedureTransaction({
            input: {
              externalId: customer.externalId,
              newPricingModelId: pricingModel2.id,
            },
            ctx: {
              apiKey: undefined,
              organizationId: organization.id,
            },
            transactionCtx: {
              transaction,
              invalidateCache: callbacks.invalidateCache,
              emitEvent: callbacks.emitEvent,
              enqueueLedgerCommand: callbacks.enqueueLedgerCommand,
            },
          })
          return effects
        }
      )

      // Verify cache invalidations are returned from procedure transaction
      expect(effects.cacheInvalidations).toContain(
        CacheDependency.customerSubscriptions(customer.id)
      )
    })
  })
})
