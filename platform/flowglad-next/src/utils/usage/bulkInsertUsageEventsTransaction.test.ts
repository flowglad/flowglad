import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupBillingPeriod,
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupSubscription,
  setupUsageMeter,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { UsageEventProcessedLedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { Customer } from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { Subscription } from '@/db/schema/subscriptions'
import type { UsageMeter } from '@/db/schema/usageMeters'
import {
  CurrencyCode,
  IntervalUnit,
  LedgerTransactionType,
  PriceType,
  UsageMeterAggregationType,
} from '@/types'
import { bulkInsertUsageEventsTransaction } from './bulkInsertUsageEventsTransaction'

// FIXME: TypeScript is failing to narrow the zod discriminated union correctly for usage prices.
// The discriminated union in setupPriceInputSchema should allow PriceType.Usage, but TypeScript
// incorrectly narrows it to PriceType.Subscription. This type assertion is a workaround.
// We should investigate why the discriminated union isn't working properly - possibly related
// to zod 4.x or how the schemas are structured (setupUsagePriceSchema extends a different base).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asUsagePriceInput = (
  input: any
): Parameters<typeof setupPrice>[0] => input

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
          transaction
        )
      )

      expect(result.result.usageEvents).toHaveLength(1)
      expect(result.result.usageEvents[0].priceId).toBe(price.id)
      expect(result.result.usageEvents[0].usageMeterId).toBe(
        usageMeter.id
      )
    })

    it('should resolve usageMeterSlug to usageMeterId', async () => {
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
          transaction
        )
      )

      expect(result.result.usageEvents).toHaveLength(1)
      expect(result.result.usageEvents[0].priceId).toBeNull()
      expect(result.result.usageEvents[0].usageMeterId).toBe(
        usageMeter.id
      )
    })

    it('should throw error when priceSlug not found', async () => {
      await expect(
        adminTransaction(async ({ transaction }) =>
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
            transaction
          )
        )
      ).rejects.toThrow('Price with slug non-existent-slug not found')
    })

    it('should throw error when usageMeterSlug not found', async () => {
      await expect(
        adminTransaction(async ({ transaction }) =>
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
            transaction
          )
        )
      ).rejects.toThrow(
        'Usage meter with slug non-existent-slug not found'
      )
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
        adminTransaction(async ({ transaction }) =>
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
            transaction
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
        adminTransaction(async ({ transaction }) =>
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
            transaction
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

      // Create a usage price for the count distinct meter
      const countDistinctPrice = await adminTransaction(
        async ({ transaction }) =>
          setupPrice(
            asUsagePriceInput({
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
        adminTransaction(async ({ transaction }) =>
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
            transaction
          )
        )
      ).rejects.toThrow('Billing period is required')
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
          transaction
        )
      )
      const after = Date.now()

      expect(result.result.usageEvents).toHaveLength(1)
      expect(result.result.usageEvents[0].properties).toEqual({})
      expect(
        result.result.usageEvents[0].usageDate
      ).toBeGreaterThanOrEqual(before)
      expect(
        result.result.usageEvents[0].usageDate
      ).toBeLessThanOrEqual(after)
    })
  })

  describe('idempotency', () => {
    it('should not insert duplicate events with same transactionId', async () => {
      const transactionId = `txn_dedup_${Date.now()}`

      const firstResult = await adminTransaction(
        async ({ transaction }) =>
          bulkInsertUsageEventsTransaction(
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
            transaction
          )
      )

      expect(firstResult.result.usageEvents).toHaveLength(1)
      expect(firstResult.ledgerCommands?.length).toBe(1)

      // Resubmit the same payload
      const secondResult = await adminTransaction(
        async ({ transaction }) =>
          bulkInsertUsageEventsTransaction(
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
            transaction
          )
      )

      // Should return empty array (no new events inserted)
      expect(secondResult.result.usageEvents).toHaveLength(0)
      // Should not generate ledger commands for deduped entries
      expect(secondResult.ledgerCommands?.length).toBe(0)
    })

    it('should only generate ledger commands for newly inserted events', async () => {
      const transactionId1 = `txn_ledger_1_${Date.now()}`
      const transactionId2 = `txn_ledger_2_${Date.now()}`

      // First bulk insert
      const firstResult = await adminTransaction(
        async ({ transaction }) =>
          bulkInsertUsageEventsTransaction(
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
            transaction
          )
      )

      expect(firstResult.result.usageEvents).toHaveLength(2)
      expect(firstResult.ledgerCommands?.length).toBe(2)

      // Resubmit with one duplicate and one new
      const secondResult = await adminTransaction(
        async ({ transaction }) =>
          bulkInsertUsageEventsTransaction(
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
            transaction
          )
      )

      // Should only insert the new event
      expect(secondResult.result.usageEvents).toHaveLength(1)
      expect(secondResult.result.usageEvents[0].amount).toBe(300)
      // The first result should have generated commands for 2 events
      expect(firstResult.ledgerCommands?.length).toBe(2)
      // The second result should only have commands for 1 new event (the duplicate should not generate commands)
      // This verifies that deduped entries don't generate ledger commands
      expect(secondResult.ledgerCommands?.length).toBe(1)
    })
  })

  describe('happy path', () => {
    it('should successfully insert multiple usage events', async () => {
      const result = await adminTransaction(async ({ transaction }) =>
        bulkInsertUsageEventsTransaction(
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
          transaction
        )
      )

      expect(result.result.usageEvents).toHaveLength(2)
      expect(result.result.usageEvents[0].amount).toBe(100)
      expect(result.result.usageEvents[1].amount).toBe(200)
      expect(result.ledgerCommands?.length).toBe(2)
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
      const result = await adminTransaction(async ({ transaction }) =>
        bulkInsertUsageEventsTransaction(
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
          transaction
        )
      )

      // Should successfully insert all 4 events
      expect(result.result.usageEvents).toHaveLength(4)

      // Verify each event has the correct customer and subscription
      const eventsForSub1 = result.result.usageEvents.filter(
        (e) => e.subscriptionId === subscription.id
      )
      const eventsForSub2 = result.result.usageEvents.filter(
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
      result.result.usageEvents.forEach((event) => {
        expect(event.priceId).toBe(price.id)
      })

      // Verify amounts match the input
      expect(result.result.usageEvents[0].amount).toBe(100)
      expect(result.result.usageEvents[1].amount).toBe(200)
      expect(result.result.usageEvents[2].amount).toBe(150)
      expect(result.result.usageEvents[3].amount).toBe(250)

      expect(result.ledgerCommands?.length).toBe(4)
      // Verify each ledger command is linked to a usage event
      result.ledgerCommands?.forEach((cmd) => {
        // Assert that this is a UsageEventProcessedLedgerCommand
        expect(cmd.type).toBe(
          LedgerTransactionType.UsageEventProcessed
        )
        const ledgerCmd = cmd as UsageEventProcessedLedgerCommand
        const linkedEvent = result.result.usageEvents.find(
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
