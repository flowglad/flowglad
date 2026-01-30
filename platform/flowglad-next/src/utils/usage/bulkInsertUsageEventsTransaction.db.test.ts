import { beforeEach, describe, expect, it } from 'bun:test'
import {
  CurrencyCode,
  IntervalUnit,
  LedgerTransactionType,
  PriceType,
  UsageMeterAggregationType,
} from '@db-core/enums'
import type { BillingPeriod } from '@db-core/schema/billingPeriods'
import type { Customer } from '@db-core/schema/customers'
import { customers } from '@db-core/schema/customers'
import type { Organization } from '@db-core/schema/organizations'
import type { PaymentMethod } from '@db-core/schema/paymentMethods'
import type { Price } from '@db-core/schema/prices'
import { prices } from '@db-core/schema/prices'
import { pricingModels } from '@db-core/schema/pricingModels'
import { products } from '@db-core/schema/products'
import type { Subscription } from '@db-core/schema/subscriptions'
import type { UsageMeter } from '@db-core/schema/usageMeters'
import { usageMeters } from '@db-core/schema/usageMeters'
import {
  setupBillingPeriod,
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupPricingModel,
  setupProduct,
  setupSubscription,
  setupUsageMeter,
} from '@/../seedDatabase'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import type { UsageEventProcessedLedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'
import { selectCustomerPricingInfoBatch } from '@/db/tableMethods/customerMethods'
import { updatePrice } from '@/db/tableMethods/priceMethods'
import {
  type PricingModelSlugResolutionData,
  selectPricingModelSlugResolutionData,
} from '@/db/tableMethods/pricingModelMethods'
import { NotFoundError } from '@/errors'
import {
  createCapturingEffectsContext,
  createDiscardingEffectsContext,
} from '@/test-utils/transactionCallbacks'
import core from '@/utils/core'
import {
  batchFetchPricingModelsForCustomers,
  bulkInsertUsageEventsTransaction,
  resolvePriceSlugs,
  resolveUsageMeterSlugs,
  type SlugResolutionEvent,
  type WithSlugEventsContext,
} from './bulkInsertUsageEventsTransaction'

// Typed partial contexts for unit testing resolvePriceSlugs and resolveUsageMeterSlugs
// These use Pick to define exactly what fields are needed, then cast to full context type
type TestResolvePriceSlugsContext = Pick<
  WithSlugEventsContext,
  'eventsWithPriceSlugs' | 'getPricingModelForCustomer'
>

type TestResolveUsageMeterSlugsContext = Pick<
  WithSlugEventsContext,
  'eventsWithUsageMeterSlugs' | 'getPricingModelForCustomer'
> & {
  slugToPriceIdMap: Map<string, string>
}

describe('bulkInsertUsageEventsTransaction', () => {
  let organization: Organization.Record
  let pricingModelId: string
  let productId: string
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let usageMeter: UsageMeter.Record
  let price: Price.Record
  let subscription: Subscription.Record
  let billingPeriod: BillingPeriod.Record

  beforeEach(async () => {
    const orgSetup = await setupOrg()
    organization = orgSetup.organization
    pricingModelId = orgSetup.pricingModel.id
    productId = orgSetup.product.id

    customer = await setupCustomer({
      organizationId: organization.id,
      pricingModelId: orgSetup.pricingModel.id,
    })

    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Usage Meter',
      livemode: true,
      pricingModelId,
    })

    price = await setupPrice({
      name: 'Test Usage Price',
      type: PriceType.Usage,
      unitPrice: 10,
      intervalUnit: IntervalUnit.Day,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      currency: CurrencyCode.USD,
      usageMeterId: usageMeter.id,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
    })

    const now = new Date()
    const endDate = new Date(now)
    endDate.setDate(endDate.getDate() + 30)

    billingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: now,
      endDate,
    })
  })

  describe('slug resolution', () => {
    it('should resolve priceSlug to priceId', async () => {
      const result = await adminTransaction(async ({ transaction }) =>
        bulkInsertUsageEventsTransaction(
          {
            input: {
              usageEvents: [
                {
                  subscriptionId: subscription.id,
                  priceSlug: price.slug ?? undefined,
                  amount: 100,
                  transactionId: `txn_slug_${Date.now()}`,
                },
              ],
            },
            livemode: true,
          },
          createDiscardingEffectsContext(transaction)
        )
      )

      expect(result.unwrap().usageEvents).toHaveLength(1)
      expect(result.unwrap().usageEvents[0].priceId).toBe(price.id)
      expect(result.unwrap().usageEvents[0].usageMeterId).toBe(
        usageMeter.id
      )
    })

    it('should resolve usageMeterSlug to usageMeterId with default price', async () => {
      // Create a default price for the usage meter
      const defaultPrice = await setupPrice({
        name: 'Default Price for Meter Slug Test',
        type: PriceType.Usage,
        unitPrice: 0,
        intervalUnit: IntervalUnit.Day,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
        currency: CurrencyCode.USD,
        usageMeterId: usageMeter.id,
      })

      const result = await adminTransaction(async ({ transaction }) =>
        bulkInsertUsageEventsTransaction(
          {
            input: {
              usageEvents: [
                {
                  subscriptionId: subscription.id,
                  usageMeterSlug: usageMeter.slug ?? undefined,
                  amount: 200,
                  transactionId: `txn_slug_um_${Date.now()}`,
                },
              ],
            },
            livemode: true,
          },
          createDiscardingEffectsContext(transaction)
        )
      )

      expect(result.unwrap().usageEvents).toHaveLength(1)
      // Should resolve to the default price for the usage meter
      expect(result.unwrap().usageEvents[0].priceId).toBe(
        defaultPrice.id
      )
      expect(result.unwrap().usageEvents[0].usageMeterId).toBe(
        usageMeter.id
      )
    })

    it('should throw error when priceSlug not found', async () => {
      await expect(
        comprehensiveAdminTransaction(async ({ transaction }) =>
          bulkInsertUsageEventsTransaction(
            {
              input: {
                usageEvents: [
                  {
                    subscriptionId: subscription.id,
                    priceSlug: 'non-existent-slug',
                    amount: 100,
                    transactionId: `txn_not_found_${Date.now()}`,
                  },
                ],
              },
              livemode: true,
            },
            createDiscardingEffectsContext(transaction)
          )
        )
      ).rejects.toThrow(
        "Price not found: with slug non-existent-slug (not in customer's pricing model)"
      )
    })

    it('should throw error when usageMeterSlug not found', async () => {
      await expect(
        comprehensiveAdminTransaction(async ({ transaction }) =>
          bulkInsertUsageEventsTransaction(
            {
              input: {
                usageEvents: [
                  {
                    subscriptionId: subscription.id,
                    usageMeterSlug: 'non-existent-slug',
                    amount: 100,
                    transactionId: `txn_not_found_um_${Date.now()}`,
                  },
                ],
              },
              livemode: true,
            },
            createDiscardingEffectsContext(transaction)
          )
        )
      ).rejects.toThrow(
        'UsageMeter not found: slug "non-existent-slug"'
      )
    })

    it('should correctly resolve slugs when different customers have prices with the same slug', async () => {
      // Create a second organization with its own pricing model
      const org2Setup = await setupOrg()
      const org2 = org2Setup.organization
      const pricingModel2Id = org2Setup.pricingModel.id
      const product2Id = org2Setup.product.id

      // Create customer, payment method, usage meter, price, subscription for org2
      const customer2 = await setupCustomer({
        organizationId: org2.id,
        pricingModelId: pricingModel2Id,
      })

      const paymentMethod2 = await setupPaymentMethod({
        organizationId: org2.id,
        customerId: customer2.id,
      })

      const usageMeter2 = await setupUsageMeter({
        organizationId: org2.id,
        name: 'Org2 Usage Meter',
        livemode: true,
        pricingModelId: pricingModel2Id,
        // Use the same slug as the first org's usage meter
        slug: usageMeter.slug ?? undefined,
      })

      const price2 = await setupPrice({
        name: 'Org2 Usage Price',
        type: PriceType.Usage,
        unitPrice: 20, // Different unit price
        intervalUnit: IntervalUnit.Day,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: CurrencyCode.USD,
        usageMeterId: usageMeter2.id,
        // Use the same slug as the first org's price
        slug: price.slug ?? undefined,
      })

      const subscription2 = await setupSubscription({
        organizationId: org2.id,
        customerId: customer2.id,
        paymentMethodId: paymentMethod2.id,
        priceId: price2.id,
      })

      // Create billing period for subscription2
      const now = new Date()
      const endDate = new Date(now)
      endDate.setDate(endDate.getDate() + 30)
      await setupBillingPeriod({
        subscriptionId: subscription2.id,
        startDate: now,
        endDate,
      })

      // Verify the slugs are the same but IDs are different
      expect(price.slug).toBe(price2.slug)
      expect(price.id).not.toBe(price2.id)
      expect(usageMeter.slug).toBe(usageMeter2.slug)
      expect(usageMeter.id).not.toBe(usageMeter2.id)

      // Bulk insert events for both customers using the same slug
      const timestamp = Date.now()
      const result = await adminTransaction(async ({ transaction }) =>
        bulkInsertUsageEventsTransaction(
          {
            input: {
              usageEvents: [
                {
                  subscriptionId: subscription.id,
                  priceSlug: price.slug ?? undefined,
                  amount: 100,
                  transactionId: `txn_slug_collision_1_${timestamp}`,
                },
                {
                  subscriptionId: subscription2.id,
                  priceSlug: price2.slug ?? undefined,
                  amount: 200,
                  transactionId: `txn_slug_collision_2_${timestamp}`,
                },
              ],
            },
            livemode: true,
          },
          createDiscardingEffectsContext(transaction)
        )
      )

      const events = result.unwrap().usageEvents
      expect(events).toHaveLength(2)

      // Find events by subscription - they should exist since we asserted length 2
      const event1 = events.find(
        (e) => e.subscriptionId === subscription.id
      )
      const event2 = events.find(
        (e) => e.subscriptionId === subscription2.id
      )

      // Each event should resolve to the correct price for its customer
      // Using toMatchObject to verify the relevant fields without non-null assertions
      expect(event1).toMatchObject({
        priceId: price.id,
        usageMeterId: usageMeter.id,
        customerId: customer.id,
      })

      expect(event2).toMatchObject({
        priceId: price2.id,
        usageMeterId: usageMeter2.id,
        customerId: customer2.id,
      })
    })

    it('should correctly resolve usageMeterSlugs when different customers have meters with the same slug', async () => {
      // Create a default price for org1's usage meter
      const defaultPrice1 = await setupPrice({
        name: 'Default Price for Org1 Meter',
        type: PriceType.Usage,
        unitPrice: 0,
        intervalUnit: IntervalUnit.Day,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
        currency: CurrencyCode.USD,
        usageMeterId: usageMeter.id,
      })

      // Create a second organization with its own pricing model
      const org2Setup = await setupOrg()
      const org2 = org2Setup.organization
      const pricingModel2Id = org2Setup.pricingModel.id

      // Create customer, payment method, usage meter, subscription for org2
      const customer2 = await setupCustomer({
        organizationId: org2.id,
        pricingModelId: pricingModel2Id,
      })

      const paymentMethod2 = await setupPaymentMethod({
        organizationId: org2.id,
        customerId: customer2.id,
      })

      const usageMeter2 = await setupUsageMeter({
        organizationId: org2.id,
        name: 'Org2 Usage Meter For Meter Slug Test',
        livemode: true,
        pricingModelId: pricingModel2Id,
        // Use the same slug as the first org's usage meter
        slug: usageMeter.slug ?? undefined,
      })

      // Create a default price for org2's usage meter
      const defaultPrice2 = await setupPrice({
        name: 'Default Price for Org2 Meter',
        type: PriceType.Usage,
        unitPrice: 0,
        intervalUnit: IntervalUnit.Day,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
        currency: CurrencyCode.USD,
        usageMeterId: usageMeter2.id,
      })

      // Create a non-default price for org2's subscription
      const price2 = await setupPrice({
        name: 'Org2 Usage Price For Meter Slug Test',
        type: PriceType.Usage,
        unitPrice: 15,
        intervalUnit: IntervalUnit.Day,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: CurrencyCode.USD,
        usageMeterId: usageMeter2.id,
      })

      const subscription2 = await setupSubscription({
        organizationId: org2.id,
        customerId: customer2.id,
        paymentMethodId: paymentMethod2.id,
        priceId: price2.id,
      })

      // Create billing period for subscription2
      const now = new Date()
      const endDate = new Date(now)
      endDate.setDate(endDate.getDate() + 30)
      await setupBillingPeriod({
        subscriptionId: subscription2.id,
        startDate: now,
        endDate,
      })

      // Verify the meter slugs are the same but IDs are different
      expect(usageMeter.slug).toBe(usageMeter2.slug)
      expect(usageMeter.id).not.toBe(usageMeter2.id)

      // Bulk insert events for both customers using the same usageMeterSlug
      const timestamp = Date.now()
      const result = await adminTransaction(async ({ transaction }) =>
        bulkInsertUsageEventsTransaction(
          {
            input: {
              usageEvents: [
                {
                  subscriptionId: subscription.id,
                  usageMeterSlug: usageMeter.slug ?? undefined,
                  amount: 300,
                  transactionId: `txn_meter_slug_collision_1_${timestamp}`,
                },
                {
                  subscriptionId: subscription2.id,
                  usageMeterSlug: usageMeter2.slug ?? undefined,
                  amount: 400,
                  transactionId: `txn_meter_slug_collision_2_${timestamp}`,
                },
              ],
            },
            livemode: true,
          },
          createDiscardingEffectsContext(transaction)
        )
      )

      const events = result.unwrap().usageEvents
      expect(events).toHaveLength(2)

      // Find events by subscription - they should exist since we asserted length 2
      const event1 = events.find(
        (e) => e.subscriptionId === subscription.id
      )
      const event2 = events.find(
        (e) => e.subscriptionId === subscription2.id
      )

      // Each event should resolve to the correct meter and default price for its customer
      // Using toMatchObject to verify the relevant fields without non-null assertions
      expect(event1).toMatchObject({
        usageMeterId: usageMeter.id,
        customerId: customer.id,
        priceId: defaultPrice1.id,
      })

      expect(event2).toMatchObject({
        usageMeterId: usageMeter2.id,
        customerId: customer2.id,
        priceId: defaultPrice2.id,
      })
    })
  })

  describe('validation', () => {
    it('should throw error when priceId is not a usage price', async () => {
      // Create a subscription price (not usage) in the same org
      const subscriptionPrice = await adminTransaction(
        async ({ transaction }) =>
          setupPrice({
            productId,
            name: 'Subscription Price',
            type: PriceType.Subscription,
            unitPrice: 1000,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            livemode: true,
            isDefault: false,
            currency: CurrencyCode.USD,
            // usageMeterId should not be provided for subscription prices
          })
      )

      await expect(
        comprehensiveAdminTransaction(async ({ transaction }) =>
          bulkInsertUsageEventsTransaction(
            {
              input: {
                usageEvents: [
                  {
                    subscriptionId: subscription.id,
                    priceId: subscriptionPrice.id,
                    amount: 100,
                    transactionId: `txn_invalid_price_${Date.now()}`,
                  },
                ],
              },
              livemode: true,
            },
            createDiscardingEffectsContext(transaction)
          )
        )
      ).rejects.toThrow('which is not a usage price')
    })

    it('should throw error when usageMeterId not in customer pricing model', async () => {
      // Create a usage meter in a different pricing model
      const otherOrg = await adminTransaction(
        async ({ transaction }) => setupOrg()
      )
      const otherUsageMeter = await adminTransaction(
        async ({ transaction }) =>
          setupUsageMeter({
            organizationId: otherOrg.organization.id,
            name: 'Other Usage Meter',
            livemode: true,
            pricingModelId: otherOrg.pricingModel.id,
          })
      )

      await expect(
        comprehensiveAdminTransaction(async ({ transaction }) =>
          bulkInsertUsageEventsTransaction(
            {
              input: {
                usageEvents: [
                  {
                    subscriptionId: subscription.id,
                    usageMeterId: otherUsageMeter.id,
                    amount: 100,
                    transactionId: `txn_invalid_meter_${Date.now()}`,
                  },
                ],
              },
              livemode: true,
            },
            createDiscardingEffectsContext(transaction)
          )
        )
      ).rejects.toThrow("not in customer's pricing model")
    })

    it('should throw error when usageMeterId is used without explicit priceId and meter has no default price', async () => {
      // Create a usage meter WITHOUT a default price
      const meterWithNoDefaultPrice = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Meter Without Default Price',
        livemode: true,
        pricingModelId,
      })

      // Create a non-default price for this meter (so it's valid but not default)
      const nonDefaultPrice = await setupPrice({
        name: 'Non-Default Price for Meter',
        type: PriceType.Usage,
        unitPrice: 10,
        intervalUnit: IntervalUnit.Day,
        intervalCount: 1,
        livemode: true,
        isDefault: false, // NOT a default price
        currency: CurrencyCode.USD,
        usageMeterId: meterWithNoDefaultPrice.id,
      })

      // Try to create a usage event using just usageMeterId (no explicit priceId)
      // This should fail because there's no default price to resolve to
      await expect(
        comprehensiveAdminTransaction(async ({ transaction }) =>
          bulkInsertUsageEventsTransaction(
            {
              input: {
                usageEvents: [
                  {
                    subscriptionId: subscription.id,
                    usageMeterId: meterWithNoDefaultPrice.id,
                    amount: 100,
                    transactionId: `txn_no_default_price_${Date.now()}`,
                  },
                ],
              },
              livemode: true,
            },
            createDiscardingEffectsContext(transaction)
          )
        )
      ).rejects.toThrow('generator body threw')
    })

    it('should throw error when usageMeterSlug is used without explicit priceId and meter has no default price', async () => {
      // Create a usage meter WITHOUT a default price
      const meterWithNoDefaultPriceSlug = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Meter Without Default Price For Slug Test',
        livemode: true,
        pricingModelId,
        slug: 'meter-no-default-slug',
      })

      // Create a non-default price for this meter (so it's valid but not default)
      await setupPrice({
        name: 'Non-Default Price for Slug Test',
        type: PriceType.Usage,
        unitPrice: 10,
        intervalUnit: IntervalUnit.Day,
        intervalCount: 1,
        livemode: true,
        isDefault: false, // NOT a default price
        currency: CurrencyCode.USD,
        usageMeterId: meterWithNoDefaultPriceSlug.id,
      })

      // Try to create a usage event using just usageMeterSlug (no explicit priceId)
      // This should fail because there's no default price to resolve to
      await expect(
        comprehensiveAdminTransaction(async ({ transaction }) =>
          bulkInsertUsageEventsTransaction(
            {
              input: {
                usageEvents: [
                  {
                    subscriptionId: subscription.id,
                    usageMeterSlug: 'meter-no-default-slug',
                    amount: 100,
                    transactionId: `txn_no_default_price_slug_${Date.now()}`,
                  },
                ],
              },
              livemode: true,
            },
            createDiscardingEffectsContext(transaction)
          )
        )
      ).rejects.toThrow('generator body threw')
    })

    it('should throw error when priceId not in customer pricing model', async () => {
      // Create a usage price in a different pricing model (different org)
      const otherOrg = await adminTransaction(
        async ({ transaction }) => setupOrg()
      )
      const otherUsageMeter = await adminTransaction(
        async ({ transaction }) =>
          setupUsageMeter({
            organizationId: otherOrg.organization.id,
            name: 'Other Usage Meter',
            livemode: true,
            pricingModelId: otherOrg.pricingModel.id,
          })
      )
      const otherPrice = await adminTransaction(
        async ({ transaction }) =>
          setupPrice({
            name: 'Other Usage Price',
            type: PriceType.Usage,
            unitPrice: 10,
            intervalUnit: IntervalUnit.Day,
            intervalCount: 1,
            livemode: true,
            isDefault: false,
            currency: CurrencyCode.USD,
            usageMeterId: otherUsageMeter.id,
          })
      )

      // Try to create a usage event for our customer's subscription using a priceId
      // from a different pricing model - this should throw an error
      await expect(
        comprehensiveAdminTransaction(async ({ transaction }) =>
          bulkInsertUsageEventsTransaction(
            {
              input: {
                usageEvents: [
                  {
                    subscriptionId: subscription.id,
                    priceId: otherPrice.id,
                    amount: 100,
                    transactionId: `txn_invalid_price_${Date.now()}`,
                  },
                ],
              },
              livemode: true,
            },
            createDiscardingEffectsContext(transaction)
          )
        )
      ).rejects.toThrow("(not in customer's pricing model")
    })

    it('should throw error when CountDistinctProperties meter is used with subscription missing billing period', async () => {
      const countDistinctMeter = await adminTransaction(
        async ({ transaction }) =>
          setupUsageMeter({
            organizationId: organization.id,
            name: 'Count Distinct Meter',
            livemode: true,
            pricingModelId,
            aggregationType:
              UsageMeterAggregationType.CountDistinctProperties,
          })
      )

      // Default price must exist for meter-based events (required by system invariant),
      // even though this test expects an error before price resolution is reached
      const countDistinctDefaultPrice = await adminTransaction(
        async ({ transaction }) =>
          setupPrice({
            name: 'Count Distinct Default Price',
            type: PriceType.Usage,
            unitPrice: 0,
            intervalUnit: IntervalUnit.Day,
            intervalCount: 1,
            livemode: true,
            isDefault: true,
            currency: CurrencyCode.USD,
            usageMeterId: countDistinctMeter.id,
          })
      )

      // Create a non-default usage price for the subscription
      const countDistinctPrice = await adminTransaction(
        async ({ transaction }) =>
          setupPrice({
            name: 'Count Distinct Price',
            type: PriceType.Usage,
            unitPrice: 10,
            intervalUnit: IntervalUnit.Day,
            intervalCount: 1,
            livemode: true,
            isDefault: false,
            currency: CurrencyCode.USD,
            usageMeterId: countDistinctMeter.id,
          })
      )

      // Create subscription without billing period (no billing period record exists for this subscription)
      const subWithoutBillingPeriod = await adminTransaction(
        async ({ transaction }) =>
          setupSubscription({
            organizationId: organization.id,
            customerId: customer.id,
            paymentMethodId: paymentMethod.id,
            priceId: countDistinctPrice.id,
          })
      )

      await expect(
        comprehensiveAdminTransaction(async ({ transaction }) =>
          bulkInsertUsageEventsTransaction(
            {
              input: {
                usageEvents: [
                  {
                    subscriptionId: subWithoutBillingPeriod.id,
                    usageMeterId: countDistinctMeter.id,
                    amount: 100,
                    transactionId: `txn_no_billing_period_${Date.now()}`,
                  },
                ],
              },
              livemode: true,
            },
            createDiscardingEffectsContext(transaction)
          )
        )
      ).rejects.toThrow('Invalid billingPeriod')
    })

    it('should throw error when CountDistinctProperties meter is used with empty properties', async () => {
      const countDistinctMeter = await adminTransaction(
        async ({ transaction }) =>
          setupUsageMeter({
            organizationId: organization.id,
            name: 'Count Distinct Meter Empty Props',
            livemode: true,
            pricingModelId,
            aggregationType:
              UsageMeterAggregationType.CountDistinctProperties,
          })
      )

      // Default price must exist for meter-based events (required by system invariant),
      // even though this test expects an error before price resolution is reached
      const countDistinctDefaultPrice = await adminTransaction(
        async ({ transaction }) =>
          setupPrice({
            name: 'Count Distinct Default Price Empty Props',
            type: PriceType.Usage,
            unitPrice: 0,
            intervalUnit: IntervalUnit.Day,
            intervalCount: 1,
            livemode: true,
            isDefault: true,
            currency: CurrencyCode.USD,
            usageMeterId: countDistinctMeter.id,
          })
      )

      const countDistinctPrice = await adminTransaction(
        async ({ transaction }) =>
          setupPrice({
            name: 'Count Distinct Price Empty Props',
            type: PriceType.Usage,
            unitPrice: 10,
            intervalUnit: IntervalUnit.Day,
            intervalCount: 1,
            livemode: true,
            isDefault: false,
            currency: CurrencyCode.USD,
            usageMeterId: countDistinctMeter.id,
          })
      )

      const subWithBillingPeriod = await adminTransaction(
        async ({ transaction }) =>
          setupSubscription({
            organizationId: organization.id,
            customerId: customer.id,
            paymentMethodId: paymentMethod.id,
            priceId: countDistinctPrice.id,
          })
      )

      // Create a billing period for the subscription
      const now = new Date()
      const billingPeriodEndDate = new Date(now)
      billingPeriodEndDate.setDate(
        billingPeriodEndDate.getDate() + 30
      )
      await adminTransaction(async ({ transaction }) =>
        setupBillingPeriod({
          subscriptionId: subWithBillingPeriod.id,
          startDate: now,
          endDate: billingPeriodEndDate,
        })
      )

      // Test with undefined properties
      await expect(
        comprehensiveAdminTransaction(async ({ transaction }) =>
          bulkInsertUsageEventsTransaction(
            {
              input: {
                usageEvents: [
                  {
                    subscriptionId: subWithBillingPeriod.id,
                    usageMeterId: countDistinctMeter.id,
                    amount: 100,
                    transactionId: `txn_empty_props_undefined_${Date.now()}`,
                    // properties intentionally omitted (undefined)
                  },
                ],
              },
              livemode: true,
            },
            createDiscardingEffectsContext(transaction)
          )
        )
      ).rejects.toThrow('Invalid properties')

      // Test with empty object properties
      await expect(
        comprehensiveAdminTransaction(async ({ transaction }) =>
          bulkInsertUsageEventsTransaction(
            {
              input: {
                usageEvents: [
                  {
                    subscriptionId: subWithBillingPeriod.id,
                    usageMeterId: countDistinctMeter.id,
                    amount: 100,
                    transactionId: `txn_empty_props_object_${Date.now()}`,
                    properties: {},
                  },
                ],
              },
              livemode: true,
            },
            createDiscardingEffectsContext(transaction)
          )
        )
      ).rejects.toThrow('Invalid properties')
    })
  })

  describe('normalization', () => {
    it('should default properties and usageDate when not provided', async () => {
      const before = Date.now()
      const result = await adminTransaction(async ({ transaction }) =>
        bulkInsertUsageEventsTransaction(
          {
            input: {
              usageEvents: [
                {
                  subscriptionId: subscription.id,
                  priceId: price.id,
                  amount: 100,
                  transactionId: `txn_no_props_date_${Date.now()}`,
                  // properties and usageDate not provided
                },
              ],
            },
            livemode: true,
          },
          createDiscardingEffectsContext(transaction)
        )
      )
      const after = Date.now()

      expect(result.unwrap().usageEvents).toHaveLength(1)
      expect(result.unwrap().usageEvents[0].properties).toEqual({})
      expect(
        result.unwrap().usageEvents[0].usageDate
      ).toBeGreaterThanOrEqual(before)
      expect(
        result.unwrap().usageEvents[0].usageDate
      ).toBeLessThanOrEqual(after)
    })
  })

  describe('idempotency', () => {
    it('should not insert duplicate events with same transactionId', async () => {
      const transactionId = `txn_dedup_${Date.now()}`

      const { firstResult, firstEffects } = await adminTransaction(
        async ({ transaction }) => {
          const { ctx, effects } =
            createCapturingEffectsContext(transaction)
          const result = await bulkInsertUsageEventsTransaction(
            {
              input: {
                usageEvents: [
                  {
                    subscriptionId: subscription.id,
                    priceId: price.id,
                    amount: 100,
                    transactionId,
                  },
                ],
              },
              livemode: true,
            },
            ctx
          )
          return { firstResult: result, firstEffects: effects }
        }
      )

      expect(firstResult.unwrap().usageEvents).toHaveLength(1)
      expect(firstEffects.ledgerCommands.length).toBe(1)

      // Resubmit the same payload
      const { secondResult, secondEffects } = await adminTransaction(
        async ({ transaction }) => {
          const { ctx, effects } =
            createCapturingEffectsContext(transaction)
          const result = await bulkInsertUsageEventsTransaction(
            {
              input: {
                usageEvents: [
                  {
                    subscriptionId: subscription.id,
                    priceId: price.id,
                    amount: 100,
                    transactionId, // Same transactionId
                  },
                ],
              },
              livemode: true,
            },
            ctx
          )
          return { secondResult: result, secondEffects: effects }
        }
      )

      // Should return empty array (no new events inserted)
      expect(secondResult.unwrap().usageEvents).toHaveLength(0)
      // Should not generate ledger commands for deduped entries
      expect(secondEffects.ledgerCommands.length).toBe(0)
    })

    it('should only generate ledger commands for newly inserted events', async () => {
      const transactionId1 = `txn_ledger_1_${Date.now()}`
      const transactionId2 = `txn_ledger_2_${Date.now()}`

      // First bulk insert
      const { firstResult, firstEffects } = await adminTransaction(
        async ({ transaction }) => {
          const { ctx, effects } =
            createCapturingEffectsContext(transaction)
          const result = await bulkInsertUsageEventsTransaction(
            {
              input: {
                usageEvents: [
                  {
                    subscriptionId: subscription.id,
                    priceId: price.id,
                    amount: 100,
                    transactionId: transactionId1,
                  },
                  {
                    subscriptionId: subscription.id,
                    priceId: price.id,
                    amount: 200,
                    transactionId: transactionId2,
                  },
                ],
              },
              livemode: true,
            },
            ctx
          )
          return { firstResult: result, firstEffects: effects }
        }
      )

      expect(firstResult.unwrap().usageEvents).toHaveLength(2)
      expect(firstEffects.ledgerCommands.length).toBe(2)

      // Resubmit with one duplicate and one new
      const { secondResult, secondEffects } = await adminTransaction(
        async ({ transaction }) => {
          const { ctx, effects } =
            createCapturingEffectsContext(transaction)
          const result = await bulkInsertUsageEventsTransaction(
            {
              input: {
                usageEvents: [
                  {
                    subscriptionId: subscription.id,
                    priceId: price.id,
                    amount: 100,
                    transactionId: transactionId1, // Duplicate
                  },
                  {
                    subscriptionId: subscription.id,
                    priceId: price.id,
                    amount: 300,
                    transactionId: `txn_ledger_3_${Date.now()}`, // New
                  },
                ],
              },
              livemode: true,
            },
            ctx
          )
          return { secondResult: result, secondEffects: effects }
        }
      )

      // Should only insert the new event
      expect(secondResult.unwrap().usageEvents).toHaveLength(1)
      expect(secondResult.unwrap().usageEvents[0].amount).toBe(300)
      // The first result should have generated commands for 2 events
      expect(firstEffects.ledgerCommands.length).toBe(2)
      // The second result should only have commands for 1 new event (the duplicate should not generate commands)
      // This verifies that deduped entries don't generate ledger commands
      expect(secondEffects.ledgerCommands.length).toBe(1)
    })
  })

  describe('happy path', () => {
    it('should successfully insert multiple usage events', async () => {
      const { result, effects } = await adminTransaction(
        async ({ transaction }) => {
          const { ctx, effects } =
            createCapturingEffectsContext(transaction)
          const result = await bulkInsertUsageEventsTransaction(
            {
              input: {
                usageEvents: [
                  {
                    subscriptionId: subscription.id,
                    priceId: price.id,
                    amount: 100,
                    transactionId: `txn_happy_1_${Date.now()}`,
                  },
                  {
                    subscriptionId: subscription.id,
                    priceId: price.id,
                    amount: 200,
                    transactionId: `txn_happy_2_${Date.now()}`,
                  },
                ],
              },
              livemode: true,
            },
            ctx
          )
          return { result, effects }
        }
      )

      expect(result.unwrap().usageEvents).toHaveLength(2)
      expect(result.unwrap().usageEvents[0].amount).toBe(100)
      expect(result.unwrap().usageEvents[1].amount).toBe(200)
      expect(effects.ledgerCommands.length).toBe(2)
    })

    it('should successfully bulk insert usage events for multiple customers and subscriptions', async () => {
      // Setup a second customer and subscription
      const customer2 = await adminTransaction(
        async ({ transaction }) =>
          setupCustomer({
            organizationId: organization.id,
            pricingModelId,
          })
      )

      const paymentMethod2 = await adminTransaction(
        async ({ transaction }) =>
          setupPaymentMethod({
            organizationId: organization.id,
            customerId: customer2.id,
          })
      )

      const subscription2 = await adminTransaction(
        async ({ transaction }) =>
          setupSubscription({
            organizationId: organization.id,
            customerId: customer2.id,
            paymentMethodId: paymentMethod2.id,
            priceId: price.id,
          })
      )

      const billingPeriod2 = await adminTransaction(
        async ({ transaction }) => {
          const now = new Date()
          const endDate = new Date(now)
          endDate.setDate(endDate.getDate() + 30)
          return setupBillingPeriod({
            subscriptionId: subscription2.id,
            startDate: now,
            endDate,
          })
        }
      )

      const timestamp = Date.now()
      const { result, effects } = await adminTransaction(
        async ({ transaction }) => {
          const { ctx, effects } =
            createCapturingEffectsContext(transaction)
          const result = await bulkInsertUsageEventsTransaction(
            {
              input: {
                usageEvents: [
                  {
                    subscriptionId: subscription.id,
                    priceId: price.id,
                    amount: 100,
                    transactionId: `txn_multi_customer_1_${timestamp}`,
                  },
                  {
                    subscriptionId: subscription2.id,
                    priceId: price.id,
                    amount: 200,
                    transactionId: `txn_multi_customer_2_${timestamp}`,
                  },
                  {
                    subscriptionId: subscription.id,
                    priceSlug: price.slug ?? undefined,
                    amount: 150,
                    transactionId: `txn_multi_customer_3_${timestamp}`,
                  },
                  {
                    subscriptionId: subscription2.id,
                    priceSlug: price.slug ?? undefined,
                    amount: 250,
                    transactionId: `txn_multi_customer_4_${timestamp}`,
                  },
                ],
              },
              livemode: true,
            },
            ctx
          )
          return { result, effects }
        }
      )

      // Should successfully insert all 4 events
      expect(result.unwrap().usageEvents).toHaveLength(4)

      // Verify each event has the correct customer and subscription
      const eventsForSub1 = result
        .unwrap()
        .usageEvents.filter(
          (e) => e.subscriptionId === subscription.id
        )
      const eventsForSub2 = result
        .unwrap()
        .usageEvents.filter(
          (e) => e.subscriptionId === subscription2.id
        )

      expect(eventsForSub1).toHaveLength(2)
      expect(eventsForSub2).toHaveLength(2)

      // Verify customer IDs are correctly assigned
      eventsForSub1.forEach((event) => {
        expect(event.customerId).toBe(customer.id)
        expect(event.billingPeriodId).toBe(billingPeriod.id)
      })

      eventsForSub2.forEach((event) => {
        expect(event.customerId).toBe(customer2.id)
        expect(event.billingPeriodId).toBe(billingPeriod2.id)
      })

      // Verify all events resolved to the correct price
      result.unwrap().usageEvents.forEach((event) => {
        expect(event.priceId).toBe(price.id)
      })

      // Verify amounts match the input
      expect(result.unwrap().usageEvents[0].amount).toBe(100)
      expect(result.unwrap().usageEvents[1].amount).toBe(200)
      expect(result.unwrap().usageEvents[2].amount).toBe(150)
      expect(result.unwrap().usageEvents[3].amount).toBe(250)

      expect(effects.ledgerCommands.length).toBe(4)
      // Verify each ledger command is linked to a usage event
      effects.ledgerCommands.forEach((cmd) => {
        // Assert that this is a UsageEventProcessedLedgerCommand
        expect(cmd.type).toBe(
          LedgerTransactionType.UsageEventProcessed
        )
        const ledgerCmd = cmd as UsageEventProcessedLedgerCommand
        const linkedEvent = result
          .unwrap()
          .usageEvents.find(
            (e) => e.id === ledgerCmd.payload.usageEvent.id
          )
        // Verify subscription linkage
        expect(ledgerCmd.subscriptionId).toBe(
          linkedEvent!.subscriptionId
        )
      })
    })
  })

  describe('batch customer lookups', () => {
    it('should batch fetch all customers upfront and process events correctly', async () => {
      // Setup: Create 10 customers with different pricing models, each with their own subscription
      const customersAndSubscriptions: Array<{
        customer: Customer.Record
        subscription: Subscription.Record
        pricingModelId: string
      }> = []

      for (let i = 0; i < 10; i++) {
        const customerData = await adminTransaction(
          async ({ transaction }) =>
            setupCustomer({
              organizationId: organization.id,
              pricingModelId,
            })
        )

        const pmData = await adminTransaction(
          async ({ transaction }) =>
            setupPaymentMethod({
              organizationId: organization.id,
              customerId: customerData.id,
            })
        )

        const subData = await adminTransaction(
          async ({ transaction }) =>
            setupSubscription({
              organizationId: organization.id,
              customerId: customerData.id,
              paymentMethodId: pmData.id,
              priceId: price.id,
            })
        )

        // Create billing period for each subscription
        await adminTransaction(async ({ transaction }) => {
          const now = new Date()
          const endDate = new Date(now)
          endDate.setDate(endDate.getDate() + 30)
          return setupBillingPeriod({
            subscriptionId: subData.id,
            startDate: now,
            endDate,
          })
        })

        customersAndSubscriptions.push({
          customer: customerData,
          subscription: subData,
          pricingModelId,
        })
      }

      // Execute: Create usage events for all 10 customers in a single bulk insert
      const timestamp = Date.now()
      const result = await adminTransaction(async ({ transaction }) =>
        bulkInsertUsageEventsTransaction(
          {
            input: {
              usageEvents: customersAndSubscriptions.map(
                ({ subscription }, index) => ({
                  subscriptionId: subscription.id,
                  priceId: price.id,
                  amount: (index + 1) * 100,
                  transactionId: `txn_batch_customer_${index}_${timestamp}`,
                })
              ),
            },
            livemode: true,
          },
          createDiscardingEffectsContext(transaction)
        )
      )

      // Expectations: All events should be processed successfully
      expect(result.unwrap().usageEvents).toHaveLength(10)

      // Verify each event has the correct customer ID and amount
      customersAndSubscriptions.forEach(({ customer }, index) => {
        const event = result
          .unwrap()
          .usageEvents.find((e) => e.customerId === customer.id)
        expect(event).toMatchObject({
          customerId: customer.id,
          amount: (index + 1) * 100,
          priceId: price.id,
          usageMeterId: usageMeter.id,
        })
      })
    })

    it('should handle customers with explicit pricingModelId', async () => {
      // Setup: Create a custom pricing model and assign it to a customer
      const customPricingModel = await adminTransaction(
        async ({ transaction }) =>
          setupPricingModel({
            organizationId: organization.id,
            name: 'Custom Pricing Model',
            isDefault: false,
            livemode: false,
          })
      )

      // Create a product and price for this pricing model
      const customProduct = await adminTransaction(
        async ({ transaction }) =>
          setupProduct({
            organizationId: organization.id,
            pricingModelId: customPricingModel.id,
            name: 'Custom Product',
            livemode: false,
          })
      )

      const customUsageMeter = await adminTransaction(
        async ({ transaction }) =>
          setupUsageMeter({
            organizationId: organization.id,
            name: 'Custom Usage Meter',
            livemode: false,
            pricingModelId: customPricingModel.id,
          })
      )

      const customPrice = await adminTransaction(
        async ({ transaction }) =>
          setupPrice({
            name: 'Custom Usage Price',
            type: PriceType.Usage,
            unitPrice: 20,
            intervalUnit: IntervalUnit.Day,
            intervalCount: 1,
            livemode: false,
            isDefault: false,
            currency: CurrencyCode.USD,
            usageMeterId: customUsageMeter.id,
          })
      )

      // Create customer with explicit pricingModelId
      const customCustomer = await adminTransaction(
        async ({ transaction }) =>
          setupCustomer({
            organizationId: organization.id,
            pricingModelId: customPricingModel.id,
          })
      )

      const customPaymentMethod = await adminTransaction(
        async ({ transaction }) =>
          setupPaymentMethod({
            organizationId: organization.id,
            customerId: customCustomer.id,
          })
      )

      const customSubscription = await adminTransaction(
        async ({ transaction }) =>
          setupSubscription({
            organizationId: organization.id,
            customerId: customCustomer.id,
            paymentMethodId: customPaymentMethod.id,
            priceId: customPrice.id,
          })
      )

      const now = new Date()
      const endDate = new Date(now)
      endDate.setDate(endDate.getDate() + 30)
      await adminTransaction(async ({ transaction }) =>
        setupBillingPeriod({
          subscriptionId: customSubscription.id,
          startDate: now,
          endDate,
        })
      )

      // Execute: Create usage event for customer with explicit pricing model
      const result = await adminTransaction(async ({ transaction }) =>
        bulkInsertUsageEventsTransaction(
          {
            input: {
              usageEvents: [
                {
                  subscriptionId: customSubscription.id,
                  priceId: customPrice.id,
                  amount: 500,
                  transactionId: `txn_explicit_pm_${Date.now()}`,
                },
              ],
            },
            livemode: false,
          },
          createDiscardingEffectsContext(transaction)
        )
      )

      // Expectations: Event should use the custom pricing model
      expect(result.unwrap().usageEvents).toHaveLength(1)
      expect(result.unwrap().usageEvents[0].customerId).toBe(
        customCustomer.id
      )
      expect(result.unwrap().usageEvents[0].priceId).toBe(
        customPrice.id
      )
      expect(result.unwrap().usageEvents[0].usageMeterId).toBe(
        customUsageMeter.id
      )
    })

    it('should handle customers without explicit pricingModelId (uses default pricing model)', async () => {
      // Setup: Create customer without pricingModelId (will use default)

      const defaultCustomer = await adminTransaction(
        async ({ transaction }) =>
          setupCustomer({
            organizationId: organization.id,
            // pricingModelId not set - should use default
          })
      )

      const defaultPaymentMethod = await adminTransaction(
        async ({ transaction }) =>
          setupPaymentMethod({
            organizationId: organization.id,
            customerId: defaultCustomer.id,
          })
      )

      const defaultSubscription = await adminTransaction(
        async ({ transaction }) =>
          setupSubscription({
            organizationId: organization.id,
            customerId: defaultCustomer.id,
            paymentMethodId: defaultPaymentMethod.id,
            priceId: price.id,
          })
      )

      const now = new Date()
      const endDate = new Date(now)
      endDate.setDate(endDate.getDate() + 30)
      await adminTransaction(async ({ transaction }) =>
        setupBillingPeriod({
          subscriptionId: defaultSubscription.id,
          startDate: now,
          endDate,
        })
      )

      // Execute: Create usage event for customer using default pricing model
      const result = await adminTransaction(async ({ transaction }) =>
        bulkInsertUsageEventsTransaction(
          {
            input: {
              usageEvents: [
                {
                  subscriptionId: defaultSubscription.id,
                  priceId: price.id,
                  amount: 300,
                  transactionId: `txn_default_pm_${Date.now()}`,
                },
              ],
            },
            livemode: true,
          },
          createDiscardingEffectsContext(transaction)
        )
      )

      // Expectations: Event should use the default pricing model
      expect(result.unwrap().usageEvents).toHaveLength(1)
      expect(result.unwrap().usageEvents[0].customerId).toBe(
        defaultCustomer.id
      )
      expect(result.unwrap().usageEvents[0].priceId).toBe(price.id)
      expect(result.unwrap().usageEvents[0].usageMeterId).toBe(
        usageMeter.id
      )
    })

    it('should handle mix of customers with and without explicit pricingModelId', async () => {
      // Setup: Create some customers with explicit pricing model, some without
      const explicitPricingModel = await adminTransaction(
        async ({ transaction }) =>
          setupPricingModel({
            organizationId: organization.id,
            name: 'Explicit Pricing Model',
            isDefault: false,
            livemode: false,
          })
      )

      const explicitProduct = await adminTransaction(
        async ({ transaction }) =>
          setupProduct({
            organizationId: organization.id,
            pricingModelId: explicitPricingModel.id,
            name: 'Explicit Product',
            livemode: false,
          })
      )

      const explicitUsageMeter = await adminTransaction(
        async ({ transaction }) =>
          setupUsageMeter({
            organizationId: organization.id,
            name: 'Explicit Usage Meter',
            livemode: false,
            pricingModelId: explicitPricingModel.id,
          })
      )

      const explicitPrice = await adminTransaction(
        async ({ transaction }) =>
          setupPrice({
            name: 'Explicit Usage Price',
            type: PriceType.Usage,
            unitPrice: 15,
            intervalUnit: IntervalUnit.Day,
            intervalCount: 1,
            livemode: false,
            isDefault: false,
            currency: CurrencyCode.USD,
            usageMeterId: explicitUsageMeter.id,
          })
      )

      // Create 3 customers with explicit pricing model
      const explicitCustomers = []
      for (let i = 0; i < 3; i++) {
        const customerData = await adminTransaction(
          async ({ transaction }) =>
            setupCustomer({
              organizationId: organization.id,
              pricingModelId: explicitPricingModel.id,
            })
        )

        const pmData = await adminTransaction(
          async ({ transaction }) =>
            setupPaymentMethod({
              organizationId: organization.id,
              customerId: customerData.id,
            })
        )

        const subData = await adminTransaction(
          async ({ transaction }) =>
            setupSubscription({
              organizationId: organization.id,
              customerId: customerData.id,
              paymentMethodId: pmData.id,
              priceId: explicitPrice.id,
            })
        )

        await adminTransaction(async ({ transaction }) => {
          const now = new Date()
          const endDate = new Date(now)
          endDate.setDate(endDate.getDate() + 30)
          return setupBillingPeriod({
            subscriptionId: subData.id,
            startDate: now,
            endDate,
          })
        })

        explicitCustomers.push({
          customer: customerData,
          subscription: subData,
          price: explicitPrice,
          usageMeter: explicitUsageMeter,
        })
      }

      // Create 3 customers with default pricing model
      const defaultCustomers = []
      for (let i = 0; i < 3; i++) {
        const customerData = await adminTransaction(
          async ({ transaction }) =>
            setupCustomer({
              organizationId: organization.id,
              // No pricingModelId - uses default
            })
        )

        const pmData = await adminTransaction(
          async ({ transaction }) =>
            setupPaymentMethod({
              organizationId: organization.id,
              customerId: customerData.id,
            })
        )

        const subData = await adminTransaction(
          async ({ transaction }) =>
            setupSubscription({
              organizationId: organization.id,
              customerId: customerData.id,
              paymentMethodId: pmData.id,
              priceId: price.id,
            })
        )

        await adminTransaction(async ({ transaction }) => {
          const now = new Date()
          const endDate = new Date(now)
          endDate.setDate(endDate.getDate() + 30)
          return setupBillingPeriod({
            subscriptionId: subData.id,
            startDate: now,
            endDate,
          })
        })

        defaultCustomers.push({
          customer: customerData,
          subscription: subData,
          price,
          usageMeter,
        })
      }

      // Execute: Create usage events for all 6 customers in a single batch
      const timestamp = Date.now()
      const allEvents = [
        ...explicitCustomers.map(
          ({ subscription, price }, index) => ({
            subscriptionId: subscription.id,
            priceId: price.id,
            amount: (index + 1) * 100,
            transactionId: `txn_mixed_explicit_${index}_${timestamp}`,
          })
        ),
        ...defaultCustomers.map(({ subscription, price }, index) => ({
          subscriptionId: subscription.id,
          priceId: price.id,
          amount: (index + 4) * 100,
          transactionId: `txn_mixed_default_${index}_${timestamp}`,
        })),
      ]

      const result = await adminTransaction(async ({ transaction }) =>
        bulkInsertUsageEventsTransaction(
          {
            input: {
              usageEvents: allEvents,
            },
            livemode: false,
          },
          createDiscardingEffectsContext(transaction)
        )
      )

      // Expectations: All 6 events processed correctly
      expect(result.unwrap().usageEvents).toHaveLength(6)

      // Verify explicit pricing model customers
      explicitCustomers.forEach(({ customer, price, usageMeter }) => {
        const event = result
          .unwrap()
          .usageEvents.find((e) => e.customerId === customer.id)
        expect(event).toMatchObject({
          customerId: customer.id,
          priceId: price.id,
          usageMeterId: usageMeter.id,
        })
      })

      // Verify default pricing model customers
      defaultCustomers.forEach(({ customer, price, usageMeter }) => {
        const event = result
          .unwrap()
          .usageEvents.find((e) => e.customerId === customer.id)
        expect(event).toMatchObject({
          customerId: customer.id,
          priceId: price.id,
          usageMeterId: usageMeter.id,
        })
      })
    })
  })

  describe('batch pricing model lookups', () => {
    it('should handle multiple customers sharing same pricing model', async () => {
      // Note: This test verifies correctness when multiple customers share the same pricing model.
      // The implementation deduplicates pricing model fetches (one query for all customers sharing a model),
      // but we verify behavior rather than implementation details (no mocking/spying per test guidelines).
      // Setup: Create 10 customers all sharing the same pricing model
      const { organization } = await setupOrg()

      const pricingModel = await adminTransaction(
        async ({ transaction }) =>
          setupPricingModel({
            organizationId: organization.id,
            isDefault: false,
          })
      )

      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Shared Usage Meter',
        livemode: true,
        pricingModelId: pricingModel.id,
      })

      const price = await setupPrice({
        name: 'Shared Usage Price',
        type: PriceType.Usage,
        unitPrice: 10,
        intervalUnit: IntervalUnit.Day,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: CurrencyCode.USD,
        usageMeterId: usageMeter.id,
      })

      // Create 10 customers all with the same explicit pricing model
      const customers = []
      for (let i = 0; i < 10; i++) {
        const customerData = await adminTransaction(
          async ({ transaction }) =>
            setupCustomer({
              organizationId: organization.id,
              pricingModelId: pricingModel.id,
            })
        )

        const pmData = await adminTransaction(
          async ({ transaction }) =>
            setupPaymentMethod({
              organizationId: organization.id,
              customerId: customerData.id,
            })
        )

        const subData = await adminTransaction(
          async ({ transaction }) =>
            setupSubscription({
              organizationId: organization.id,
              customerId: customerData.id,
              paymentMethodId: pmData.id,
              priceId: price.id,
            })
        )

        await adminTransaction(async ({ transaction }) => {
          const now = new Date()
          const endDate = new Date(now)
          endDate.setDate(endDate.getDate() + 30)
          return setupBillingPeriod({
            subscriptionId: subData.id,
            startDate: now,
            endDate,
          })
        })

        customers.push({
          customer: customerData,
          subscription: subData,
        })
      }

      // Execute: Create usage events for all 10 customers
      const timestamp = Date.now()
      const events = customers.map(({ subscription }, index) => ({
        subscriptionId: subscription.id,
        priceId: price.id,
        amount: (index + 1) * 100,
        transactionId: `txn_shared_${index}_${timestamp}`,
      }))

      const result = await adminTransaction(async ({ transaction }) =>
        bulkInsertUsageEventsTransaction(
          {
            input: {
              usageEvents: events,
            },
            livemode: true,
          },
          createDiscardingEffectsContext(transaction)
        )
      )

      // Expectations: All 10 events processed correctly
      expect(result.unwrap().usageEvents).toHaveLength(10)

      // All customers should get the correct pricing model
      customers.forEach(({ customer }) => {
        const event = result
          .unwrap()
          .usageEvents.find((e) => e.customerId === customer.id)
        expect(event).toMatchObject({
          customerId: customer.id,
          priceId: price.id,
          usageMeterId: usageMeter.id,
          pricingModelId: pricingModel.id,
        })
      })
    })

    it('should handle multiple unique pricing models correctly', async () => {
      // Note: This test verifies correctness when customers have different pricing models.
      // The implementation fetches pricing models in parallel and deduplicates by model ID,
      // but we verify behavior rather than implementation details
      // Setup: Create 5 different pricing models
      const orgSetup = await setupOrg()
      const { organization } = orgSetup

      // Use the default pricing model from setupOrg as the first pricing model
      const defaultUsageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Default Usage Meter',
        livemode: true,
        pricingModelId: orgSetup.pricingModel.id,
      })

      const defaultPrice = await setupPrice({
        name: 'Default Usage Price',
        type: PriceType.Usage,
        unitPrice: 10,
        intervalUnit: IntervalUnit.Day,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: CurrencyCode.USD,
        usageMeterId: defaultUsageMeter.id,
      })

      const pricingModelsData = [
        {
          pricingModel: orgSetup.pricingModel,
          usageMeter: defaultUsageMeter,
          price: defaultPrice,
        },
      ]

      // Create 4 more non-default pricing models
      for (let i = 0; i < 4; i++) {
        const pricingModel = await adminTransaction(
          async ({ transaction }) =>
            setupPricingModel({
              organizationId: organization.id,
              isDefault: false,
            })
        )

        const usageMeter = await setupUsageMeter({
          organizationId: organization.id,
          name: `Usage Meter ${i + 1}`,
          livemode: true,
          pricingModelId: pricingModel.id,
        })

        const price = await setupPrice({
          name: `Usage Price ${i + 1}`,
          type: PriceType.Usage,
          unitPrice: 10,
          intervalUnit: IntervalUnit.Day,
          intervalCount: 1,
          livemode: true,
          isDefault: false,
          currency: CurrencyCode.USD,
          usageMeterId: usageMeter.id,
        })

        pricingModelsData.push({ pricingModel, usageMeter, price })
      }

      // Create 2 customers per pricing model (10 total)
      const customers = []
      for (const { pricingModel, price } of pricingModelsData) {
        for (let i = 0; i < 2; i++) {
          const customerData = await adminTransaction(
            async ({ transaction }) =>
              setupCustomer({
                organizationId: organization.id,
                pricingModelId: pricingModel.id,
              })
          )

          const pmData = await adminTransaction(
            async ({ transaction }) =>
              setupPaymentMethod({
                organizationId: organization.id,
                customerId: customerData.id,
              })
          )

          const subData = await adminTransaction(
            async ({ transaction }) =>
              setupSubscription({
                organizationId: organization.id,
                customerId: customerData.id,
                paymentMethodId: pmData.id,
                priceId: price.id,
              })
          )

          await adminTransaction(async ({ transaction }) => {
            const now = new Date()
            const endDate = new Date(now)
            endDate.setDate(endDate.getDate() + 30)
            return setupBillingPeriod({
              subscriptionId: subData.id,
              startDate: now,
              endDate,
            })
          })

          customers.push({
            customer: customerData,
            subscription: subData,
            expectedPricingModelId: pricingModel.id,
            price,
          })
        }
      }

      // Execute: Create usage events for all customers
      const timestamp = Date.now()
      const events = customers.map(
        ({ subscription, price }, index) => ({
          subscriptionId: subscription.id,
          priceId: price.id,
          amount: (index + 1) * 100,
          transactionId: `txn_parallel_${index}_${timestamp}`,
        })
      )

      const result = await adminTransaction(async ({ transaction }) =>
        bulkInsertUsageEventsTransaction(
          {
            input: {
              usageEvents: events,
            },
            livemode: true,
          },
          createDiscardingEffectsContext(transaction)
        )
      )

      // Expectations: All 10 events processed correctly
      expect(result.unwrap().usageEvents).toHaveLength(10)

      // All customers should get the correct pricing model
      customers.forEach(
        ({ customer, expectedPricingModelId, price }) => {
          const event = result
            .unwrap()
            .usageEvents.find((e) => e.customerId === customer.id)
          expect(event).toMatchObject({
            customerId: customer.id,
            priceId: price.id,
            pricingModelId: expectedPricingModelId,
          })
        }
      )
    })

    it('should only resolve usage prices when using priceSlug (filters out subscription prices)', async () => {
      // Note: Usage prices don't belong to products - they belong to usage meters.
      // This test verifies that when resolving priceSlug, only usage prices are considered,
      // not subscription prices (even if they have matching slugs).
      // Setup: Create pricing model with subscription price and usage price
      const orgSetup = await setupOrg()
      const { organization } = orgSetup

      // Use the default pricing model from setupOrg
      const pricingModel = orgSetup.pricingModel

      // Create a product with subscription price
      const product = await adminTransaction(
        async ({ transaction }) =>
          setupProduct({
            name: 'Test Product',
            organizationId: organization.id,
            pricingModelId: pricingModel.id,
            active: true,
          })
      )

      const subscriptionPrice = await setupPrice({
        name: 'Subscription Price',
        type: PriceType.Subscription,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: CurrencyCode.USD,
        productId: product.id,
        trialPeriodDays: 0,
        active: true,
        slug: 'subscription-price-slug',
      })

      // Create a usage meter and usage price
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Test Usage Meter',
        livemode: true,
        pricingModelId: pricingModel.id,
      })

      const usagePrice = await setupPrice({
        name: 'Usage Price',
        type: PriceType.Usage,
        unitPrice: 10,
        intervalUnit: IntervalUnit.Day,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: CurrencyCode.USD,
        usageMeterId: usageMeter.id,
        active: true,
        slug: 'usage-price-slug',
      })

      const customerData = await adminTransaction(
        async ({ transaction }) =>
          setupCustomer({
            organizationId: organization.id,
            // Uses default pricing model
          })
      )

      const pmData = await adminTransaction(async ({ transaction }) =>
        setupPaymentMethod({
          organizationId: organization.id,
          customerId: customerData.id,
        })
      )

      const subData = await adminTransaction(
        async ({ transaction }) =>
          setupSubscription({
            organizationId: organization.id,
            customerId: customerData.id,
            paymentMethodId: pmData.id,
            priceId: subscriptionPrice.id,
          })
      )

      await adminTransaction(async ({ transaction }) => {
        const now = new Date()
        const endDate = new Date(now)
        endDate.setDate(endDate.getDate() + 30)
        return setupBillingPeriod({
          subscriptionId: subData.id,
          startDate: now,
          endDate,
        })
      })

      // Execute: Try to resolve subscription price slug - should fail (only usage prices are considered)
      const timestamp = Date.now()
      await expect(
        comprehensiveAdminTransaction(async ({ transaction }) =>
          bulkInsertUsageEventsTransaction(
            {
              input: {
                usageEvents: [
                  {
                    subscriptionId: subData.id,
                    priceSlug: 'subscription-price-slug',
                    amount: 100,
                    transactionId: `txn_subscription_slug_${timestamp}`,
                  },
                ],
              },
              livemode: true,
            },
            createDiscardingEffectsContext(transaction)
          )
        )
      ).rejects.toThrow(
        "Price not found: with slug subscription-price-slug (not in customer's pricing model)"
      )

      // Execute: Use usage price slug - should succeed
      const resultActive = await adminTransaction(
        async ({ transaction }) =>
          bulkInsertUsageEventsTransaction(
            {
              input: {
                usageEvents: [
                  {
                    subscriptionId: subData.id,
                    priceSlug: 'usage-price-slug',
                    amount: 100,
                    transactionId: `txn_usage_slug_${timestamp}`,
                  },
                ],
              },
              livemode: true,
            },
            createDiscardingEffectsContext(transaction)
          )
      )

      // Expectation: Usage price slug should resolve correctly
      expect(resultActive.unwrap().usageEvents).toHaveLength(1)
      expect(resultActive.unwrap().usageEvents[0].priceId).toBe(
        usagePrice.id
      )
    })
  })

  describe('batchFetchPricingModelsForCustomers', () => {
    it('should fetch explicit pricing models for customers with pricingModelId', async () => {
      const orgSetup1 = await setupOrg()
      const orgSetup2 = await setupOrg()

      const customer1 = await setupCustomer({
        organizationId: orgSetup1.organization.id,
        pricingModelId: orgSetup1.pricingModel.id,
      })

      const customer2 = await setupCustomer({
        organizationId: orgSetup2.organization.id,
        pricingModelId: orgSetup2.pricingModel.id,
      })

      const result = await adminTransaction(
        async ({ transaction }) => {
          const customersInfo = await selectCustomerPricingInfoBatch(
            [customer1.id, customer2.id],
            transaction
          )
          return batchFetchPricingModelsForCustomers(
            customersInfo,
            transaction
          )
        }
      )

      expect(result.size).toBe(2)
      expect(result.get(customer1.id)?.id).toBe(
        orgSetup1.pricingModel.id
      )
      expect(result.get(customer2.id)?.id).toBe(
        orgSetup2.pricingModel.id
      )
    })

    it('should fetch pricing models for customers with default pricing model', async () => {
      const orgSetup = await setupOrg()

      // When no explicit pricingModelId is provided, setupCustomer uses the default
      const customer = await setupCustomer({
        organizationId: orgSetup.organization.id,
        // No explicit pricingModelId - will use default
      })

      const result = await adminTransaction(
        async ({ transaction }) => {
          const customersInfo = await selectCustomerPricingInfoBatch(
            [customer.id],
            transaction
          )
          return batchFetchPricingModelsForCustomers(
            customersInfo,
            transaction
          )
        }
      )

      expect(result.size).toBe(1)
      const pricingModel = result.get(customer.id)
      expect(pricingModel?.id).toBe(orgSetup.pricingModel.id)
      expect(pricingModel?.isDefault).toBe(true)
    })
  })

  // Helper function to create getPricingModelForCustomer mock
  const createGetPricingModelForCustomerMock = (
    customer: Customer.Record,
    pricingModel: PricingModelSlugResolutionData
  ) => {
    return (customerId: string) => {
      if (customerId === customer.id) {
        return pricingModel
      }
      throw new NotFoundError(
        'PricingModel',
        `for customer ${customerId}`
      )
    }
  }

  describe('resolvePriceSlugs', () => {
    it('should resolve price slugs to IDs using composite customerId:slug keys', async () => {
      const orgSetup = await setupOrg()
      const usageMeter = await setupUsageMeter({
        organizationId: orgSetup.organization.id,
        name: 'Test Meter',
        livemode: true,
        pricingModelId: orgSetup.pricingModel.id,
      })

      const price = await setupPrice({
        name: 'Test Price',
        type: PriceType.Usage,
        unitPrice: 10,
        intervalUnit: IntervalUnit.Day,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: CurrencyCode.USD,
        usageMeterId: usageMeter.id,
        active: true,
        slug: 'test-price-slug',
      })

      const customer = await setupCustomer({
        organizationId: orgSetup.organization.id,
        pricingModelId: orgSetup.pricingModel.id,
      })

      const result = await adminTransaction(
        async ({ transaction }) => {
          const [pricingModel] =
            await selectPricingModelSlugResolutionData(
              { id: orgSetup.pricingModel.id },
              transaction
            )

          const getPricingModelForCustomer =
            createGetPricingModelForCustomerMock(
              customer,
              pricingModel
            )

          const context: TestResolvePriceSlugsContext = {
            eventsWithPriceSlugs: [
              {
                index: 0,
                slug: 'test-price-slug',
                customerId: customer.id,
              },
            ],
            getPricingModelForCustomer,
          }

          return resolvePriceSlugs(context as WithSlugEventsContext)
        }
      )

      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        const slugToPriceIdMap = result.value.slugToPriceIdMap
        expect(slugToPriceIdMap.size).toBe(1)
        expect(
          slugToPriceIdMap.get(`${customer.id}:test-price-slug`)
        ).toBe(price.id)
      }
    })
  })

  describe('resolvePriceSlugs and resolveUsageMeterSlugs - shared error handling', () => {
    it('should return error when pricing model is not found for customer in both functions', async () => {
      const orgSetup = await setupOrg()
      const customer = await setupCustomer({
        organizationId: orgSetup.organization.id,
        pricingModelId: orgSetup.pricingModel.id,
      })

      const getPricingModelForCustomer = (customerId: string) => {
        // Throw NotFoundError to simulate pricing model not found
        throw new NotFoundError(
          'PricingModel',
          `for customer ${customerId}`
        )
      }

      // Test resolvePriceSlugs
      const priceSlugResult = await adminTransaction(
        async ({ transaction }) => {
          const context: TestResolvePriceSlugsContext = {
            eventsWithPriceSlugs: [
              {
                index: 0,
                slug: 'test-slug',
                customerId: customer.id,
              },
            ],
            getPricingModelForCustomer,
          }

          return resolvePriceSlugs(context as WithSlugEventsContext)
        }
      )

      expect(priceSlugResult.status).toBe('error')
      if (priceSlugResult.status === 'error') {
        expect(priceSlugResult.error).toBeInstanceOf(NotFoundError)
        expect(priceSlugResult.error.message).toBe(
          `PricingModel not found: for customer ${customer.id}`
        )
      }

      // Test resolveUsageMeterSlugs
      const usageMeterSlugResult = await adminTransaction(
        async ({ transaction }) => {
          const context: TestResolveUsageMeterSlugsContext = {
            eventsWithUsageMeterSlugs: [
              {
                index: 0,
                slug: 'test-meter-slug',
                customerId: customer.id,
              },
            ],
            getPricingModelForCustomer,
            slugToPriceIdMap: new Map(),
          }

          return resolveUsageMeterSlugs(
            context as WithSlugEventsContext & {
              slugToPriceIdMap: Map<string, string>
            }
          )
        }
      )

      expect(usageMeterSlugResult.status).toBe('error')
      if (usageMeterSlugResult.status === 'error') {
        expect(usageMeterSlugResult.error).toBeInstanceOf(
          NotFoundError
        )
        expect(usageMeterSlugResult.error.message).toBe(
          `PricingModel not found: for customer ${customer.id}`
        )
      }
    })

    it('should return error when slug is not found in both functions', async () => {
      const orgSetup = await setupOrg()
      const customer = await setupCustomer({
        organizationId: orgSetup.organization.id,
        pricingModelId: orgSetup.pricingModel.id,
      })

      // Test resolvePriceSlugs - slug not found
      const priceSlugResult = await adminTransaction(
        async ({ transaction }) => {
          const [pricingModel] =
            await selectPricingModelSlugResolutionData(
              { id: orgSetup.pricingModel.id },
              transaction
            )

          const getPricingModelForCustomer =
            createGetPricingModelForCustomerMock(
              customer,
              pricingModel
            )

          const context: TestResolvePriceSlugsContext = {
            eventsWithPriceSlugs: [
              {
                index: 0,
                slug: 'non-existent-slug',
                customerId: customer.id,
              },
            ],
            getPricingModelForCustomer,
          }

          return resolvePriceSlugs(context as WithSlugEventsContext)
        }
      )

      expect(priceSlugResult.status).toBe('error')
      if (priceSlugResult.status === 'error') {
        expect(priceSlugResult.error).toBeInstanceOf(NotFoundError)
        expect(priceSlugResult.error.message).toBe(
          "Price not found: with slug non-existent-slug (not in customer's pricing model)"
        )
      }

      // Test resolveUsageMeterSlugs - slug not found
      const usageMeterSlugResult = await adminTransaction(
        async ({ transaction }) => {
          const [pricingModel] =
            await selectPricingModelSlugResolutionData(
              { id: orgSetup.pricingModel.id },
              transaction
            )

          const getPricingModelForCustomer =
            createGetPricingModelForCustomerMock(
              customer,
              pricingModel
            )

          const context: TestResolveUsageMeterSlugsContext = {
            eventsWithUsageMeterSlugs: [
              {
                index: 0,
                slug: 'non-existent-meter-slug',
                customerId: customer.id,
              },
            ],
            getPricingModelForCustomer,
            slugToPriceIdMap: new Map(),
          }

          return resolveUsageMeterSlugs(
            context as WithSlugEventsContext & {
              slugToPriceIdMap: Map<string, string>
            }
          )
        }
      )

      expect(usageMeterSlugResult.status).toBe('error')
      if (usageMeterSlugResult.status === 'error') {
        expect(usageMeterSlugResult.error.message).toContain(
          'slug "non-existent-meter-slug"'
        )
      }
    })
  })

  describe('resolveUsageMeterSlugs', () => {
    it('should resolve usage meter slugs to IDs using composite customerId:slug keys', async () => {
      const orgSetup = await setupOrg()
      const usageMeter = await setupUsageMeter({
        organizationId: orgSetup.organization.id,
        name: 'Test Meter',
        livemode: true,
        pricingModelId: orgSetup.pricingModel.id,
        slug: 'test-meter-slug',
      })

      const customer = await setupCustomer({
        organizationId: orgSetup.organization.id,
        pricingModelId: orgSetup.pricingModel.id,
      })

      const result = await adminTransaction(
        async ({ transaction }) => {
          const [pricingModel] =
            await selectPricingModelSlugResolutionData(
              { id: orgSetup.pricingModel.id },
              transaction
            )

          const getPricingModelForCustomer =
            createGetPricingModelForCustomerMock(
              customer,
              pricingModel
            )

          const context: TestResolveUsageMeterSlugsContext = {
            eventsWithUsageMeterSlugs: [
              {
                index: 0,
                slug: 'test-meter-slug',
                customerId: customer.id,
              },
            ],
            getPricingModelForCustomer,
            slugToPriceIdMap: new Map(),
          }

          return resolveUsageMeterSlugs(
            context as WithSlugEventsContext & {
              slugToPriceIdMap: Map<string, string>
            }
          )
        }
      )

      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        const slugToUsageMeterIdMap =
          result.value.slugToUsageMeterIdMap
        expect(slugToUsageMeterIdMap.size).toBe(1)
        expect(
          slugToUsageMeterIdMap.get(`${customer.id}:test-meter-slug`)
        ).toBe(usageMeter.id)
      }
    })

    it('should handle multiple usage meter slugs for different customers', async () => {
      const orgSetup1 = await setupOrg()
      const orgSetup2 = await setupOrg()

      const usageMeter1 = await setupUsageMeter({
        organizationId: orgSetup1.organization.id,
        name: 'Meter 1',
        livemode: true,
        pricingModelId: orgSetup1.pricingModel.id,
        slug: 'meter-1-slug',
      })

      const usageMeter2 = await setupUsageMeter({
        organizationId: orgSetup2.organization.id,
        name: 'Meter 2',
        livemode: true,
        pricingModelId: orgSetup2.pricingModel.id,
        slug: 'meter-2-slug',
      })

      const customer1 = await setupCustomer({
        organizationId: orgSetup1.organization.id,
        pricingModelId: orgSetup1.pricingModel.id,
      })

      const customer2 = await setupCustomer({
        organizationId: orgSetup2.organization.id,
        pricingModelId: orgSetup2.pricingModel.id,
      })

      const result = await adminTransaction(
        async ({ transaction }) => {
          const [pricingModel1] =
            await selectPricingModelSlugResolutionData(
              { id: orgSetup1.pricingModel.id },
              transaction
            )
          const [pricingModel2] =
            await selectPricingModelSlugResolutionData(
              { id: orgSetup2.pricingModel.id },
              transaction
            )

          const getPricingModelForCustomer = (customerId: string) => {
            if (customerId === customer1.id) {
              return pricingModel1
            }
            if (customerId === customer2.id) {
              return pricingModel2
            }
            throw new NotFoundError(
              'PricingModel',
              `for customer ${customerId}`
            )
          }

          const context: TestResolveUsageMeterSlugsContext = {
            eventsWithUsageMeterSlugs: [
              {
                index: 0,
                slug: 'meter-1-slug',
                customerId: customer1.id,
              },
              {
                index: 1,
                slug: 'meter-2-slug',
                customerId: customer2.id,
              },
            ],
            getPricingModelForCustomer,
            slugToPriceIdMap: new Map(),
          }

          return resolveUsageMeterSlugs(
            context as WithSlugEventsContext & {
              slugToPriceIdMap: Map<string, string>
            }
          )
        }
      )

      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        const slugToUsageMeterIdMap =
          result.value.slugToUsageMeterIdMap
        expect(slugToUsageMeterIdMap.size).toBe(2)
        expect(
          slugToUsageMeterIdMap.get(`${customer1.id}:meter-1-slug`)
        ).toBe(usageMeter1.id)
        expect(
          slugToUsageMeterIdMap.get(`${customer2.id}:meter-2-slug`)
        ).toBe(usageMeter2.id)
      }
    })
  })
})
