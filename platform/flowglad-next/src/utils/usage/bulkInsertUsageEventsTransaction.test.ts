import { beforeEach, describe, expect, it } from 'bun:test'
import {
  setupBillingPeriod,
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupSubscription,
  setupUsageMeter,
} from '@/../seedDatabase'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import type { UsageEventProcessedLedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { Customer } from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { Subscription } from '@/db/schema/subscriptions'
import type { UsageMeter } from '@/db/schema/usageMeters'
import {
  createCapturingEffectsContext,
  createDiscardingEffectsContext,
} from '@/test-utils/transactionCallbacks'
import {
  CurrencyCode,
  IntervalUnit,
  LedgerTransactionType,
  PriceType,
  UsageMeterAggregationType,
} from '@/types'
import { bulkInsertUsageEventsTransaction } from './bulkInsertUsageEventsTransaction'

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
      ).rejects.toThrow('Price with slug non-existent-slug not found')
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
        'Usage meter with slug non-existent-slug not found'
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
      ).rejects.toThrow("not found for this customer's pricing model")
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
      ).rejects.toThrow('has no default price')
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
      ).rejects.toThrow('has no default price')
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
      ).rejects.toThrow("not found for this customer's pricing model")
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
      ).rejects.toThrow('Billing period is required')
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
      ).rejects.toThrow('Properties are required')

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
      ).rejects.toThrow('Properties are required')
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
})
