import { beforeEach, describe, expect, it } from 'bun:test'
import {
  CurrencyCode,
  FeatureType,
  FeatureUsageGrantFrequency,
  IntervalUnit,
  LedgerTransactionType,
  PriceType,
  SubscriptionItemType,
  SubscriptionStatus,
  UsageCreditSourceReferenceType,
  UsageCreditStatus,
  UsageCreditType,
} from '@db-core/enums'
import type { Customer } from '@db-core/schema/customers'
import {
  type Feature,
  features as featuresTable,
} from '@db-core/schema/features'
import type { PaymentMethod } from '@db-core/schema/paymentMethods'
import type { Price } from '@db-core/schema/prices'
import type { ProductFeature } from '@db-core/schema/productFeatures'
import type { Product } from '@db-core/schema/products'
import type { SubscriptionItem } from '@db-core/schema/subscriptionItems'
import type { Subscription } from '@db-core/schema/subscriptions'
import { Result } from 'better-result'
import * as R from 'ramda'
import {
  setupBillingPeriod,
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
import { insertFeature } from '@/db/tableMethods/featureMethods'
import { insertProductFeature } from '@/db/tableMethods/productFeatureMethods'
import { selectSubscriptionItemFeatures } from '@/db/tableMethods/subscriptionItemFeatureMethods'
import {
  insertSubscriptionItem,
  selectSubscriptionItems,
} from '@/db/tableMethods/subscriptionItemMethods'
import { expireSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods.server'
import {
  insertUsageCredit,
  selectUsageCredits,
} from '@/db/tableMethods/usageCreditMethods'
import { SubscriptionTerminalStateError } from '@/errors'
import {
  addFeatureToSubscriptionItem,
  createSubscriptionFeatureItems,
} from '@/subscriptions/subscriptionItemFeatureHelpers'
import {
  createCapturingEffectsContext,
  createDiscardingEffectsContext,
} from '@/test-utils/transactionCallbacks'
import { CacheDependency } from '@/utils/cache'
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
  return (
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
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

        const feature = await insertFeature(featureInsertData, ctx)
        const productFeature = await insertProductFeature(
          {
            organizationId,
            livemode,
            productId,
            featureId: feature.id,
          },
          ctx
        )
        createdData.push({ feature, productFeature })
      }
      return Result.ok(createdData)
    })
  ).unwrap()
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
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const result = await createSubscriptionFeatureItems(
            [],
            transaction
          )
          expect(Result.isOk(result)).toBe(true)
          if (Result.isOk(result)) {
            expect(result.value).toEqual([])
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should return an empty array if prices associated with subscription items have no features', async () => {
      // productForFeatures by default has no features linked yet
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const result = await createSubscriptionFeatureItems(
            [subscriptionItem],
            transaction
          )
          expect(Result.isOk(result)).toBe(true)
          if (Result.isOk(result)) {
            expect(result.value).toEqual([])
          }
          const featuresInDb = await selectSubscriptionItemFeatures(
            { subscriptionItemId: [subscriptionItem.id] },
            transaction
          )
          expect(featuresInDb.length).toBe(0)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should return an empty array if prices for subscription items do not exist', async () => {
      const nonExistentPriceSubItem = {
        ...subscriptionItem,
        priceId: 'price_nonexistent_' + core.nanoid(),
      }
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const result = await createSubscriptionFeatureItems(
            [nonExistentPriceSubItem],
            transaction
          )
          expect(Result.isOk(result)).toBe(true)
          if (Result.isOk(result)) {
            expect(result.value).toEqual([])
          }
          return Result.ok(undefined)
        })
      ).unwrap()
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

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const createdSifsResult =
            await createSubscriptionFeatureItems(
              [subscriptionItem],
              transaction
            )
          const createdSifs = createdSifsResult.unwrap()
          expect(createdSifs.length).toBe(1)
          const sif = createdSifs[0]
          expect(sif.subscriptionItemId).toBe(subscriptionItem.id)
          expect(sif.featureId).toBe(usageGrantFeature.id)
          expect(sif.productFeatureId).toBe(productFeature.id)
          expect(sif.type).toBe(FeatureType.UsageCreditGrant)
          expect(sif.amount).toBe(featureAmount)
          expect(sif.renewalFrequency).toBe(renewalFreq)
          expect(sif.usageMeterId).toBe(
            usageGrantFeature.usageMeterId
          )
          expect(sif.livemode).toBe(subscriptionItem.livemode)
          expect(sif.manuallyCreated).toBe(false)

          const featuresInDb = await selectSubscriptionItemFeatures(
            { id: [sif.id] },
            transaction
          )
          expect(featuresInDb.length).toBe(1)
          expect(featuresInDb[0]).toEqual(sif)
          return Result.ok(undefined)
        })
      ).unwrap()
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

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const createdSifsResult =
            await createSubscriptionFeatureItems(
              [subscriptionItem],
              transaction
            )
          const createdSifs = createdSifsResult.unwrap()
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
          return Result.ok(undefined)
        })
      ).unwrap()
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

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const createdSifsResult =
            await createSubscriptionFeatureItems(
              [subscriptionItem],
              transaction
            )
          const createdSifs = createdSifsResult.unwrap()
          expect(createdSifs.length).toBe(2)

          const grantSif = createdSifs.find(
            (s) => s.featureId === grantFeature.id
          )
          const toggleSif = createdSifs.find(
            (s) => s.featureId === toggleFeature.id
          )

          expect(grantSif).toMatchObject({
            type: FeatureType.UsageCreditGrant,
          })
          expect(grantSif?.type).toBe(FeatureType.UsageCreditGrant)
          expect(grantSif?.amount).toBe(grantAmount)
          expect(grantSif?.productFeatureId).toBe(grantPf.id)

          expect(toggleSif).toMatchObject({
            type: FeatureType.Toggle,
          })
          expect(toggleSif?.type).toBe(FeatureType.Toggle)
          expect(toggleSif?.productFeatureId).toBe(togglePf.id)

          const featuresInDb = await selectSubscriptionItemFeatures(
            { subscriptionItemId: [subscriptionItem.id] },
            transaction
          )
          expect(featuresInDb.length).toBe(2)
          return Result.ok(undefined)
        })
      ).unwrap()
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

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const createdSifsResult =
            await createSubscriptionFeatureItems(
              [subscriptionItem, subscriptionItem2],
              transaction
            )
          const createdSifs = createdSifsResult.unwrap()
          expect(createdSifs.length).toBe(2)

          const sif1 = createdSifs.find(
            (s) => s.subscriptionItemId === subscriptionItem.id
          )
          const sif2 = createdSifs.find(
            (s) => s.subscriptionItemId === subscriptionItem2.id
          )

          expect(sif1).toMatchObject({ featureId: singleFeature.id })
          expect(sif1?.featureId).toBe(singleFeature.id)
          expect(sif1?.productFeatureId).toBe(productFeature.id)

          expect(sif2).toMatchObject({ featureId: singleFeature.id })
          expect(sif2?.featureId).toBe(singleFeature.id)
          expect(sif2?.productFeatureId).toBe(productFeature.id)

          const featuresInDb = await selectSubscriptionItemFeatures(
            { featureId: [singleFeature.id] },
            transaction
          )
          expect(featuresInDb.length).toBe(2)
          expect(
            featuresInDb.map((f) => f.subscriptionItemId).sort()
          ).toEqual(
            [subscriptionItem.id, subscriptionItem2.id].sort()
          )
          return Result.ok(undefined)
        })
      ).unwrap()
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

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const createdSifsResult =
            await createSubscriptionFeatureItems(
              [subscriptionItem2],
              transaction
            )
          const createdSifs = createdSifsResult.unwrap()
          expect(createdSifs.length).toBe(1)
          const sif = createdSifs[0]
          expect(sif.subscriptionItemId).toBe(subscriptionItem2.id)
          expect(sif.amount).toBe(featureAmount * quantity)
          return Result.ok(undefined)
        })
      ).unwrap()
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

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
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

          const createdFeaturesResult =
            await createSubscriptionFeatureItems(
              [regularItem, manualItem],
              transaction
            )
          const createdFeatures = createdFeaturesResult.unwrap()

          // Should create features for regular item only
          expect(createdFeatures.length).toBe(1)
          expect(createdFeatures[0].subscriptionItemId).toBe(
            regularItem.id
          )
          expect(createdFeatures[0].featureId).toBe(productFeature.id)
          return Result.ok(undefined)
        })
      ).unwrap()
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

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const firstResult = (
            await addFeatureToSubscriptionItem(
              {
                id: subscription.id,
                featureId: toggleFeature.id,
                grantCreditsImmediately: false,
              },
              createDiscardingEffectsContext(transaction)
            )
          ).unwrap()
          const secondResult = (
            await addFeatureToSubscriptionItem(
              {
                id: subscription.id,
                featureId: toggleFeature.id,
                grantCreditsImmediately: false,
              },
              createDiscardingEffectsContext(transaction)
            )
          ).unwrap()
          expect(secondResult.subscriptionItemFeature.id).toBe(
            firstResult.subscriptionItemFeature.id
          )
          return Result.ok(undefined)
        })
      ).unwrap()
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

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const { ctx: effectsCtx, effects } =
            createCapturingEffectsContext(transaction)
          const result = (
            await addFeatureToSubscriptionItem(
              {
                id: subscription.id,
                featureId: usageFeature.id,
                grantCreditsImmediately: true,
              },
              effectsCtx
            )
          ).unwrap()

          const manualSubscriptionItems =
            await selectSubscriptionItems(
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

          const expectedImmediateGrantAmount =
            usageFeature.amount ?? 0
          const expectedRecurringGrantAmount =
            (usageFeature.amount ?? 0) * subscriptionItem.quantity

          expect(effects.ledgerCommands.length).toBe(1)
          expect(effects.ledgerCommands[0]).toMatchObject({
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
          return Result.ok(undefined)
        })
      ).unwrap()
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

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const { ctx: firstCtx, effects: firstEffects } =
            createCapturingEffectsContext(transaction)
          const firstResult = (
            await addFeatureToSubscriptionItem(
              {
                id: subscription.id,
                featureId: usageFeature.id,
                grantCreditsImmediately: false,
              },
              firstCtx
            )
          ).unwrap()
          const { ctx: secondCtx, effects: secondEffects } =
            createCapturingEffectsContext(transaction)
          const secondResult = (
            await addFeatureToSubscriptionItem(
              {
                id: subscription.id,
                featureId: usageFeature.id,
                grantCreditsImmediately: true,
              },
              secondCtx
            )
          ).unwrap()

          expect(secondResult.subscriptionItemFeature.id).toBe(
            firstResult.subscriptionItemFeature.id
          )
          const expectedImmediateGrantAmount =
            usageFeature.amount ?? 0
          const expectedRecurringGrantAmount =
            (usageFeature.amount ?? 0) * subscriptionItem.quantity
          const expectedCumulativeGrantAmount =
            expectedRecurringGrantAmount +
            expectedRecurringGrantAmount

          expect(secondEffects.ledgerCommands.length).toBe(1)
          expect(secondEffects.ledgerCommands[0]).toMatchObject({
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
                  secondResult.subscriptionItemFeature.id,
                sourceReferenceType:
                  UsageCreditSourceReferenceType.ManualAdjustment,
                creditType: UsageCreditType.Grant,
                status: UsageCreditStatus.Posted,
                issuedAmount: expectedImmediateGrantAmount,
              }),
            },
          })

          const manualSubscriptionItems =
            await selectSubscriptionItems(
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
          expect(firstEffects.ledgerCommands.length).toBe(0)
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

          const usageCreditsResult = await selectUsageCredits(
            {
              subscriptionId: subscription.id,
              usageMeterId: usageFeature.usageMeterId!,
            },
            transaction
          )
          expect(
            usageCreditsResult.some(
              (credit) =>
                credit.sourceReferenceId ===
                secondResult.subscriptionItemFeature.id
            )
          ).toBe(true)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('rejects features outside the subscription pricing model', async () => {
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
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
            ctx
          )

          await insertProductFeature(
            {
              organizationId: orgData.organization.id,
              livemode: true,
              productId: productForFeatures.id,
              featureId: mismatchedFeature.id,
            },
            ctx
          )

          const result = await addFeatureToSubscriptionItem(
            {
              id: subscription.id,
              featureId: mismatchedFeature.id,
              grantCreditsImmediately: false,
            },
            createDiscardingEffectsContext(transaction)
          )
          expect(Result.isError(result)).toBe(true)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should reject adding features to a canceled subscription', async () => {
      const [{ feature: toggleFeature }] =
        await setupTestFeaturesAndProductFeatures(
          orgData.organization.id,
          productForFeatures.id,
          orgData.pricingModel.id,
          true,
          [
            {
              name: 'Feature for Canceled Sub',
              type: FeatureType.Toggle,
            },
          ]
        )

      // Create a subscription with Canceled status
      const canceledSubscription = await setupSubscription({
        organizationId: orgData.organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: priceForFeatures.id,
        livemode: true,
        status: SubscriptionStatus.Canceled,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const result = await addFeatureToSubscriptionItem(
            {
              id: canceledSubscription.id,
              featureId: toggleFeature.id,
              grantCreditsImmediately: false,
            },
            createDiscardingEffectsContext(transaction)
          )
          expect(Result.isError(result)).toBe(true)
          if (Result.isError(result)) {
            expect(result.error).toBeInstanceOf(
              SubscriptionTerminalStateError
            )
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should reject adding features to an incomplete_expired subscription', async () => {
      const [{ feature: toggleFeature }] =
        await setupTestFeaturesAndProductFeatures(
          orgData.organization.id,
          productForFeatures.id,
          orgData.pricingModel.id,
          true,
          [
            {
              name: 'Feature for IncompleteExpired Sub',
              type: FeatureType.Toggle,
            },
          ]
        )

      // Create a subscription with IncompleteExpired status
      const incompleteExpiredSubscription = await setupSubscription({
        organizationId: orgData.organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: priceForFeatures.id,
        livemode: true,
        status: SubscriptionStatus.IncompleteExpired,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const result = await addFeatureToSubscriptionItem(
            {
              id: incompleteExpiredSubscription.id,
              featureId: toggleFeature.id,
              grantCreditsImmediately: false,
            },
            createDiscardingEffectsContext(transaction)
          )
          expect(Result.isError(result)).toBe(true)
          if (Result.isError(result)) {
            expect(result.error).toBeInstanceOf(
              SubscriptionTerminalStateError
            )
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('allows adding features without a product association', async () => {
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
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
            ctx
          )

          const result = (
            await addFeatureToSubscriptionItem(
              {
                id: subscription.id,
                featureId: standaloneFeature.id,
                grantCreditsImmediately: false,
              },
              createDiscardingEffectsContext(transaction)
            )
          ).unwrap()

          const manualSubscriptionItems =
            await selectSubscriptionItems(
              {
                subscriptionId: subscription.id,
                manuallyCreated: true,
                expiredAt: null,
              },
              transaction
            )

          expect(manualSubscriptionItems.length).toEqual(1)
          const manualSubscriptionItem = manualSubscriptionItems[0]

          expect(result.subscriptionItemFeature).toEqual(
            expect.objectContaining({
              subscriptionItemId: manualSubscriptionItem.id,
              featureId: standaloneFeature.id,
              productFeatureId: null,
            })
          )
          return Result.ok(undefined)
        })
      ).unwrap()
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

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const result = (
            await addFeatureToSubscriptionItem(
              {
                id: subscription.id,
                featureId: toggleFeature.id,
                grantCreditsImmediately: false,
              },
              createDiscardingEffectsContext(transaction)
            )
          ).unwrap()

          expect(result.subscriptionItemFeature.manuallyCreated).toBe(
            true
          )

          // Verify in database
          const [sif] = await selectSubscriptionItemFeatures(
            { id: [result.subscriptionItemFeature.id] },
            transaction
          )
          expect(sif.manuallyCreated).toBe(true)
          return Result.ok(undefined)
        })
      ).unwrap()
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

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const result = (
            await addFeatureToSubscriptionItem(
              {
                id: subscription.id,
                featureId: usageFeature.id,
                grantCreditsImmediately: false,
              },
              createDiscardingEffectsContext(transaction)
            )
          ).unwrap()

          expect(result.subscriptionItemFeature.manuallyCreated).toBe(
            true
          )

          // Verify in database
          const [sif] = await selectSubscriptionItemFeatures(
            { id: [result.subscriptionItemFeature.id] },
            transaction
          )
          expect(sif.manuallyCreated).toBe(true)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('emits cache invalidation for the manual subscription item features', async () => {
      const [{ feature: toggleFeature }] =
        await setupTestFeaturesAndProductFeatures(
          orgData.organization.id,
          productForFeatures.id,
          orgData.pricingModel.id,
          true,
          [{ name: 'Cache Test Feature', type: FeatureType.Toggle }]
        )

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const { ctx: effectsCtx, effects } =
            createCapturingEffectsContext(transaction)
          const result = (
            await addFeatureToSubscriptionItem(
              {
                id: subscription.id,
                featureId: toggleFeature.id,
                grantCreditsImmediately: false,
              },
              effectsCtx
            )
          ).unwrap()

          // Verify cache invalidation was emitted for the manual subscription item
          const manualItemId =
            result.subscriptionItemFeature.subscriptionItemId
          expect(effects.cacheInvalidations).toContainEqual(
            CacheDependency.subscriptionItemFeatures(manualItemId)
          )
          return Result.ok(undefined)
        })
      ).unwrap()
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

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const result1 = (
            await addFeatureToSubscriptionItem(
              {
                id: subscription.id,
                featureId: feature1.id,
                grantCreditsImmediately: false,
              },
              createDiscardingEffectsContext(transaction)
            )
          ).unwrap()

          const result2 = (
            await addFeatureToSubscriptionItem(
              {
                id: subscription.id,
                featureId: feature2.id,
                grantCreditsImmediately: false,
              },
              createDiscardingEffectsContext(transaction)
            )
          ).unwrap()

          // Both features should be on the same manual subscription item
          expect(
            result1.subscriptionItemFeature.subscriptionItemId
          ).toBe(result2.subscriptionItemFeature.subscriptionItemId)

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
          return Result.ok(undefined)
        })
      ).unwrap()
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

        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            // First call - should grant credits
            const { ctx: firstCtx, effects: firstEffects } =
              createCapturingEffectsContext(transaction)
            await addFeatureToSubscriptionItem(
              {
                id: subscription.id,
                featureId: usageFeature.id,
                grantCreditsImmediately: true,
              },
              firstCtx
            )
            expect(firstEffects.ledgerCommands.length).toBe(1)
            expect(firstEffects.ledgerCommands[0]).toMatchObject({
              type: LedgerTransactionType.CreditGrantRecognized,
            })

            // Second call - should NOT grant duplicate credits
            const { ctx: secondCtx, effects: secondEffects } =
              createCapturingEffectsContext(transaction)
            await addFeatureToSubscriptionItem(
              {
                id: subscription.id,
                featureId: usageFeature.id,
                grantCreditsImmediately: true,
              },
              secondCtx
            )
            // Second call should not produce a ledger command (credit was deduplicated)
            expect(secondEffects.ledgerCommands.length).toBe(0)

            // Verify only 1 credit exists
            const usageCreditRecords = await selectUsageCredits(
              {
                subscriptionId: subscription.id,
                usageMeterId: usageFeature.usageMeterId!,
              },
              transaction
            )
            expect(usageCreditRecords.length).toBe(1)
            return Result.ok(undefined)
          })
        ).unwrap()
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

        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            // Call 5 times with grantCreditsImmediately: true
            for (let i = 0; i < 5; i++) {
              await addFeatureToSubscriptionItem(
                {
                  id: subscription.id,
                  featureId: usageFeature.id,
                  grantCreditsImmediately: true,
                },
                createDiscardingEffectsContext(transaction)
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
            return Result.ok(undefined)
          })
        ).unwrap()
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

        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            // Grant credits for feature A
            const { ctx: ctxA, effects: effectsA } =
              createCapturingEffectsContext(transaction)
            await addFeatureToSubscriptionItem(
              {
                id: subscription.id,
                featureId: featureA.id,
                grantCreditsImmediately: true,
              },
              ctxA
            )
            expect(effectsA.ledgerCommands.length).toBe(1)
            expect(effectsA.ledgerCommands[0]).toMatchObject({
              type: LedgerTransactionType.CreditGrantRecognized,
            })

            // Grant credits for feature B
            const { ctx: ctxB, effects: effectsB } =
              createCapturingEffectsContext(transaction)
            await addFeatureToSubscriptionItem(
              {
                id: subscription.id,
                featureId: featureB.id,
                grantCreditsImmediately: true,
              },
              ctxB
            )
            expect(effectsB.ledgerCommands.length).toBe(1)
            expect(effectsB.ledgerCommands[0]).toMatchObject({
              type: LedgerTransactionType.CreditGrantRecognized,
            })

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
            return Result.ok(undefined)
          })
        ).unwrap()
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

        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            // First call creates sub_item_feature_1 and grants credits
            const result1 = (
              await addFeatureToSubscriptionItem(
                {
                  id: subscription.id,
                  featureId: usageFeature.id,
                  grantCreditsImmediately: true,
                },
                createDiscardingEffectsContext(transaction)
              )
            ).unwrap()
            const firstSubFeatureId =
              result1.subscriptionItemFeature.id

            // Second call updates sub_item_feature (same ID due to upsert)
            // but should NOT grant duplicate credits
            const { ctx: effectsCtx, effects } =
              createCapturingEffectsContext(transaction)
            const result2 = (
              await addFeatureToSubscriptionItem(
                {
                  id: subscription.id,
                  featureId: usageFeature.id,
                  grantCreditsImmediately: true,
                },
                effectsCtx
              )
            ).unwrap()

            // The subscription item feature ID should be the same (due to upsert)
            expect(result2.subscriptionItemFeature.id).toBe(
              firstSubFeatureId
            )

            // But no duplicate credit should be created
            expect(effects.ledgerCommands.length).toBe(0)

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
            return Result.ok(undefined)
          })
        ).unwrap()
      })

      it('should deduplicate when no billing period exists (null billingPeriodId)', async () => {
        // This test explicitly verifies the isNull(billingPeriodId) branch
        // Note: The test setup does NOT create a billing period, so credits will have null billingPeriodId
        const [{ feature: usageFeature }] =
          await setupTestFeaturesAndProductFeatures(
            orgData.organization.id,
            productForFeatures.id,
            orgData.pricingModel.id,
            true,
            [
              {
                name: 'No Billing Period Feature',
                type: FeatureType.UsageCreditGrant,
                amount: 100,
                renewalFrequency:
                  FeatureUsageGrantFrequency.EveryBillingPeriod,
                usageMeterName: 'no-billing-period-meter',
              },
            ]
          )

        await setupLedgerAccount({
          subscriptionId: subscription.id,
          usageMeterId: usageFeature.usageMeterId!,
          organizationId: orgData.organization.id,
          livemode: true,
        })

        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            // First call - grants credits with null billingPeriodId
            const { ctx: firstCtx, effects: firstEffects } =
              createCapturingEffectsContext(transaction)
            await addFeatureToSubscriptionItem(
              {
                id: subscription.id,
                featureId: usageFeature.id,
                grantCreditsImmediately: true,
              },
              firstCtx
            )
            expect(firstEffects.ledgerCommands.length).toBe(1)
            expect(firstEffects.ledgerCommands[0]).toMatchObject({
              type: LedgerTransactionType.CreditGrantRecognized,
            })

            // Verify the credit has null billingPeriodId
            const creditsAfterFirst = await selectUsageCredits(
              {
                subscriptionId: subscription.id,
                usageMeterId: usageFeature.usageMeterId!,
              },
              transaction
            )
            expect(creditsAfterFirst.length).toBe(1)
            expect(creditsAfterFirst[0].billingPeriodId).toBeNull()

            // Second call - should be deduplicated via isNull(billingPeriodId) check
            const { ctx: secondCtx, effects: secondEffects } =
              createCapturingEffectsContext(transaction)
            await addFeatureToSubscriptionItem(
              {
                id: subscription.id,
                featureId: usageFeature.id,
                grantCreditsImmediately: true,
              },
              secondCtx
            )
            expect(secondEffects.ledgerCommands.length).toBe(0)

            // Verify still only 1 credit exists
            const creditsAfterSecond = await selectUsageCredits(
              {
                subscriptionId: subscription.id,
                usageMeterId: usageFeature.usageMeterId!,
              },
              transaction
            )
            expect(creditsAfterSecond.length).toBe(1)
            return Result.ok(undefined)
          })
        ).unwrap()
      })

      it('should deduplicate within a billing period when one exists', async () => {
        // This test explicitly verifies the eq(billingPeriodId, currentBillingPeriod.id) branch
        const [{ feature: usageFeature }] =
          await setupTestFeaturesAndProductFeatures(
            orgData.organization.id,
            productForFeatures.id,
            orgData.pricingModel.id,
            true,
            [
              {
                name: 'With Billing Period Feature',
                type: FeatureType.UsageCreditGrant,
                amount: 150,
                renewalFrequency:
                  FeatureUsageGrantFrequency.EveryBillingPeriod,
                usageMeterName: 'with-billing-period-meter',
              },
            ]
          )

        await setupLedgerAccount({
          subscriptionId: subscription.id,
          usageMeterId: usageFeature.usageMeterId!,
          organizationId: orgData.organization.id,
          livemode: true,
        })

        // Create a billing period for this subscription
        const now = Date.now()
        const billingPeriod = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: now - 1000 * 60 * 60 * 24, // 1 day ago
          endDate: now + 1000 * 60 * 60 * 24 * 29, // 29 days from now
          livemode: true,
        })

        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            // First call - grants credits with the billing period
            const { ctx: firstCtx, effects: firstEffects } =
              createCapturingEffectsContext(transaction)
            await addFeatureToSubscriptionItem(
              {
                id: subscription.id,
                featureId: usageFeature.id,
                grantCreditsImmediately: true,
              },
              firstCtx
            )
            expect(firstEffects.ledgerCommands.length).toBe(1)
            expect(firstEffects.ledgerCommands[0]).toMatchObject({
              type: LedgerTransactionType.CreditGrantRecognized,
            })

            // Verify the credit has the billing period ID
            const creditsAfterFirst = await selectUsageCredits(
              {
                subscriptionId: subscription.id,
                usageMeterId: usageFeature.usageMeterId!,
              },
              transaction
            )
            expect(creditsAfterFirst.length).toBe(1)
            expect(creditsAfterFirst[0].billingPeriodId).toBe(
              billingPeriod.id
            )

            // Second call - should be deduplicated within the same billing period
            const { ctx: secondCtx, effects: secondEffects } =
              createCapturingEffectsContext(transaction)
            await addFeatureToSubscriptionItem(
              {
                id: subscription.id,
                featureId: usageFeature.id,
                grantCreditsImmediately: true,
              },
              secondCtx
            )
            expect(secondEffects.ledgerCommands.length).toBe(0)

            // Verify still only 1 credit exists
            const creditsAfterSecond = await selectUsageCredits(
              {
                subscriptionId: subscription.id,
                usageMeterId: usageFeature.usageMeterId!,
              },
              transaction
            )
            expect(creditsAfterSecond.length).toBe(1)
            return Result.ok(undefined)
          })
        ).unwrap()
      })

      it('should allow new credits in a different billing period (credits in period 1 do not block period 2)', async () => {
        // This test verifies that deduplication is scoped to the billing period
        // A credit in period 1 should NOT block grants in period 2
        const [{ feature: usageFeature }] =
          await setupTestFeaturesAndProductFeatures(
            orgData.organization.id,
            productForFeatures.id,
            orgData.pricingModel.id,
            true,
            [
              {
                name: 'Cross Period Feature',
                type: FeatureType.UsageCreditGrant,
                amount: 200,
                renewalFrequency:
                  FeatureUsageGrantFrequency.EveryBillingPeriod,
                usageMeterName: 'cross-period-meter',
              },
            ]
          )

        await setupLedgerAccount({
          subscriptionId: subscription.id,
          usageMeterId: usageFeature.usageMeterId!,
          organizationId: orgData.organization.id,
          livemode: true,
        })

        const now = Date.now()

        // Create first billing period (in the past)
        const billingPeriod1 = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: now - 1000 * 60 * 60 * 24 * 60, // 60 days ago
          endDate: now - 1000 * 60 * 60 * 24 * 30, // 30 days ago
          livemode: true,
        })

        // Create second billing period (current)
        const billingPeriod2 = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: now - 1000 * 60 * 60 * 24, // 1 day ago
          endDate: now + 1000 * 60 * 60 * 24 * 29, // 29 days from now
          livemode: true,
        })

        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            // First, manually create a subscription item feature to reference
            const manualFeatureResult = (
              await addFeatureToSubscriptionItem(
                {
                  id: subscription.id,
                  featureId: usageFeature.id,
                  grantCreditsImmediately: false, // Don't grant yet
                },
                createDiscardingEffectsContext(transaction)
              )
            ).unwrap()
            const subItemFeatureId =
              manualFeatureResult.subscriptionItemFeature.id

            // Directly insert a credit for billing period 1 (simulating a past grant)
            await insertUsageCredit(
              {
                subscriptionId: subscription.id,
                organizationId: orgData.organization.id,
                livemode: true,
                creditType: UsageCreditType.Grant,
                sourceReferenceId: subItemFeatureId,
                sourceReferenceType:
                  UsageCreditSourceReferenceType.ManualAdjustment,
                billingPeriodId: billingPeriod1.id,
                usageMeterId: usageFeature.usageMeterId!,
                paymentId: null,
                issuedAmount: 200,
                issuedAt: now - 1000 * 60 * 60 * 24 * 45, // 45 days ago
                expiresAt: billingPeriod1.endDate,
                status: UsageCreditStatus.Posted,
                notes: null,
                metadata: null,
              },
              transaction
            )

            // Verify we have 1 credit in period 1
            const creditsBeforeGrant = await selectUsageCredits(
              {
                subscriptionId: subscription.id,
                usageMeterId: usageFeature.usageMeterId!,
              },
              transaction
            )
            expect(creditsBeforeGrant.length).toBe(1)
            expect(creditsBeforeGrant[0].billingPeriodId).toBe(
              billingPeriod1.id
            )

            // Now call addFeatureToSubscriptionItem with grantCreditsImmediately: true
            // This should grant credits for period 2, NOT be blocked by the period 1 credit
            const { ctx: effectsCtx, effects } =
              createCapturingEffectsContext(transaction)
            await addFeatureToSubscriptionItem(
              {
                id: subscription.id,
                featureId: usageFeature.id,
                grantCreditsImmediately: true,
              },
              effectsCtx
            )

            // Should have granted credits (not blocked by period 1 credit)
            expect(effects.ledgerCommands.length).toBe(1)
            expect(effects.ledgerCommands[0]).toMatchObject({
              type: LedgerTransactionType.CreditGrantRecognized,
            })

            // Verify we now have 2 credits - one in each period
            const creditsAfterGrant = await selectUsageCredits(
              {
                subscriptionId: subscription.id,
                usageMeterId: usageFeature.usageMeterId!,
              },
              transaction
            )
            expect(creditsAfterGrant.length).toBe(2)

            // Verify one credit is in period 1 and one is in period 2
            const period1Credits = creditsAfterGrant.filter(
              (c) => c.billingPeriodId === billingPeriod1.id
            )
            const period2Credits = creditsAfterGrant.filter(
              (c) => c.billingPeriodId === billingPeriod2.id
            )
            expect(period1Credits.length).toBe(1)
            expect(period2Credits.length).toBe(1)
            return Result.ok(undefined)
          })
        ).unwrap()
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

      const result = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await insertSubscriptionItem(
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
        return Result.ok(undefined)
      })
      expect(Result.isError(result)).toBe(true)
    })

    it('should reject when unitPrice is not zero', async () => {
      const testSubscription = await setupSubscription({
        organizationId: orgData.organization.id,
        customerId: customer.id,
        priceId: priceForFeatures.id,
        paymentMethodId: paymentMethod.id,
        livemode: true,
      })

      const result = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await insertSubscriptionItem(
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
        return Result.ok(undefined)
      })
      expect(Result.isError(result)).toBe(true)
    })

    it('should allow valid manual item', async () => {
      const testSubscription = await setupSubscription({
        organizationId: orgData.organization.id,
        customerId: customer.id,
        priceId: priceForFeatures.id,
        paymentMethodId: paymentMethod.id,
        livemode: true,
      })

      const validManualItem = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return Result.ok(
            await insertSubscriptionItem(
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
          )
        })
      ).unwrap()

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
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return Result.ok(
            await insertSubscriptionItem(
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
          )
        })
      ).unwrap()

      // Try to create second manual item
      const result = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await insertSubscriptionItem(
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
        return Result.ok(undefined)
      })
      expect(Result.isError(result)).toBe(true)
    })

    it('should reject manual item with quantity != 0', async () => {
      const testSubscription = await setupSubscription({
        organizationId: orgData.organization.id,
        customerId: customer.id,
        priceId: priceForFeatures.id,
        paymentMethodId: paymentMethod.id,
        livemode: true,
      })

      const result = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await insertSubscriptionItem(
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
        return Result.ok(undefined)
      })
      expect(Result.isError(result)).toBe(true)
    })

    it('should reject manual item with priceId != null', async () => {
      const testSubscription = await setupSubscription({
        organizationId: orgData.organization.id,
        customerId: customer.id,
        priceId: priceForFeatures.id,
        paymentMethodId: paymentMethod.id,
        livemode: true,
      })

      const result = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await insertSubscriptionItem(
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
        return Result.ok(undefined)
      })
      expect(Result.isError(result)).toBe(true)
    })

    it('should reject non-manual item with quantity = 0', async () => {
      const testSubscription = await setupSubscription({
        organizationId: orgData.organization.id,
        customerId: customer.id,
        priceId: priceForFeatures.id,
        paymentMethodId: paymentMethod.id,
        livemode: true,
      })

      const result = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await insertSubscriptionItem(
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
        return Result.ok(undefined)
      })
      expect(Result.isError(result)).toBe(true)
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
      const firstManualItem = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return Result.ok(
            await insertSubscriptionItem(
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
          )
        })
      ).unwrap()

      // Expire the first manual item
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await expireSubscriptionItems(
            [firstManualItem.id],
            Date.now(),
            transaction
          )
          return Result.ok(undefined)
        })
      ).unwrap()

      // Should be able to create a new manual item after expiring the old one
      const secondManualItem = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return Result.ok(
            await insertSubscriptionItem(
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
          )
        })
      ).unwrap()

      expect(secondManualItem.id).not.toBe(firstManualItem.id)
    })
  })
})
