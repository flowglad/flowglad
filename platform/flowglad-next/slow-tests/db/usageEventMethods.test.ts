import { beforeEach, describe, expect, it } from 'bun:test'
import {
  setupBillingPeriod,
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupSubscription,
  setupUsageEvent,
  setupUsageMeter,
  setupUserAndApiKey,
} from '@/../seedDatabase'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { Customer } from '@/db/schema/customers'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { Subscription } from '@/db/schema/subscriptions'
import type { UsageEvent } from '@/db/schema/usageEvents'
import type { UsageMeter } from '@/db/schema/usageMeters'
import {
  bulkInsertOrDoNothingUsageEventsByTransactionId,
  selectUsageEventsTableRowData,
} from '@/db/tableMethods/usageEventMethods'
import {
  IntervalUnit,
  PaymentMethodType,
  PriceType,
  SubscriptionStatus,
} from '@/types'

describe('selectUsageEventsTableRowData', () => {
  let org1Data: Awaited<ReturnType<typeof setupOrg>>
  let org1ApiKeyToken: string
  let customer1: Customer.Record
  let subscription1: Subscription.Record
  let usageMeter1: UsageMeter.Record
  let price1: Price.Record
  let billingPeriod1: BillingPeriod.Record
  let paymentMethod1: PaymentMethod.Record

  beforeEach(async () => {
    // Setup organization 1 with API key
    org1Data = await setupOrg()
    const userApiKeyOrg1 = await setupUserAndApiKey({
      organizationId: org1Data.organization.id,
      livemode: true,
    })
    if (!userApiKeyOrg1.apiKey.token) {
      throw new Error('API key token not found after setup for org1')
    }
    org1ApiKeyToken = userApiKeyOrg1.apiKey.token

    // Setup customer
    customer1 = await setupCustomer({
      organizationId: org1Data.organization.id,
      email: `customer1+${Date.now()}@test.com`,
      pricingModelId: org1Data.pricingModel.id,
    })

    // Setup payment method
    paymentMethod1 = await setupPaymentMethod({
      organizationId: org1Data.organization.id,
      customerId: customer1.id,
      type: PaymentMethodType.Card,
    })

    // Setup usage meter
    usageMeter1 = await setupUsageMeter({
      organizationId: org1Data.organization.id,
      name: 'Test Usage Meter 1',
      pricingModelId: org1Data.pricingModel.id,
    })

    // Setup price
    price1 = await setupPrice({
      name: 'Test Price 1',
      type: PriceType.Usage,
      unitPrice: 100,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      usageMeterId: usageMeter1.id,
    })

    // Setup subscription
    subscription1 = await setupSubscription({
      organizationId: org1Data.organization.id,
      customerId: customer1.id,
      paymentMethodId: paymentMethod1.id,
      priceId: price1.id,
      status: SubscriptionStatus.Active,
    })

    // Setup billing period
    billingPeriod1 = await setupBillingPeriod({
      subscriptionId: subscription1.id,
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
    })
  })

  it('should return enriched data with all related records, including events with and without prices', async () => {
    // Create multiple usage events with prices
    const eventsWithPrice: UsageEvent.Record[] = []
    for (let i = 0; i < 3; i++) {
      const event = await setupUsageEvent({
        organizationId: org1Data.organization.id,
        customerId: customer1.id,
        subscriptionId: subscription1.id,
        usageMeterId: usageMeter1.id,
        priceId: price1.id,
        billingPeriodId: billingPeriod1.id,
        amount: 100 + i,
        transactionId: `txn_with_price_${i}_${Date.now()}`,
      })
      eventsWithPrice.push(event)
    }

    // Create a no-charge price (unitPrice: 0) to test events with different price types
    const noChargePrice = await setupPrice({
      name: 'No Charge Price',
      type: PriceType.Usage,
      unitPrice: 0,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      usageMeterId: usageMeter1.id,
    })

    // Create usage event with no-charge price
    const eventWithNoChargePrice = await setupUsageEvent({
      organizationId: org1Data.organization.id,
      customerId: customer1.id,
      subscriptionId: subscription1.id,
      usageMeterId: usageMeter1.id,
      priceId: noChargePrice.id,
      billingPeriodId: billingPeriod1.id,
      amount: 200,
      transactionId: `txn_no_charge_price_${Date.now()}`,
    })

    // Call selectUsageEventsTableRowData with org1 API key
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectUsageEventsTableRowData({
          input: {
            pageSize: 10,
          },
          transaction,
        })
      },
      { apiKey: org1ApiKeyToken }
    )

    // Should return 4 enriched usage events (3 with regular price, 1 with no-charge price)
    expect(result.total).toBe(4)
    expect(result.hasNextPage).toBe(false)

    const returnedEventIds = result.items.map(
      (item) => item.usageEvent.id
    )
    const expectedEventIds = [
      ...eventsWithPrice.map((e) => e.id),
      eventWithNoChargePrice.id,
    ]
    expect(returnedEventIds.sort()).toEqual(expectedEventIds.sort())

    // Verify all events have correct enriched data
    result.items.forEach((enrichedEvent) => {
      // Verify usage event fields
      expect(enrichedEvent.usageEvent.customerId).toBe(customer1.id)
      expect(enrichedEvent.usageEvent.subscriptionId).toBe(
        subscription1.id
      )
      expect(enrichedEvent.usageEvent.usageMeterId).toBe(
        usageMeter1.id
      )

      // Verify related records match the usage event
      expect(enrichedEvent.customer.id).toBe(customer1.id)
      expect(enrichedEvent.customer.id).toBe(
        enrichedEvent.usageEvent.customerId
      )
      expect(enrichedEvent.subscription.id).toBe(subscription1.id)
      expect(enrichedEvent.subscription.id).toBe(
        enrichedEvent.usageEvent.subscriptionId
      )
      expect(enrichedEvent.usageMeter.id).toBe(usageMeter1.id)
      expect(enrichedEvent.usageMeter.id).toBe(
        enrichedEvent.usageEvent.usageMeterId
      )

      // Verify price handling - all events have a priceId (either regular or no-charge)
      if (
        eventsWithPrice.some(
          (e) => e.id === enrichedEvent.usageEvent.id
        )
      ) {
        expect(enrichedEvent.price.id).toBe(price1.id)
        expect(enrichedEvent.price.id).toBe(
          enrichedEvent.usageEvent.priceId
        )
      } else {
        // Event with no-charge price
        expect(enrichedEvent.usageEvent.priceId).toBe(
          noChargePrice.id
        )
        expect(enrichedEvent.usageEvent.amount).toBe(200)
        expect(enrichedEvent.price.id).toBe(noChargePrice.id)
        expect(enrichedEvent.price.unitPrice).toBe(0)
      }
    })
  })
})

