import { describe, it, beforeEach, expect } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupOrg,
  setupCustomer,
  setupPaymentMethod,
  setupSubscription,
  setupSubscriptionItem,
  setupProduct,
  setupPrice,
  setupUsageMeter,
  setupLedgerAccount,
} from '@/../seedDatabase'
import {
  addFeatureToSubscriptionItem,
  createSubscriptionFeatureItems,
} from '@/subscriptions/subscriptionItemFeatureHelpers'
import { insertFeature } from '@/db/tableMethods/featureMethods'
import { insertProductFeature } from '@/db/tableMethods/productFeatureMethods'
import { selectSubscriptionItemFeatures } from '@/db/tableMethods/subscriptionItemFeatureMethods'
import { selectUsageCredits } from '@/db/tableMethods/usageCreditMethods'
import { Product } from '@/db/schema/products'
import { Price } from '@/db/schema/prices'
import { Customer } from '@/db/schema/customers'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Subscription } from '@/db/schema/subscriptions'
import { SubscriptionItem } from '@/db/schema/subscriptionItems'
import { Feature } from '@/db/schema/features'
import { ProductFeature } from '@/db/schema/productFeatures'
import {
  FeatureType,
  IntervalUnit,
  CurrencyCode,
  PriceType,
  FeatureUsageGrantFrequency,
} from '@/types'
import * as R from 'ramda'
import { core } from '@/utils/core'
import { features as featuresTable } from '@/db/schema/features'

// Helper to create features and productFeatures for tests
const setupTestFeaturesAndProductFeatures = async (
  organizationId: string,
  productId: string,
  pricingModelId: string,
  livemode: boolean,
  featureSpecs: Array<{
    name: string
    type: FeatureType
    amount?: number
    renewalFrequency?: FeatureUsageGrantFrequency
    usageMeterName?: string
  }>
): Promise<
  Array<{
    feature: Feature.Record
    productFeature: ProductFeature.Record
  }>
> => {
  return adminTransaction(async ({ transaction }) => {
    const createdData: Array<{
      feature: Feature.Record
      productFeature: ProductFeature.Record
    }> = []
    for (const spec of featureSpecs) {
      let usageMeterId: string | null = null
      if (
        spec.type === FeatureType.UsageCreditGrant &&
        spec.usageMeterName
      ) {
        const usageMeter = await setupUsageMeter({
          organizationId,
          name: spec.usageMeterName,
          livemode,
          pricingModelId,
        })
        usageMeterId = usageMeter.id
      }

      const baseFeatureInsertData = {
        organizationId,
        name: spec.name,
        livemode,
        description: `${spec.name} description`,
        slug: `${spec.name.toLowerCase().replace(/\s+/g, '-')}-${core.nanoid(6)}`,
      }

      let featureInsertData: Feature.Insert

      if (spec.type === FeatureType.UsageCreditGrant) {
        featureInsertData = {
          ...baseFeatureInsertData,
          type: FeatureType.UsageCreditGrant,
          amount: spec.amount ?? 0,
          renewalFrequency:
            spec.renewalFrequency ??
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          usageMeterId:
            usageMeterId ?? `meter_dummy_${core.nanoid(4)}`,
          pricingModelId,
        }
      } else if (spec.type === FeatureType.Toggle) {
        featureInsertData = {
          ...baseFeatureInsertData,
          type: FeatureType.Toggle,
          amount: null,
          renewalFrequency: null,
          usageMeterId: null,
          pricingModelId,
        }
      } else {
        throw new Error(
          `Unsupported feature type in test setup: ${spec.type}`
        )
      }

      const feature = await insertFeature(
        featureInsertData,
        transaction
      )
      const productFeature = await insertProductFeature(
        {
          organizationId,
          livemode,
          productId,
          featureId: feature.id,
        },
        transaction
      )
      createdData.push({ feature, productFeature })
    }
    return createdData
  })
}

