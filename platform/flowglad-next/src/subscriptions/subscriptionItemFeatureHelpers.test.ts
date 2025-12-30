import * as R from 'ramda'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupCustomer,
  setupLedgerAccount,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupProduct,
  setupSubscription,
  setupSubscriptionItem,
  setupUsageMeter,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Customer } from '@/db/schema/customers'
import {
  type Feature,
  features as featuresTable,
} from '@/db/schema/features'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { ProductFeature } from '@/db/schema/productFeatures'
import type { Product } from '@/db/schema/products'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'
import { insertFeature } from '@/db/tableMethods/featureMethods'
import { insertProductFeature } from '@/db/tableMethods/productFeatureMethods'
import { selectSubscriptionItemFeatures } from '@/db/tableMethods/subscriptionItemFeatureMethods'
import {
  expireSubscriptionItems,
  insertSubscriptionItem,
  selectSubscriptionItems,
} from '@/db/tableMethods/subscriptionItemMethods'
import { selectUsageCredits } from '@/db/tableMethods/usageCreditMethods'
import {
  addFeatureToSubscriptionItem,
  createSubscriptionFeatureItems,
} from '@/subscriptions/subscriptionItemFeatureHelpers'
import {
  CurrencyCode,
  FeatureType,
  FeatureUsageGrantFrequency,
  IntervalUnit,
  LedgerTransactionType,
  PriceType,
  SubscriptionItemType,
  UsageCreditSourceReferenceType,
  UsageCreditStatus,
  UsageCreditType,
} from '@/types'
import { core } from '@/utils/core'

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
        expect(sif.manuallyCreated).toBe(false)

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
        expect(sif.manuallyCreated).toBe(false)

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

    it('should exclude manual subscription items from feature creation', async () => {
      const [{ feature: productFeature, productFeature: pf }] =
        await setupTestFeaturesAndProductFeatures(
          orgData.organization.id,
          productForFeatures.id,
          orgData.pricingModel.id,
          true,
          [{ name: 'Product Feature', type: FeatureType.Toggle }]
        )

      await adminTransaction(async ({ transaction }) => {
        // Create a regular subscription item with a price
        const regularItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          name: 'Regular Plan',
          quantity: 1,
          unitPrice: 1000,
          priceId: priceForFeatures.id,
        })

        // Create a manual subscription item (no priceId)
        const manualItem = await insertSubscriptionItem(
          {
            subscriptionId: subscription.id,
            name: 'Manual Features',
            priceId: null,
            unitPrice: 0,
            quantity: 0,
            addedDate: Date.now(),
            expiredAt: null,
            metadata: null,
            externalId: null,
            type: SubscriptionItemType.Static,
            manuallyCreated: true,
            livemode: subscription.livemode,
          },
          transaction
        )

        const createdFeatures = await createSubscriptionFeatureItems(
          [regularItem, manualItem],
          transaction
        )

        // Should create features for regular item only
        expect(createdFeatures.length).toBe(1)
        expect(createdFeatures[0].subscriptionItemId).toBe(
          regularItem.id
        )
        expect(createdFeatures[0].featureId).toBe(productFeature.id)
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

    it('grants immediate credits for a usage feature with no existing recurring grant', async () => {
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
        const result = await addFeatureToSubscriptionItem(
          {
            subscriptionItemId: subscriptionItem.id,
            featureId: usageFeature.id,
            grantCreditsImmediately: true,
          },
          transaction
        )

        const manualSubscriptionItems = await selectSubscriptionItems(
          {
            subscriptionId: subscription.id,
            manuallyCreated: true,
            expiredAt: null,
          },
          transaction
        )

        expect(manualSubscriptionItems.length).toEqual(1)
        const manualSubscriptionItem = manualSubscriptionItems[0]

        expect(manualSubscriptionItem).toMatchObject({
          manuallyCreated: true,
          priceId: null,
          unitPrice: 0,
          quantity: 0,
          name: 'Manual Features',
          type: SubscriptionItemType.Static,
          expiredAt: null,
          subscriptionId: subscription.id,
        })

        const expectedImmediateGrantAmount = usageFeature.amount ?? 0
        const expectedRecurringGrantAmount =
          (usageFeature.amount ?? 0) * subscriptionItem.quantity

        expect(result.ledgerCommand).toMatchObject({
          type: LedgerTransactionType.CreditGrantRecognized,
          payload: {
            usageCredit: expect.objectContaining({
              issuedAmount: expectedImmediateGrantAmount,
            }),
          },
        })

        const [activeGrant] = await selectSubscriptionItemFeatures(
          {
            subscriptionItemId: manualSubscriptionItem.id,
            featureId: usageFeature.id,
            expiredAt: null,
          },
          transaction
        )

        expect(activeGrant).toEqual(
          expect.objectContaining({
            amount: expectedRecurringGrantAmount,
          })
        )
      })
    })

    it('grants immediate credits even when a recurring usage grant already exists', async () => {
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
        const expectedImmediateGrantAmount = usageFeature.amount ?? 0
        const expectedRecurringGrantAmount =
          (usageFeature.amount ?? 0) * subscriptionItem.quantity
        const expectedCumulativeGrantAmount =
          expectedRecurringGrantAmount + expectedRecurringGrantAmount

        expect(secondResult.ledgerCommand).toMatchObject({
          type: LedgerTransactionType.CreditGrantRecognized,
          organizationId: subscription.organizationId,
          livemode: subscription.livemode,
          subscriptionId: subscription.id,
          payload: {
            usageCredit: expect.objectContaining({
              subscriptionId: subscription.id,
              organizationId: subscription.organizationId,
              livemode: subscription.livemode,
              usageMeterId: usageFeature.usageMeterId!,
              sourceReferenceId:
                secondResult.result.subscriptionItemFeature.id,
              sourceReferenceType:
                UsageCreditSourceReferenceType.ManualAdjustment,
              creditType: UsageCreditType.Grant,
              status: UsageCreditStatus.Posted,
              issuedAmount: expectedImmediateGrantAmount,
            }),
          },
        })

        const manualSubscriptionItems = await selectSubscriptionItems(
          {
            subscriptionId: subscription.id,
            manuallyCreated: true,
            expiredAt: null,
          },
          transaction
        )

        expect(manualSubscriptionItems.length).toEqual(1)
        const manualSubscriptionItem = manualSubscriptionItems[0]

        expect(manualSubscriptionItem).toMatchObject({
          manuallyCreated: true,
          priceId: null,
          unitPrice: 0,
          quantity: 0,
          name: 'Manual Features',
          type: SubscriptionItemType.Static,
          expiredAt: null,
          subscriptionId: subscription.id,
        })

        const featureGrants = await selectSubscriptionItemFeatures(
          { subscriptionItemId: manualSubscriptionItem.id },
          transaction
        )
        // ensure no ledger command when not granting immediately
        expect(firstResult.ledgerCommand).toBeUndefined()
        const activeGrant = featureGrants.find(
          (item) =>
            item.featureId === usageFeature.id &&
            item.expiredAt === null
        )
        expect(activeGrant).toEqual(
          expect.objectContaining({
            subscriptionItemId: manualSubscriptionItem.id,
            featureId: usageFeature.id,
            amount: expectedCumulativeGrantAmount,
            expiredAt: null,
          })
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

    it('allows adding features without a product association', async () => {
      await adminTransaction(async ({ transaction }) => {
        const standaloneFeature = await insertFeature(
          {
            organizationId: orgData.organization.id,
            livemode: true,
            type: FeatureType.Toggle,
            slug: `standalone-feature-${core.nanoid(6)}`,
            name: 'Standalone Toggle',
            description: 'Toggle without a product feature mapping',
            amount: null,
            renewalFrequency: null,
            usageMeterId: null,
            pricingModelId: orgData.pricingModel.id,
            active: true,
          },
          transaction
        )

        const result = await addFeatureToSubscriptionItem(
          {
            subscriptionItemId: subscriptionItem.id,
            featureId: standaloneFeature.id,
            grantCreditsImmediately: false,
          },
          transaction
        )

        const manualSubscriptionItems = await selectSubscriptionItems(
          {
            subscriptionId: subscription.id,
            manuallyCreated: true,
            expiredAt: null,
          },
          transaction
        )

        expect(manualSubscriptionItems.length).toEqual(1)
        const manualSubscriptionItem = manualSubscriptionItems[0]

        expect(result.result.subscriptionItemFeature).toEqual(
          expect.objectContaining({
            subscriptionItemId: manualSubscriptionItem.id,
            featureId: standaloneFeature.id,
            productFeatureId: null,
          })
        )
      })
    })

    it('should mark features added via addFeatureToSubscriptionItem as manually created', async () => {
      const [{ feature: toggleFeature }] =
        await setupTestFeaturesAndProductFeatures(
          orgData.organization.id,
          productForFeatures.id,
          orgData.pricingModel.id,
          true,
          [{ name: 'Manual Toggle', type: FeatureType.Toggle }]
        )

      await adminTransaction(async ({ transaction }) => {
        const result = await addFeatureToSubscriptionItem(
          {
            subscriptionItemId: subscriptionItem.id,
            featureId: toggleFeature.id,
            grantCreditsImmediately: false,
          },
          transaction
        )

        expect(
          result.result.subscriptionItemFeature.manuallyCreated
        ).toBe(true)

        // Verify in database
        const [sif] = await selectSubscriptionItemFeatures(
          { id: [result.result.subscriptionItemFeature.id] },
          transaction
        )
        expect(sif.manuallyCreated).toBe(true)
      })
    })

    it('should mark usage credit grant features added via addFeatureToSubscriptionItem as manually created', async () => {
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

      await adminTransaction(async ({ transaction }) => {
        const result = await addFeatureToSubscriptionItem(
          {
            subscriptionItemId: subscriptionItem.id,
            featureId: usageFeature.id,
            grantCreditsImmediately: false,
          },
          transaction
        )

        expect(
          result.result.subscriptionItemFeature.manuallyCreated
        ).toBe(true)

        // Verify in database
        const [sif] = await selectSubscriptionItemFeatures(
          { id: [result.result.subscriptionItemFeature.id] },
          transaction
        )
        expect(sif.manuallyCreated).toBe(true)
      })
    })

    it('should reuse existing manual subscription item when adding multiple features', async () => {
      const [{ feature: feature1 }, { feature: feature2 }] =
        await setupTestFeaturesAndProductFeatures(
          orgData.organization.id,
          productForFeatures.id,
          orgData.pricingModel.id,
          true,
          [
            { name: 'Feature 1', type: FeatureType.Toggle },
            { name: 'Feature 2', type: FeatureType.Toggle },
          ]
        )

      await adminTransaction(async ({ transaction }) => {
        const result1 = await addFeatureToSubscriptionItem(
          {
            subscriptionItemId: subscriptionItem.id,
            featureId: feature1.id,
            grantCreditsImmediately: false,
          },
          transaction
        )

        const result2 = await addFeatureToSubscriptionItem(
          {
            subscriptionItemId: subscriptionItem.id,
            featureId: feature2.id,
            grantCreditsImmediately: false,
          },
          transaction
        )

        // Both features should be on the same manual subscription item
        expect(
          result1.result.subscriptionItemFeature.subscriptionItemId
        ).toBe(
          result2.result.subscriptionItemFeature.subscriptionItemId
        )

        // Verify only one manual item exists
        const manualItems = await selectSubscriptionItems(
          {
            subscriptionId: subscription.id,
            manuallyCreated: true,
            expiredAt: null,
          },
          transaction
        )
        expect(manualItems.length).toBe(1)
      })
    })

    describe('grantCreditsImmediately deduplication', () => {
      it('should NOT grant duplicate credits on second call with grantCreditsImmediately: true', async () => {
        const [{ feature: usageFeature }] =
          await setupTestFeaturesAndProductFeatures(
            orgData.organization.id,
            productForFeatures.id,
            orgData.pricingModel.id,
            true,
            [
              {
                name: 'Dedup Test Feature',
                type: FeatureType.UsageCreditGrant,
                amount: 100,
                renewalFrequency:
                  FeatureUsageGrantFrequency.EveryBillingPeriod,
                usageMeterName: 'dedup-test-meter',
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
          // First call - should grant credits
          const firstResult = await addFeatureToSubscriptionItem(
            {
              subscriptionItemId: subscriptionItem.id,
              featureId: usageFeature.id,
              grantCreditsImmediately: true,
            },
            transaction
          )
          expect(firstResult.ledgerCommand).toBeDefined()

          // Second call - should NOT grant duplicate credits
          const secondResult = await addFeatureToSubscriptionItem(
            {
              subscriptionItemId: subscriptionItem.id,
              featureId: usageFeature.id,
              grantCreditsImmediately: true,
            },
            transaction
          )
          // Second call should not produce a ledger command (credit was deduplicated)
          expect(secondResult.ledgerCommand).toBeUndefined()

          // Verify only 1 credit exists
          const usageCreditRecords = await selectUsageCredits(
            {
              subscriptionId: subscription.id,
              usageMeterId: usageFeature.usageMeterId!,
            },
            transaction
          )
          expect(usageCreditRecords.length).toBe(1)
        })
      })

      it('should NOT grant duplicate credits on 5 consecutive calls', async () => {
        const [{ feature: usageFeature }] =
          await setupTestFeaturesAndProductFeatures(
            orgData.organization.id,
            productForFeatures.id,
            orgData.pricingModel.id,
            true,
            [
              {
                name: 'Multi Dedup Test Feature',
                type: FeatureType.UsageCreditGrant,
                amount: 50,
                renewalFrequency:
                  FeatureUsageGrantFrequency.EveryBillingPeriod,
                usageMeterName: 'multi-dedup-test-meter',
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
          // Call 5 times with grantCreditsImmediately: true
          for (let i = 0; i < 5; i++) {
            await addFeatureToSubscriptionItem(
              {
                subscriptionItemId: subscriptionItem.id,
                featureId: usageFeature.id,
                grantCreditsImmediately: true,
              },
              transaction
            )
          }

          // Verify only 1 credit exists (not 5)
          const usageCreditRecords = await selectUsageCredits(
            {
              subscriptionId: subscription.id,
              usageMeterId: usageFeature.usageMeterId!,
            },
            transaction
          )
          expect(usageCreditRecords.length).toBe(1)
          expect(usageCreditRecords[0].issuedAmount).toBe(
            usageFeature.amount ?? 0
          )
        })
      })

      it('should grant credits for DIFFERENT features', async () => {
        const [{ feature: featureA }, { feature: featureB }] =
          await setupTestFeaturesAndProductFeatures(
            orgData.organization.id,
            productForFeatures.id,
            orgData.pricingModel.id,
            true,
            [
              {
                name: 'Feature A',
                type: FeatureType.UsageCreditGrant,
                amount: 100,
                renewalFrequency:
                  FeatureUsageGrantFrequency.EveryBillingPeriod,
                usageMeterName: 'feature-a-meter',
              },
              {
                name: 'Feature B',
                type: FeatureType.UsageCreditGrant,
                amount: 200,
                renewalFrequency:
                  FeatureUsageGrantFrequency.EveryBillingPeriod,
                usageMeterName: 'feature-b-meter',
              },
            ]
          )

        await setupLedgerAccount({
          subscriptionId: subscription.id,
          usageMeterId: featureA.usageMeterId!,
          organizationId: orgData.organization.id,
          livemode: true,
        })
        await setupLedgerAccount({
          subscriptionId: subscription.id,
          usageMeterId: featureB.usageMeterId!,
          organizationId: orgData.organization.id,
          livemode: true,
        })

        await adminTransaction(async ({ transaction }) => {
          // Grant credits for feature A
          const resultA = await addFeatureToSubscriptionItem(
            {
              subscriptionItemId: subscriptionItem.id,
              featureId: featureA.id,
              grantCreditsImmediately: true,
            },
            transaction
          )
          expect(resultA.ledgerCommand).toBeDefined()

          // Grant credits for feature B
          const resultB = await addFeatureToSubscriptionItem(
            {
              subscriptionItemId: subscriptionItem.id,
              featureId: featureB.id,
              grantCreditsImmediately: true,
            },
            transaction
          )
          expect(resultB.ledgerCommand).toBeDefined()

          // Verify 2 credits exist (one for A, one for B)
          const creditsA = await selectUsageCredits(
            {
              subscriptionId: subscription.id,
              usageMeterId: featureA.usageMeterId!,
            },
            transaction
          )
          const creditsB = await selectUsageCredits(
            {
              subscriptionId: subscription.id,
              usageMeterId: featureB.usageMeterId!,
            },
            transaction
          )
          expect(creditsA.length).toBe(1)
          expect(creditsB.length).toBe(1)
        })
      })

      it('should deduplicate using stable featureId, not subscription_item_feature.id', async () => {
        const [{ feature: usageFeature }] =
          await setupTestFeaturesAndProductFeatures(
            orgData.organization.id,
            productForFeatures.id,
            orgData.pricingModel.id,
            true,
            [
              {
                name: 'Stable ID Test Feature',
                type: FeatureType.UsageCreditGrant,
                amount: 75,
                renewalFrequency:
                  FeatureUsageGrantFrequency.EveryBillingPeriod,
                usageMeterName: 'stable-id-test-meter',
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
          // First call creates sub_item_feature_1 and grants credits
          const result1 = await addFeatureToSubscriptionItem(
            {
              subscriptionItemId: subscriptionItem.id,
              featureId: usageFeature.id,
              grantCreditsImmediately: true,
            },
            transaction
          )
          const firstSubFeatureId =
            result1.result.subscriptionItemFeature.id

          // Second call updates sub_item_feature (same ID due to upsert)
          // but should NOT grant duplicate credits
          const result2 = await addFeatureToSubscriptionItem(
            {
              subscriptionItemId: subscriptionItem.id,
              featureId: usageFeature.id,
              grantCreditsImmediately: true,
            },
            transaction
          )

          // The subscription item feature ID should be the same (due to upsert)
          expect(result2.result.subscriptionItemFeature.id).toBe(
            firstSubFeatureId
          )

          // But no duplicate credit should be created
          expect(result2.ledgerCommand).toBeUndefined()

          // Verify only 1 credit exists
          const usageCreditRecords = await selectUsageCredits(
            {
              subscriptionId: subscription.id,
              usageMeterId: usageFeature.usageMeterId!,
            },
            transaction
          )
          expect(usageCreditRecords.length).toBe(1)
          // The credit's sourceReferenceId should be the first subscription item feature ID
          expect(usageCreditRecords[0].sourceReferenceId).toBe(
            firstSubFeatureId
          )
        })
      })
    })
  })

  describe('manual item database constraints', () => {
    it('should reject when priceId is null but manuallyCreated is false', async () => {
      // Don't nest this inside adminTransaction - setupSubscription already uses one
      const testSubscription = await setupSubscription({
        organizationId: orgData.organization.id,
        customerId: customer.id,
        priceId: priceForFeatures.id,
        paymentMethodId: paymentMethod.id,
        livemode: true,
      })

      await expect(
        adminTransaction(async ({ transaction }) => {
          return insertSubscriptionItem(
            {
              subscriptionId: testSubscription.id,
              name: 'Invalid Item',
              priceId: null,
              unitPrice: 0,
              quantity: 0,
              addedDate: Date.now(),
              expiredAt: null,
              metadata: null,
              externalId: null,
              type: SubscriptionItemType.Static,
              manuallyCreated: false,
              livemode: testSubscription.livemode,
            },
            transaction
          )
        })
      ).rejects.toThrow()
    })

    it('should reject when unitPrice is not zero', async () => {
      const testSubscription = await setupSubscription({
        organizationId: orgData.organization.id,
        customerId: customer.id,
        priceId: priceForFeatures.id,
        paymentMethodId: paymentMethod.id,
        livemode: true,
      })

      await expect(
        adminTransaction(async ({ transaction }) => {
          return insertSubscriptionItem(
            {
              subscriptionId: testSubscription.id,
              name: 'Invalid Manual Item',
              priceId: null,
              unitPrice: 100,
              quantity: 0,
              addedDate: Date.now(),
              expiredAt: null,
              metadata: null,
              externalId: null,
              type: SubscriptionItemType.Static,
              manuallyCreated: true,
              livemode: testSubscription.livemode,
            },
            transaction
          )
        })
      ).rejects.toThrow()
    })

    it('should allow valid manual item', async () => {
      const testSubscription = await setupSubscription({
        organizationId: orgData.organization.id,
        customerId: customer.id,
        priceId: priceForFeatures.id,
        paymentMethodId: paymentMethod.id,
        livemode: true,
      })

      const validManualItem = await adminTransaction(
        async ({ transaction }) => {
          return insertSubscriptionItem(
            {
              subscriptionId: testSubscription.id,
              name: 'Valid Manual Item',
              priceId: null,
              unitPrice: 0,
              quantity: 0,
              addedDate: Date.now(),
              expiredAt: null,
              metadata: null,
              externalId: null,
              type: SubscriptionItemType.Static,
              manuallyCreated: true,
              livemode: testSubscription.livemode,
            },
            transaction
          )
        }
      )

      expect(validManualItem.priceId).toBeNull()
      expect(validManualItem.manuallyCreated).toBe(true)
      expect(validManualItem.unitPrice).toBe(0)
    })

    it('should enforce unique constraint - only one manual item per subscription', async () => {
      const testSubscription = await setupSubscription({
        organizationId: orgData.organization.id,
        customerId: customer.id,
        priceId: priceForFeatures.id,
        paymentMethodId: paymentMethod.id,
        livemode: true,
      })

      // Create first manual item
      await adminTransaction(async ({ transaction }) => {
        return insertSubscriptionItem(
          {
            subscriptionId: testSubscription.id,
            name: 'First Manual Item',
            priceId: null,
            unitPrice: 0,
            quantity: 0,
            addedDate: Date.now(),
            expiredAt: null,
            metadata: null,
            externalId: null,
            type: SubscriptionItemType.Static,
            manuallyCreated: true,
            livemode: testSubscription.livemode,
          },
          transaction
        )
      })

      // Try to create second manual item
      await expect(
        adminTransaction(async ({ transaction }) => {
          return insertSubscriptionItem(
            {
              subscriptionId: testSubscription.id,
              name: 'Second Manual Item',
              priceId: null,
              unitPrice: 0,
              quantity: 0,
              addedDate: Date.now(),
              expiredAt: null,
              metadata: null,
              externalId: null,
              type: SubscriptionItemType.Static,
              manuallyCreated: true,
              livemode: testSubscription.livemode,
            },
            transaction
          )
        })
      ).rejects.toThrow()
    })

    it('should reject manual item with quantity != 0', async () => {
      const testSubscription = await setupSubscription({
        organizationId: orgData.organization.id,
        customerId: customer.id,
        priceId: priceForFeatures.id,
        paymentMethodId: paymentMethod.id,
        livemode: true,
      })

      await expect(
        adminTransaction(async ({ transaction }) => {
          return insertSubscriptionItem(
            {
              subscriptionId: testSubscription.id,
              name: 'Invalid Manual Item',
              priceId: null,
              unitPrice: 0,
              quantity: 1, // Should be 0
              addedDate: Date.now(),
              expiredAt: null,
              metadata: null,
              externalId: null,
              type: SubscriptionItemType.Static,
              manuallyCreated: true,
              livemode: testSubscription.livemode,
            },
            transaction
          )
        })
      ).rejects.toThrow()
    })

    it('should reject manual item with priceId != null', async () => {
      const testSubscription = await setupSubscription({
        organizationId: orgData.organization.id,
        customerId: customer.id,
        priceId: priceForFeatures.id,
        paymentMethodId: paymentMethod.id,
        livemode: true,
      })

      await expect(
        adminTransaction(async ({ transaction }) => {
          return insertSubscriptionItem(
            {
              subscriptionId: testSubscription.id,
              name: 'Invalid Manual Item',
              priceId: priceForFeatures.id, // Should be null
              unitPrice: 0,
              quantity: 0,
              addedDate: Date.now(),
              expiredAt: null,
              metadata: null,
              externalId: null,
              type: SubscriptionItemType.Static,
              manuallyCreated: true,
              livemode: testSubscription.livemode,
            },
            transaction
          )
        })
      ).rejects.toThrow()
    })

    it('should reject non-manual item with quantity = 0', async () => {
      const testSubscription = await setupSubscription({
        organizationId: orgData.organization.id,
        customerId: customer.id,
        priceId: priceForFeatures.id,
        paymentMethodId: paymentMethod.id,
        livemode: true,
      })

      await expect(
        adminTransaction(async ({ transaction }) => {
          return insertSubscriptionItem(
            {
              subscriptionId: testSubscription.id,
              name: 'Invalid Item',
              priceId: priceForFeatures.id,
              unitPrice: 1000,
              quantity: 0, // Should be > 0
              addedDate: Date.now(),
              expiredAt: null,
              metadata: null,
              externalId: null,
              type: SubscriptionItemType.Static,
              manuallyCreated: false,
              livemode: testSubscription.livemode,
            },
            transaction
          )
        })
      ).rejects.toThrow()
    })

    it('should allow creating new manual item after expiring the old one', async () => {
      const testSubscription = await setupSubscription({
        organizationId: orgData.organization.id,
        customerId: customer.id,
        priceId: priceForFeatures.id,
        paymentMethodId: paymentMethod.id,
        livemode: true,
      })

      // Create first manual item
      const firstManualItem = await adminTransaction(
        async ({ transaction }) => {
          return insertSubscriptionItem(
            {
              subscriptionId: testSubscription.id,
              name: 'First Manual Item',
              priceId: null,
              unitPrice: 0,
              quantity: 0,
              addedDate: Date.now(),
              expiredAt: null,
              metadata: null,
              externalId: null,
              type: SubscriptionItemType.Static,
              manuallyCreated: true,
              livemode: testSubscription.livemode,
            },
            transaction
          )
        }
      )

      // Expire the first manual item
      await adminTransaction(async ({ transaction }) => {
        await expireSubscriptionItems(
          [firstManualItem.id],
          Date.now(),
          transaction
        )
      })

      // Should be able to create a new manual item after expiring the old one
      const secondManualItem = await adminTransaction(
        async ({ transaction }) => {
          return insertSubscriptionItem(
            {
              subscriptionId: testSubscription.id,
              name: 'Second Manual Item',
              priceId: null,
              unitPrice: 0,
              quantity: 0,
              addedDate: Date.now(),
              expiredAt: null,
              metadata: null,
              externalId: null,
              type: SubscriptionItemType.Static,
              manuallyCreated: true,
              livemode: testSubscription.livemode,
            },
            transaction
          )
        }
      )

      expect(secondManualItem.id).not.toBe(firstManualItem.id)
    })
  })
})