describe('bulkInsertOrDoNothingUsageEventsByTransactionId', () => {
  let org1Data: Awaited<ReturnType<typeof setupOrg>>
  let org1ApiKeyToken: string
  let customer1: Customer.Record
  let subscription1: Subscription.Record
  let usageMeter1: UsageMeter.Record
  let usageMeter2: UsageMeter.Record
  let price1: Price.Record
  let billingPeriod1: BillingPeriod.Record
  let paymentMethod1: PaymentMethod.Record

  beforeEach(async () => {
    // Setup organization
    org1Data = await setupOrg()

    // Setup API key
    const userApiKeyOrg1 = await setupUserAndApiKey({
      organizationId: org1Data.organization.id,
      livemode: true,
    })
    if (!userApiKeyOrg1.apiKey.token) {
      throw new Error('API key token not found after setup for org1')
    }
    org1ApiKeyToken = userApiKeyOrg1.apiKey.token

    // Setup customer
    customer1 = await setupCustomer({
      organizationId: org1Data.organization.id,
      email: `customer1+${Date.now()}@test.com`,
      pricingModelId: org1Data.pricingModel.id,
    })

    // Setup payment method
    paymentMethod1 = await setupPaymentMethod({
      organizationId: org1Data.organization.id,
      customerId: customer1.id,
      type: PaymentMethodType.Card,
    })

    // Setup usage meter
    usageMeter1 = await setupUsageMeter({
      organizationId: org1Data.organization.id,
      name: 'Test Usage Meter 1',
      pricingModelId: org1Data.pricingModel.id,
    })

    // Setup second usage meter for testing
    usageMeter2 = await setupUsageMeter({
      organizationId: org1Data.organization.id,
      name: 'Test Usage Meter 2',
      pricingModelId: org1Data.pricingModel.id,
    })

    // Setup price
    price1 = await setupPrice({
      name: 'Test Price 1',
      type: PriceType.Usage,
      unitPrice: 100,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      usageMeterId: usageMeter1.id,
    })

    // Setup subscription
    subscription1 = await setupSubscription({
      organizationId: org1Data.organization.id,
      customerId: customer1.id,
      paymentMethodId: paymentMethod1.id,
      priceId: price1.id,
      status: SubscriptionStatus.Active,
    })

    // Setup billing period
    billingPeriod1 = await setupBillingPeriod({
      subscriptionId: subscription1.id,
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
    })
  })

  it('should insert new usage events when they do not exist', async () => {
    const transactionId = 'test_txn_123'
    const usageEventsData = [
      {
        customerId: customer1.id,
        subscriptionId: subscription1.id,
        usageMeterId: usageMeter1.id,
        priceId: price1.id,
        billingPeriodId: billingPeriod1.id,
        amount: 100,
        transactionId,
        usageDate: Date.now(),
        livemode: true,
        properties: {},
      },
      {
        customerId: customer1.id,
        subscriptionId: subscription1.id,
        usageMeterId: usageMeter2.id, // Use different usage meter to avoid unique constraint
        priceId: price1.id,
        billingPeriodId: billingPeriod1.id,
        amount: 200,
        transactionId,
        usageDate: Date.now(),
        livemode: true,
        properties: {},
      },
    ]

    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        return bulkInsertOrDoNothingUsageEventsByTransactionId(
          usageEventsData,
          transaction
        )
      },
      { apiKey: org1ApiKeyToken }
    )

    expect(result).toHaveLength(2) // Should insert 2 new events
    const amounts = result.map((r) => r.amount)
    expect(amounts).toContain(100)
    expect(amounts).toContain(200)
    expect(
      result.every((r) => r.transactionId === transactionId)
    ).toBe(true)
  })

  it('should not insert duplicate events for the same transaction ID', async () => {
    const transactionId = 'test_txn_duplicate'
    const usageEventsData = [
      {
        customerId: customer1.id,
        subscriptionId: subscription1.id,
        usageMeterId: usageMeter1.id,
        priceId: price1.id,
        billingPeriodId: billingPeriod1.id,
        amount: 100,
        transactionId,
        usageDate: Date.now(),
        livemode: true,
        properties: {},
      },
    ]

    // First insert
    const firstResult = await authenticatedTransaction(
      async ({ transaction }) => {
        return bulkInsertOrDoNothingUsageEventsByTransactionId(
          usageEventsData,
          transaction
        )
      },
      { apiKey: org1ApiKeyToken }
    )
    expect(firstResult).toHaveLength(1)
    expect(firstResult[0].amount).toBe(100)
    expect(firstResult[0].transactionId).toBe(transactionId)

    // Second insert with same transaction ID should not insert duplicates
    const secondResult = await authenticatedTransaction(
      async ({ transaction }) => {
        return bulkInsertOrDoNothingUsageEventsByTransactionId(
          usageEventsData,
          transaction
        )
      },
      { apiKey: org1ApiKeyToken }
    )
    expect(secondResult).toHaveLength(0) // Should not insert any new events
  })
})
