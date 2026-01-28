import { beforeEach, describe, expect, it } from 'vitest'
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
import type { Customer } from '@/db/schema/customers'
import type { Feature } from '@/db/schema/features'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { ProductFeature } from '@/db/schema/productFeatures'
import type { Product } from '@/db/schema/products'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'
import { insertFeature } from '@/db/tableMethods/featureMethods'
import { insertProductFeature } from '@/db/tableMethods/productFeatureMethods'
import { selectSubscriptionItemFeatures } from '@/db/tableMethods/subscriptionItemFeatureMethods'
import { expireSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods'
import { selectUsageCredits } from '@/db/tableMethods/usageCreditMethods'
import { addFeatureToSubscriptionItem } from '@/subscriptions/subscriptionItemFeatureHelpers'
import {
  createCapturingEffectsContext,
  createDiscardingEffectsContext,
} from '@/test-utils/transactionCallbacks'
import {
  BillingPeriodStatus,
  CurrencyCode,
  FeatureType,
  FeatureUsageGrantFrequency,
  IntervalUnit,
  LedgerTransactionType,
  PriceType,
  UsageCreditSourceReferenceType,
  UsageCreditStatus,
  UsageCreditType,
} from '@/types'
import { core } from '@/utils/core'

// Local helper to create features and productFeatures for tests
// (Follows pattern from subscriptionItemFeatureHelpers.test.ts)
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

describe('addFeatureToSubscription mutation', () => {
  let orgData: Awaited<ReturnType<typeof setupOrg>>
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let product: Product.Record
  let price: Price.Record
  let subscription: Subscription.Record
  let subscriptionItem: SubscriptionItem.Record

  beforeEach(async () => {
    orgData = (await setupOrg()).unwrap()
    customer = (
      await setupCustomer({
        organizationId: orgData.organization.id,
        livemode: true,
      })
    ).unwrap()
    paymentMethod = (
      await setupPaymentMethod({
        organizationId: orgData.organization.id,
        customerId: customer.id,
        livemode: true,
      })
    ).unwrap()

    product = await setupProduct({
      organizationId: orgData.organization.id,
      name: 'Test Product for Feature',
      livemode: true,
      pricingModelId: orgData.pricingModel.id,
    })

    price = await setupPrice({
      productId: product.id,
      name: 'Monthly Plan',
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
      priceId: price.id,
      livemode: true,
    })

    subscriptionItem = await setupSubscriptionItem({
      subscriptionId: subscription.id,
      name: 'Main Subscription Item',
      quantity: 1,
      unitPrice: price.unitPrice,
      priceId: price.id,
    })
  })

  describe('Toggle feature', () => {
    it('should successfully add a Toggle feature to a subscription', async () => {
      const [{ feature: toggleFeature }] =
        await setupTestFeaturesAndProductFeatures(
          orgData.organization.id,
          product.id,
          orgData.pricingModel.id,
          true,
          [{ name: 'API Access', type: FeatureType.Toggle }]
        )

      await adminTransaction(async ({ transaction }) => {
        const result = await addFeatureToSubscriptionItem(
          {
            subscriptionItemId: subscriptionItem.id,
            featureId: toggleFeature.id,
            grantCreditsImmediately: false,
          },
          createDiscardingEffectsContext(transaction)
        )

        expect(result.subscriptionItemFeature.featureId).toBe(
          toggleFeature.id
        )
        expect(result.subscriptionItemFeature.type).toBe(
          FeatureType.Toggle
        )
        expect(result.subscriptionItemFeature.amount).toBeNull()
        expect(result.subscriptionItemFeature.usageMeterId).toBeNull()
        expect(result.subscriptionItemFeature.manuallyCreated).toBe(
          true
        )
      })
    })

    it('should throw error when grantCreditsImmediately is used with Toggle feature', async () => {
      const [{ feature: toggleFeature }] =
        await setupTestFeaturesAndProductFeatures(
          orgData.organization.id,
          product.id,
          orgData.pricingModel.id,
          true,
          [{ name: 'Toggle Feature', type: FeatureType.Toggle }]
        )

      await adminTransaction(async ({ transaction }) => {
        await expect(
          addFeatureToSubscriptionItem(
            {
              subscriptionItemId: subscriptionItem.id,
              featureId: toggleFeature.id,
              grantCreditsImmediately: true,
            },
            createDiscardingEffectsContext(transaction)
          )
        ).rejects.toThrow(
          'grantCreditsImmediately is only supported for usage credit features.'
        )
      })
    })
  })

  describe('UsageCreditGrant feature', () => {
    it('should successfully add a UsageCreditGrant feature to a subscription', async () => {
      const [{ feature: usageCreditFeature }] =
        await setupTestFeaturesAndProductFeatures(
          orgData.organization.id,
          product.id,
          orgData.pricingModel.id,
          true,
          [
            {
              name: 'API Credits',
              type: FeatureType.UsageCreditGrant,
              amount: 100,
              renewalFrequency:
                FeatureUsageGrantFrequency.EveryBillingPeriod,
              usageMeterName: 'API Calls Meter',
            },
          ]
        )

      await adminTransaction(async ({ transaction }) => {
        const result = await addFeatureToSubscriptionItem(
          {
            subscriptionItemId: subscriptionItem.id,
            featureId: usageCreditFeature.id,
            grantCreditsImmediately: false,
          },
          createDiscardingEffectsContext(transaction)
        )

        expect(result.subscriptionItemFeature.featureId).toBe(
          usageCreditFeature.id
        )
        expect(result.subscriptionItemFeature.type).toBe(
          FeatureType.UsageCreditGrant
        )
        expect(result.subscriptionItemFeature.amount).toBe(100)
        expect(result.subscriptionItemFeature.usageMeterId).toBe(
          usageCreditFeature.usageMeterId
        )
        expect(result.subscriptionItemFeature.renewalFrequency).toBe(
          FeatureUsageGrantFrequency.EveryBillingPeriod
        )
        expect(result.subscriptionItemFeature.manuallyCreated).toBe(
          true
        )
      })
    })

    it('should grant immediate credits when grantCreditsImmediately is true', async () => {
      const [{ feature: usageCreditFeature }] =
        await setupTestFeaturesAndProductFeatures(
          orgData.organization.id,
          product.id,
          orgData.pricingModel.id,
          true,
          [
            {
              name: 'Immediate Credits Feature',
              type: FeatureType.UsageCreditGrant,
              amount: 250,
              renewalFrequency:
                FeatureUsageGrantFrequency.EveryBillingPeriod,
              usageMeterName: 'Immediate Grant Meter',
            },
          ]
        )

      await setupLedgerAccount({
        subscriptionId: subscription.id,
        usageMeterId: usageCreditFeature.usageMeterId!,
        organizationId: orgData.organization.id,
        livemode: true,
      })

      const now = Date.now()
      await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: now - 1000 * 60 * 60 * 24, // 1 day ago
        endDate: now + 1000 * 60 * 60 * 24 * 30, // 30 days from now
        status: BillingPeriodStatus.Active,
        livemode: true,
      })

      await adminTransaction(async ({ transaction }) => {
        const { ctx, effects } =
          createCapturingEffectsContext(transaction)

        const result = await addFeatureToSubscriptionItem(
          {
            subscriptionItemId: subscriptionItem.id,
            featureId: usageCreditFeature.id,
            grantCreditsImmediately: true,
          },
          ctx
        )

        // Verify ledger command was enqueued
        expect(effects.ledgerCommands.length).toBe(1)
        expect(effects.ledgerCommands[0]).toMatchObject({
          type: LedgerTransactionType.CreditGrantRecognized,
          organizationId: orgData.organization.id,
          livemode: true,
          subscriptionId: subscription.id,
          payload: {
            usageCredit: expect.objectContaining({
              subscriptionId: subscription.id,
              usageMeterId: usageCreditFeature.usageMeterId,
              creditType: UsageCreditType.Grant,
              status: UsageCreditStatus.Posted,
              sourceReferenceType:
                UsageCreditSourceReferenceType.ManualAdjustment,
              issuedAmount: usageCreditFeature.amount,
            }),
          },
        })

        // Verify usage credit was created in database
        const usageCredits = await selectUsageCredits(
          {
            subscriptionId: subscription.id,
            usageMeterId: usageCreditFeature.usageMeterId!,
          },
          transaction
        )
        expect(usageCredits.length).toBe(1)
        expect(usageCredits[0].issuedAmount).toBe(
          usageCreditFeature.amount
        )
      })
    })

    it('should NOT grant immediate credits when grantCreditsImmediately is false', async () => {
      const [{ feature: usageCreditFeature }] =
        await setupTestFeaturesAndProductFeatures(
          orgData.organization.id,
          product.id,
          orgData.pricingModel.id,
          true,
          [
            {
              name: 'No Immediate Credits Feature',
              type: FeatureType.UsageCreditGrant,
              amount: 150,
              renewalFrequency:
                FeatureUsageGrantFrequency.EveryBillingPeriod,
              usageMeterName: 'No Immediate Grant Meter',
            },
          ]
        )

      await setupLedgerAccount({
        subscriptionId: subscription.id,
        usageMeterId: usageCreditFeature.usageMeterId!,
        organizationId: orgData.organization.id,
        livemode: true,
      })

      await adminTransaction(async ({ transaction }) => {
        const { ctx, effects } =
          createCapturingEffectsContext(transaction)

        await addFeatureToSubscriptionItem(
          {
            subscriptionItemId: subscriptionItem.id,
            featureId: usageCreditFeature.id,
            grantCreditsImmediately: false,
          },
          ctx
        )

        // No ledger command should be enqueued
        expect(effects.ledgerCommands.length).toBe(0)

        // No usage credit should be created
        const usageCredits = await selectUsageCredits(
          {
            subscriptionId: subscription.id,
            usageMeterId: usageCreditFeature.usageMeterId!,
          },
          transaction
        )
        expect(usageCredits.length).toBe(0)
      })
    })
  })

  describe('Validation errors', () => {
    it('should throw error when subscription item is expired', async () => {
      const [{ feature: toggleFeature }] =
        await setupTestFeaturesAndProductFeatures(
          orgData.organization.id,
          product.id,
          orgData.pricingModel.id,
          true,
          [
            {
              name: 'Feature for Expired Item',
              type: FeatureType.Toggle,
            },
          ]
        )

      await adminTransaction(async ({ transaction }) => {
        // Expire the subscription item
        await expireSubscriptionItems(
          [subscriptionItem.id],
          Date.now() - 1000,
          transaction
        )

        await expect(
          addFeatureToSubscriptionItem(
            {
              subscriptionItemId: subscriptionItem.id,
              featureId: toggleFeature.id,
              grantCreditsImmediately: false,
            },
            createDiscardingEffectsContext(transaction)
          )
        ).rejects.toThrow(
          `Subscription item ${subscriptionItem.id} is expired and cannot accept new features.`
        )
      })
    })

    it('should throw error when feature is inactive', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Create an inactive feature directly
        const inactiveFeature = await insertFeature(
          {
            organizationId: orgData.organization.id,
            pricingModelId: orgData.pricingModel.id,
            name: 'Inactive Feature',
            slug: `inactive-feature-${core.nanoid(6)}`,
            description: 'An inactive feature',
            type: FeatureType.Toggle,
            amount: null,
            renewalFrequency: null,
            usageMeterId: null,
            livemode: true,
            active: false,
          },
          transaction
        )

        await expect(
          addFeatureToSubscriptionItem(
            {
              subscriptionItemId: subscriptionItem.id,
              featureId: inactiveFeature.id,
              grantCreditsImmediately: false,
            },
            createDiscardingEffectsContext(transaction)
          )
        ).rejects.toThrow(
          `Feature ${inactiveFeature.id} is inactive and cannot be added to subscriptions.`
        )
      })
    })

    it('should throw error when feature belongs to different organization', async () => {
      // Create a second organization
      const otherOrgData = (await setupOrg()).unwrap()
      const otherProduct = await setupProduct({
        organizationId: otherOrgData.organization.id,
        name: 'Other Org Product',
        livemode: true,
        pricingModelId: otherOrgData.pricingModel.id,
      })

      const [{ feature: otherOrgFeature }] =
        await setupTestFeaturesAndProductFeatures(
          otherOrgData.organization.id,
          otherProduct.id,
          otherOrgData.pricingModel.id,
          true,
          [{ name: 'Other Org Feature', type: FeatureType.Toggle }]
        )

      await adminTransaction(async ({ transaction }) => {
        await expect(
          addFeatureToSubscriptionItem(
            {
              subscriptionItemId: subscriptionItem.id,
              featureId: otherOrgFeature.id,
              grantCreditsImmediately: false,
            },
            createDiscardingEffectsContext(transaction)
          )
        ).rejects.toThrow(
          `Feature ${otherOrgFeature.id} does not belong to the same organization as subscription ${subscription.id}.`
        )
      })
    })

    it('should throw error when feature livemode does not match subscription livemode', async () => {
      const testmodeProduct = await setupProduct({
        organizationId: orgData.organization.id,
        name: 'Testmode Product',
        livemode: false,
        pricingModelId: orgData.pricingModel.id,
      })

      const [{ feature: testmodeFeature }] =
        await setupTestFeaturesAndProductFeatures(
          orgData.organization.id,
          testmodeProduct.id,
          orgData.pricingModel.id,
          false, // Different from subscription's livemode (true)
          [{ name: 'Testmode Feature', type: FeatureType.Toggle }]
        )

      await adminTransaction(async ({ transaction }) => {
        await expect(
          addFeatureToSubscriptionItem(
            {
              subscriptionItemId: subscriptionItem.id,
              featureId: testmodeFeature.id,
              grantCreditsImmediately: false,
            },
            createDiscardingEffectsContext(transaction)
          )
        ).rejects.toThrow(
          'Feature livemode does not match subscription item livemode.'
        )
      })
    })
  })

  describe('Deduplication', () => {
    it('should deduplicate toggle features and return the same feature on repeated adds', async () => {
      const [{ feature: toggleFeature }] =
        await setupTestFeaturesAndProductFeatures(
          orgData.organization.id,
          product.id,
          orgData.pricingModel.id,
          true,
          [
            {
              name: 'Dedupe Toggle Feature',
              type: FeatureType.Toggle,
            },
          ]
        )

      await adminTransaction(async ({ transaction }) => {
        const firstResult = await addFeatureToSubscriptionItem(
          {
            subscriptionItemId: subscriptionItem.id,
            featureId: toggleFeature.id,
            grantCreditsImmediately: false,
          },
          createDiscardingEffectsContext(transaction)
        )

        const secondResult = await addFeatureToSubscriptionItem(
          {
            subscriptionItemId: subscriptionItem.id,
            featureId: toggleFeature.id,
            grantCreditsImmediately: false,
          },
          createDiscardingEffectsContext(transaction)
        )

        // Should return the same subscription item feature
        expect(secondResult.subscriptionItemFeature.id).toBe(
          firstResult.subscriptionItemFeature.id
        )

        // Only one feature should exist
        const features = await selectSubscriptionItemFeatures(
          { featureId: [toggleFeature.id] },
          transaction
        )
        expect(features.length).toBe(1)
      })
    })
  })
})