describe('SubscriptionItemFeatureHelpers', () => {
  let orgData: Awaited<ReturnType<typeof setupOrg>>
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let productForFeatures: Product.Record // Dedicated product for feature testing
  let priceForFeatures: Price.Record // Dedicated price for feature testing
  let subscription: Subscription.Record
  let subscriptionItem: SubscriptionItem.Record

  beforeEach(async () => {
    orgData = await setupOrg() // Sets up org, default product, default price, default pricingModel
    customer = await setupCustomer({
      organizationId: orgData.organization.id,
      livemode: true,
    })
    paymentMethod = await setupPaymentMethod({
      organizationId: orgData.organization.id,
      customerId: customer.id,
      livemode: true,
    })

    // Use a specific product and price for these tests to ensure clarity
    productForFeatures = await setupProduct({
      organizationId: orgData.organization.id,
      name: 'Product For Feature Tests',
      livemode: true,
      pricingModelId: orgData.pricingModel.id,
    })

    priceForFeatures = await setupPrice({
      productId: productForFeatures.id,
      name: 'Price For Feature Tests',
      type: PriceType.Subscription,
      unitPrice: 1000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      trialPeriodDays: 0,
      currency: CurrencyCode.USD,
    })

    subscription = await setupSubscription({
      organizationId: orgData.organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: priceForFeatures.id, // Link to our specific price
      livemode: true,
    })

    subscriptionItem = await setupSubscriptionItem({
      subscriptionId: subscription.id,
      name: 'Subscription Item for Feature Tests',
      quantity: 1,
      unitPrice: priceForFeatures.unitPrice,
      priceId: priceForFeatures.id, // Explicitly use the test price
    })
  })

  describe('createSubscriptionFeatureItems', () => {
    it('should return an empty array if subscriptionItems input is empty', async () => {
      await adminTransaction(async ({ transaction }) => {
        const result = await createSubscriptionFeatureItems(
          [],
          transaction
        )
        expect(result).toEqual([])
      })
    })

    it('should return an empty array if prices associated with subscription items have no features', async () => {
      // productForFeatures by default has no features linked yet
      await adminTransaction(async ({ transaction }) => {
        const result = await createSubscriptionFeatureItems(
          [subscriptionItem],
          transaction
        )
        expect(result).toEqual([])
        const featuresInDb = await selectSubscriptionItemFeatures(
          { subscriptionItemId: [subscriptionItem.id] },
          transaction
        )
        expect(featuresInDb.length).toBe(0)
      })
    })

    it('should return an empty array if prices for subscription items do not exist', async () => {
      const nonExistentPriceSubItem = {
        ...subscriptionItem,
        priceId: 'price_nonexistent_' + core.nanoid(),
      }
      await adminTransaction(async ({ transaction }) => {
        const result = await createSubscriptionFeatureItems(
          [nonExistentPriceSubItem],
          transaction
        )
        expect(result).toEqual([])
      })
    })

    it('should create a SubscriptionItemFeature for a UsageCreditGrant feature', async () => {
      const featureName = 'Test Usage Credit Grant'
      const featureAmount = 100
      const renewalFreq =
        FeatureUsageGrantFrequency.EveryBillingPeriod
      const usageMeterName = 'Test Meter for Grant'

      const [{ feature: usageGrantFeature, productFeature }] =
        await setupTestFeaturesAndProductFeatures(
          orgData.organization.id,
          productForFeatures.id,
          orgData.pricingModel.id,
          true,
          [
            {
              name: featureName,
              type: FeatureType.UsageCreditGrant,
              amount: featureAmount,
              renewalFrequency: renewalFreq,
              usageMeterName,
            },
          ]
        )

      await adminTransaction(async ({ transaction }) => {
        const createdSifs = await createSubscriptionFeatureItems(
          [subscriptionItem],
          transaction
        )
        expect(createdSifs.length).toBe(1)
        const sif = createdSifs[0]
        expect(sif.subscriptionItemId).toBe(subscriptionItem.id)
        expect(sif.featureId).toBe(usageGrantFeature.id)
        expect(sif.productFeatureId).toBe(productFeature.id)
        expect(sif.type).toBe(FeatureType.UsageCreditGrant)
        expect(sif.amount).toBe(featureAmount)
        expect(sif.renewalFrequency).toBe(renewalFreq)
        expect(sif.usageMeterId).toBe(usageGrantFeature.usageMeterId)
        expect(sif.livemode).toBe(subscriptionItem.livemode)

        const featuresInDb = await selectSubscriptionItemFeatures(
          { id: [sif.id] },
          transaction
        )
        expect(featuresInDb.length).toBe(1)
        expect(featuresInDb[0]).toEqual(sif)
      })
    })

    it('should create a SubscriptionItemFeature for a Toggle feature', async () => {
      const featureName = 'Test Toggle Feature'
      const [{ feature: toggleFeature, productFeature }] =
        await setupTestFeaturesAndProductFeatures(
          orgData.organization.id,
          productForFeatures.id,
          orgData.pricingModel.id,
          true,
          [{ name: featureName, type: FeatureType.Toggle }]
        )

      await adminTransaction(async ({ transaction }) => {
        const createdSifs = await createSubscriptionFeatureItems(
          [subscriptionItem],
          transaction
        )
        expect(createdSifs.length).toBe(1)
        const sif = createdSifs[0]
        expect(sif.subscriptionItemId).toBe(subscriptionItem.id)
        expect(sif.featureId).toBe(toggleFeature.id)
        expect(sif.productFeatureId).toBe(productFeature.id)
        expect(sif.type).toBe(FeatureType.Toggle)
        expect(sif.amount).toBeNull()
        expect(sif.renewalFrequency).toBeNull()
        expect(sif.usageMeterId).toBeNull()
        expect(sif.livemode).toBe(subscriptionItem.livemode)

        const featuresInDb = await selectSubscriptionItemFeatures(
          { id: [sif.id] },
          transaction
        )
        expect(featuresInDb.length).toBe(1)
        expect(featuresInDb[0]).toEqual(sif)
      })
    })

    it('should create multiple SubscriptionItemFeatures for a price with multiple features', async () => {
      const grantAmount = 50
      const [
        { feature: grantFeature, productFeature: grantPf },
        { feature: toggleFeature, productFeature: togglePf },
      ] = await setupTestFeaturesAndProductFeatures(
        orgData.organization.id,
        productForFeatures.id,
        orgData.pricingModel.id,
        true,
        [
          {
            name: 'Multi Grant',
            type: FeatureType.UsageCreditGrant,
            amount: grantAmount,
            renewalFrequency:
              FeatureUsageGrantFrequency.EveryBillingPeriod,
            usageMeterName: 'MultiGrantMeter',
          },
          { name: 'Multi Toggle', type: FeatureType.Toggle },
        ]
      )

      await adminTransaction(async ({ transaction }) => {
        const createdSifs = await createSubscriptionFeatureItems(
          [subscriptionItem],
          transaction
        )
        expect(createdSifs.length).toBe(2)

        const grantSif = createdSifs.find(
          (s) => s.featureId === grantFeature.id
        )
        const toggleSif = createdSifs.find(
          (s) => s.featureId === toggleFeature.id
        )

        expect(grantSif).toBeDefined()
        expect(grantSif?.type).toBe(FeatureType.UsageCreditGrant)
        expect(grantSif?.amount).toBe(grantAmount)
        expect(grantSif?.productFeatureId).toBe(grantPf.id)

        expect(toggleSif).toBeDefined()
        expect(toggleSif?.type).toBe(FeatureType.Toggle)
        expect(toggleSif?.productFeatureId).toBe(togglePf.id)

        const featuresInDb = await selectSubscriptionItemFeatures(
          { subscriptionItemId: [subscriptionItem.id] },
          transaction
        )
        expect(featuresInDb.length).toBe(2)
      })
    })

    it('should create SubscriptionItemFeatures for multiple subscription items', async () => {
      const subscriptionItem2 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Second Subscription Item for Feature Tests',
        quantity: 1,
        unitPrice: priceForFeatures.unitPrice,
        priceId: priceForFeatures.id,
      })

      const [{ feature: singleFeature, productFeature }] =
        await setupTestFeaturesAndProductFeatures(
          orgData.organization.id,
          productForFeatures.id,
          orgData.pricingModel.id,
          true,
          [{ name: 'Shared Feature', type: FeatureType.Toggle }]
        )

      await adminTransaction(async ({ transaction }) => {
        const createdSifs = await createSubscriptionFeatureItems(
          [subscriptionItem, subscriptionItem2],
          transaction
        )
        expect(createdSifs.length).toBe(2)

        const sif1 = createdSifs.find(
          (s) => s.subscriptionItemId === subscriptionItem.id
        )
        const sif2 = createdSifs.find(
          (s) => s.subscriptionItemId === subscriptionItem2.id
        )

        expect(sif1).toBeDefined()
        expect(sif1?.featureId).toBe(singleFeature.id)
        expect(sif1?.productFeatureId).toBe(productFeature.id)

        expect(sif2).toBeDefined()
        expect(sif2?.featureId).toBe(singleFeature.id)
        expect(sif2?.productFeatureId).toBe(productFeature.id)

        const featuresInDb = await selectSubscriptionItemFeatures(
          { featureId: [singleFeature.id] },
          transaction
        )
        expect(featuresInDb.length).toBe(2)
        expect(
          featuresInDb.map((f) => f.subscriptionItemId).sort()
        ).toEqual([subscriptionItem.id, subscriptionItem2.id].sort())
      })
    })

    // Test quantity-based usage credit grant amount multiplication
    it('should multiply usage credit grant amount by subscription item quantity', async () => {
      const featureName = 'Quantity Based Feature Test'
      const featureAmount = 30
      const [{ feature: usageGrantFeature, productFeature }] =
        await setupTestFeaturesAndProductFeatures(
          orgData.organization.id,
          productForFeatures.id,
          orgData.pricingModel.id,
          true,
          [
            {
              name: featureName,
              type: FeatureType.UsageCreditGrant,
              amount: featureAmount,
              renewalFrequency: FeatureUsageGrantFrequency.Once,
              usageMeterName: 'QuantityTestMeter',
            },
          ]
        )
      const quantity = 4
      const subscriptionItem2 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Quantity Subscription Item',
        quantity,
        unitPrice: priceForFeatures.unitPrice,
        priceId: priceForFeatures.id,
      })

      await adminTransaction(async ({ transaction }) => {
        const createdSifs = await createSubscriptionFeatureItems(
          [subscriptionItem2],
          transaction
        )
        expect(createdSifs.length).toBe(1)
        const sif = createdSifs[0]
        expect(sif.subscriptionItemId).toBe(subscriptionItem2.id)
        expect(sif.amount).toBe(featureAmount * quantity)
      })
    })
  })

  describe('addFeatureToSubscriptionItem', () => {
    it('deduplicates toggle features via upsert', async () => {
      const [{ feature: toggleFeature }] =
        await setupTestFeaturesAndProductFeatures(
          orgData.organization.id,
          productForFeatures.id,
          orgData.pricingModel.id,
          true,
          [{ name: 'Manual Toggle', type: FeatureType.Toggle }]
        )

      await adminTransaction(async ({ transaction }) => {
        const firstResult = await addFeatureToSubscriptionItem(
          {
            subscriptionItemId: subscriptionItem.id,
            featureId: toggleFeature.id,
            grantCreditsImmediately: false,
          },
          transaction
        )
        const secondResult = await addFeatureToSubscriptionItem(
          {
            subscriptionItemId: subscriptionItem.id,
            featureId: toggleFeature.id,
            grantCreditsImmediately: false,
          },
          transaction
        )
        expect(secondResult.result.subscriptionItemFeature.id).toBe(
          firstResult.result.subscriptionItemFeature.id
        )
      })
    })

    it('inserts usage features and grants immediate credits when requested', async () => {
      const [{ feature: usageFeature }] =
        await setupTestFeaturesAndProductFeatures(
          orgData.organization.id,
          productForFeatures.id,
          orgData.pricingModel.id,
          true,
          [
            {
              name: 'Manual Usage Grant',
              type: FeatureType.UsageCreditGrant,
              amount: 250,
              renewalFrequency:
                FeatureUsageGrantFrequency.EveryBillingPeriod,
              usageMeterName: 'manual-grant-meter',
            },
          ]
        )

      await setupLedgerAccount({
        subscriptionId: subscription.id,
        usageMeterId: usageFeature.usageMeterId!,
        organizationId: orgData.organization.id,
        livemode: true,
      })

      await adminTransaction(async ({ transaction }) => {
        const firstResult = await addFeatureToSubscriptionItem(
          {
            subscriptionItemId: subscriptionItem.id,
            featureId: usageFeature.id,
            grantCreditsImmediately: false,
          },
          transaction
        )
        const secondResult = await addFeatureToSubscriptionItem(
          {
            subscriptionItemId: subscriptionItem.id,
            featureId: usageFeature.id,
            grantCreditsImmediately: true,
          },
          transaction
        )

        expect(secondResult.result.subscriptionItemFeature.id).toBe(
          firstResult.result.subscriptionItemFeature.id
        )
        expect(secondResult.ledgerCommand).toBeDefined()

        const featureGrants = await selectSubscriptionItemFeatures(
          { subscriptionItemId: subscriptionItem.id },
          transaction
        )
        const activeGrant = featureGrants.find(
          (item) =>
            item.featureId === usageFeature.id &&
            item.expiredAt === null
        )
        expect(activeGrant).toBeDefined()
        expect(activeGrant?.amount).toBe(
          (usageFeature.amount ?? 0) * 2 * subscriptionItem.quantity
        )

        const usageCredits = await selectUsageCredits(
          {
            subscriptionId: subscription.id,
            usageMeterId: usageFeature.usageMeterId!,
          },
          transaction
        )
        expect(
          usageCredits.some(
            (credit) =>
              credit.sourceReferenceId ===
              secondResult.result.subscriptionItemFeature.id
          )
        ).toBe(true)
      })
    })

    it('rejects features outside the subscription pricing model', async () => {
      await adminTransaction(async ({ transaction }) => {
        const mismatchedFeature = await insertFeature(
          {
            organizationId: orgData.organization.id,
            livemode: true,
            type: FeatureType.Toggle,
            slug: `mismatched-feature-${core.nanoid(6)}`,
            name: 'Mismatched Toggle',
            description: 'Toggle from another pricing model',
            amount: null,
            renewalFrequency: null,
            usageMeterId: null,
            pricingModelId: orgData.testmodePricingModel.id,
            active: true,
          },
          transaction
        )

        await insertProductFeature(
          {
            organizationId: orgData.organization.id,
            livemode: true,
            productId: productForFeatures.id,
            featureId: mismatchedFeature.id,
          },
          transaction
        )

        await expect(
          addFeatureToSubscriptionItem(
            {
              subscriptionItemId: subscriptionItem.id,
              featureId: mismatchedFeature.id,
              grantCreditsImmediately: false,
            },
            transaction
          )
        ).rejects.toThrow(/pricing model/i)
      })
    })
  })
})
