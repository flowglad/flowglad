import { describe, it, expect, beforeEach } from 'vitest'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import {
  selectUsageEventsPaginated,
  selectUsageEventsTableRowData,
  bulkInsertOrDoNothingUsageEventsByTransactionId,
  insertUsageEvent,
} from './usageEventMethods'
import { eq } from 'drizzle-orm'
import db from '@/db/client'
import { usageEvents } from '@/db/schema/usageEvents'
import {
  setupOrg,
  setupCustomer,
  setupSubscription,
  setupUsageMeter,
  setupUsageEvent,
  setupPrice,
  setupBillingPeriod,
  setupUserAndApiKey,
  setupPaymentMethod,
} from '@/../seedDatabase'
import { Organization } from '@/db/schema/organizations'
import { Customer } from '@/db/schema/customers'
import { Subscription } from '@/db/schema/subscriptions'
import { UsageMeter } from '@/db/schema/usageMeters'
import { UsageEvent } from '@/db/schema/usageEvents'
import { Price } from '@/db/schema/prices'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import {
  PaymentMethodType,
  SubscriptionStatus,
  PriceType,
  IntervalUnit,
} from '@/types'
import core from '@/utils/core'

describe('selectUsageEventsPaginated', () => {
  let org1Data: Awaited<ReturnType<typeof setupOrg>>
  let org1ApiKeyToken: string
  let org2Data: Awaited<ReturnType<typeof setupOrg>>
  let customer1: Customer.Record
  let customer2: Customer.Record
  let subscription1: Subscription.Record
  let subscription2: Subscription.Record
  let usageMeter1: UsageMeter.Record
  let usageMeter2: UsageMeter.Record
  let price1: Price.Record
  let price2: Price.Record
  let billingPeriod1: BillingPeriod.Record
  let billingPeriod2: BillingPeriod.Record
  let paymentMethod1: PaymentMethod.Record
  let paymentMethod2: PaymentMethod.Record

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

    // Setup organization 2 (no API key)
    org2Data = await setupOrg()

    // Setup customers for both organizations
    customer1 = await setupCustomer({
      organizationId: org1Data.organization.id,
      email: `customer1+${Date.now()}@test.com`,
    })
    customer2 = await setupCustomer({
      organizationId: org2Data.organization.id,
      email: `customer2+${Date.now()}@test.com`,
    })

    // Setup payment methods
    paymentMethod1 = await setupPaymentMethod({
      organizationId: org1Data.organization.id,
      customerId: customer1.id,
      type: PaymentMethodType.Card,
    })
    paymentMethod2 = await setupPaymentMethod({
      organizationId: org2Data.organization.id,
      customerId: customer2.id,
      type: PaymentMethodType.Card,
    })

    // Setup usage meters
    usageMeter1 = await setupUsageMeter({
      organizationId: org1Data.organization.id,
      name: 'Test Usage Meter 1',
      pricingModelId: org2Data.pricingModel.id,
    })
    usageMeter2 = await setupUsageMeter({
      organizationId: org2Data.organization.id,
      name: 'Test Usage Meter 2',
      pricingModelId: org2Data.pricingModel.id,
    })

    // Setup prices
    price1 = await setupPrice({
      productId: org1Data.product.id,
      name: 'Test Price 1',
      type: PriceType.Usage,
      unitPrice: 100,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      usageMeterId: usageMeter1.id,
    })
    price2 = await setupPrice({
      productId: org2Data.product.id,
      name: 'Test Price 2',
      type: PriceType.Usage,
      unitPrice: 200,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      usageMeterId: usageMeter2.id,
    })

    // Setup subscriptions
    subscription1 = await setupSubscription({
      organizationId: org1Data.organization.id,
      customerId: customer1.id,
      paymentMethodId: paymentMethod1.id,
      priceId: price1.id,
      status: SubscriptionStatus.Active,
    })
    subscription2 = await setupSubscription({
      organizationId: org2Data.organization.id,
      customerId: customer2.id,
      paymentMethodId: paymentMethod2.id,
      priceId: price2.id,
      status: SubscriptionStatus.Active,
    })

    // Setup billing periods
    billingPeriod1 = await setupBillingPeriod({
      subscriptionId: subscription1.id,
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
    })
    billingPeriod2 = await setupBillingPeriod({
      subscriptionId: subscription2.id,
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
    })
  })

  it('should return paginated usage events for organization 1 only', async () => {
    // Create 5 usage events for organization 1
    const usageEvents1 = []
    for (let i = 0; i < 5; i++) {
      const usageEvent = await setupUsageEvent({
        organizationId: org1Data.organization.id,
        customerId: customer1.id,
        subscriptionId: subscription1.id,
        usageMeterId: usageMeter1.id,
        priceId: price1.id,
        billingPeriodId: billingPeriod1.id,
        amount: 100 + i,
        transactionId: `txn_org1_${i}`,
      })
      usageEvents1.push(usageEvent)
    }

    // Create 3 usage events for organization 2
    for (let i = 0; i < 3; i++) {
      await setupUsageEvent({
        organizationId: org2Data.organization.id,
        customerId: customer2.id,
        subscriptionId: subscription2.id,
        usageMeterId: usageMeter2.id,
        priceId: price2.id,
        billingPeriodId: billingPeriod2.id,
        amount: 200 + i,
        transactionId: `txn_org2_${i}`,
      })
    }

    // Call selectUsageEventsPaginated with org1 API key
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectUsageEventsPaginated(
          {
            cursor: undefined,
            limit: 10,
          },
          transaction
        )
      },
      { apiKey: org1ApiKeyToken }
    )

    // Should return only the 5 usage events from organization 1
    expect(result.total).toBe(5)
    expect(result.hasMore).toBe(false)

    // Should respect RLS policies - verify exact events by ID
    const org1EventIds = result.data.map((event) => event.id)
    const expectedEventIds = usageEvents1.map((event) => event.id)
    expect(org1EventIds.sort()).toEqual(expectedEventIds.sort())

    // Verify all returned events belong to org1 (through customer relationship)
    result.data.forEach((event) => {
      expect(event.customerId).toBe(customer1.id)
    })
  })

  it('should handle empty results when no usage events exist', async () => {
    // Create no usage events for organization 1
    // Call selectUsageEventsPaginated with org1 API key
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectUsageEventsPaginated(
          {
            cursor: undefined,
            limit: 10,
          },
          transaction
        )
      },
      { apiKey: org1ApiKeyToken }
    )

    // Should return empty array
    expect(result.data).toEqual([])
    expect(result.total).toBe(0)
    expect(result.hasMore).toBe(false)
  })

  it('should respect limit parameter', async () => {
    // Create 10 usage events for organization 1
    const createdEvents = []
    for (let i = 0; i < 10; i++) {
      const event = await setupUsageEvent({
        organizationId: org1Data.organization.id,
        customerId: customer1.id,
        subscriptionId: subscription1.id,
        usageMeterId: usageMeter1.id,
        priceId: price1.id,
        billingPeriodId: billingPeriod1.id,
        amount: 100 + i,
        transactionId: `txn_limit_${i}`,
      })
      createdEvents.push(event)
    }

    // Call selectUsageEventsPaginated with limit of 3
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectUsageEventsPaginated(
          {
            cursor: undefined,
            limit: 3,
          },
          transaction
        )
      },
      { apiKey: org1ApiKeyToken }
    )

    // Should return exactly 3 usage events (limited by parameter)
    expect(result.total).toBe(10)
    expect(result.hasMore).toBe(true)
    expect(result.nextCursor).toBeDefined()

    // Verify returned events are from our created events
    const returnedEventIds = result.data.map((event) => event.id)
    const createdEventIds = createdEvents.map((event) => event.id)
    expect(returnedEventIds).toHaveLength(3)
    returnedEventIds.forEach((eventId) => {
      expect(createdEventIds).toContain(eventId)
    })

    // Verify all returned events belong to org1 (through customer relationship)
    result.data.forEach((event) => {
      expect(event.customerId).toBe(customer1.id)
    })
  })

  it('should handle cursor-based pagination correctly', async () => {
    // Create 10 usage events for organization 1 with staggered timestamps
    const createdEvents = []
    for (let i = 0; i < 10; i++) {
      // Add a small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10))
      const event = await setupUsageEvent({
        organizationId: org1Data.organization.id,
        customerId: customer1.id,
        subscriptionId: subscription1.id,
        usageMeterId: usageMeter1.id,
        priceId: price1.id,
        billingPeriodId: billingPeriod1.id,
        amount: 100 + i,
        transactionId: `txn_cursor_${i}`,
        usageDate: Date.now() + i * 1000, // Stagger timestamps
      })
      createdEvents.push(event)
    }

    // First call with pageSize of 3
    const firstResult = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectUsageEventsTableRowData({
          input: {
            pageSize: 3,
          },
          transaction,
        })
      },
      { apiKey: org1ApiKeyToken }
    )

    // Second call using pageAfter from first result
    const secondResult = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectUsageEventsTableRowData({
          input: {
            pageAfter: firstResult.endCursor ?? undefined,
            pageSize: 3,
          },
          transaction,
        })
      },
      { apiKey: org1ApiKeyToken }
    )

    // First call should return first 3 events
    expect(firstResult.hasNextPage).toBe(true)
    expect(firstResult.endCursor).toBeDefined()

    // Second call should return next 3 events
    expect(secondResult.hasNextPage).toBe(true)

    // Should not return duplicate events
    const firstEventIds = firstResult.items.map(
      (event) => event.usageEvent.id
    )
    const secondEventIds = secondResult.items.map(
      (event) => event.usageEvent.id
    )
    expect(firstEventIds).toHaveLength(3)
    expect(secondEventIds).toHaveLength(3)

    // Verify no duplicate events between pages
    const overlap = firstEventIds.filter((id) =>
      secondEventIds.includes(id)
    )
    expect(overlap).toEqual([])

    // All events should belong to org1 (RLS should filter out org2 events)
    const allEvents = [...firstResult.items, ...secondResult.items]
    allEvents.forEach((event) => {
      expect(event.usageEvent.customerId).toBe(customer1.id)
    })

    // Verify the events are from our created events
    const createdEventIds = createdEvents.map((event) => event.id)
    const allReturnedEventIds = [...firstEventIds, ...secondEventIds]
    allReturnedEventIds.forEach((eventId) => {
      expect(createdEventIds).toContain(eventId)
    })
  })

  it('should handle invalid cursor gracefully', async () => {
    // Create some usage events first
    const createdEvents = []
    for (let i = 0; i < 3; i++) {
      const event = await setupUsageEvent({
        organizationId: org1Data.organization.id,
        customerId: customer1.id,
        subscriptionId: subscription1.id,
        usageMeterId: usageMeter1.id,
        priceId: price1.id,
        billingPeriodId: billingPeriod1.id,
        amount: 100 + i,
        transactionId: `txn_invalid_cursor_${i}`,
      })
      createdEvents.push(event)
    }

    // Call selectUsageEventsPaginated with invalid cursor
    await expect(
      authenticatedTransaction(
        async ({ transaction }) => {
          return selectUsageEventsPaginated(
            {
              cursor: 'eyJpbnZhbGlkIjogInZhbHVlIn0=', // base64 encoded '{"invalid": "value"}'
              limit: 10,
            },
            transaction
          )
        },
        { apiKey: org1ApiKeyToken }
      )
    ).rejects.toThrow()
  })
})

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
      productId: org1Data.product.id,
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

  it('should return enriched data with all related records', async () => {
    // Create 3 usage events for organization 1
    const createdEvents = []
    for (let i = 0; i < 3; i++) {
      const event = await setupUsageEvent({
        organizationId: org1Data.organization.id,
        customerId: customer1.id,
        subscriptionId: subscription1.id,
        usageMeterId: usageMeter1.id,
        priceId: price1.id,
        billingPeriodId: billingPeriod1.id,
        amount: 100 + i,
        transactionId: `txn_enriched_${i}`,
      })
      createdEvents.push(event)
    }

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

    // Should return 3 enriched usage events - verify by specific IDs
    expect(result.total).toBe(3)
    expect(result.hasNextPage).toBe(false)

    const returnedEventIds = result.items.map(
      (item) => item.usageEvent.id
    )
    const expectedEventIds = createdEvents.map((event) => event.id)
    expect(returnedEventIds.sort()).toEqual(expectedEventIds.sort())

    // Each event should have customer, subscription, usageMeter, price data
    result.items.forEach((enrichedEvent) => {
      expect(enrichedEvent.usageEvent).toBeDefined()
      expect(enrichedEvent.customer).toBeDefined()
      expect(enrichedEvent.subscription).toBeDefined()
      expect(enrichedEvent.usageMeter).toBeDefined()
      expect(enrichedEvent.price).toBeDefined()

      // Verify the data matches our setup
      expect(enrichedEvent.customer.id).toBe(customer1.id)
      expect(enrichedEvent.subscription.id).toBe(subscription1.id)
      expect(enrichedEvent.usageMeter.id).toBe(usageMeter1.id)
      expect(enrichedEvent.price.id).toBe(price1.id)
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
      productId: org1Data.product.id,
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
    expect(result[0].amount).toBe(100)
    expect(result[1].amount).toBe(200)
    expect(result[0].transactionId).toBe(transactionId)
    expect(result[1].transactionId).toBe(transactionId)
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

describe('RLS Policies for usage_events table', () => {
  let org1Data: Awaited<ReturnType<typeof setupOrg>>
  let org1ApiKeyToken: string
  let org2Data: Awaited<ReturnType<typeof setupOrg>>
  let org2ApiKeyToken: string
  let customer1: Customer.Record
  let customer2: Customer.Record
  let subscription1: Subscription.Record
  let subscription2: Subscription.Record
  let usageMeter1: UsageMeter.Record
  let usageMeter2: UsageMeter.Record
  let price1: Price.Record
  let price2: Price.Record
  let billingPeriod1: BillingPeriod.Record
  let billingPeriod2: BillingPeriod.Record
  let paymentMethod1: PaymentMethod.Record
  let paymentMethod2: PaymentMethod.Record

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

    // Setup organization 2 with API key
    org2Data = await setupOrg()
    const userApiKeyOrg2 = await setupUserAndApiKey({
      organizationId: org2Data.organization.id,
      livemode: true,
    })
    if (!userApiKeyOrg2.apiKey.token) {
      throw new Error('API key token not found after setup for org2')
    }
    org2ApiKeyToken = userApiKeyOrg2.apiKey.token

    // Setup customers for both organizations
    customer1 = await setupCustomer({
      organizationId: org1Data.organization.id,
      email: `customer1+${Date.now()}@test.com`,
    })
    customer2 = await setupCustomer({
      organizationId: org2Data.organization.id,
      email: `customer2+${Date.now()}@test.com`,
    })

    // Setup payment methods
    paymentMethod1 = await setupPaymentMethod({
      organizationId: org1Data.organization.id,
      customerId: customer1.id,
      type: PaymentMethodType.Card,
    })
    paymentMethod2 = await setupPaymentMethod({
      organizationId: org2Data.organization.id,
      customerId: customer2.id,
      type: PaymentMethodType.Card,
    })

    // Setup usage meters
    usageMeter1 = await setupUsageMeter({
      organizationId: org1Data.organization.id,
      name: 'Test Usage Meter 1',
      pricingModelId: org2Data.pricingModel.id,
    })
    usageMeter2 = await setupUsageMeter({
      organizationId: org2Data.organization.id,
      name: 'Test Usage Meter 2',
      pricingModelId: org2Data.pricingModel.id,
    })

    // Setup prices
    price1 = await setupPrice({
      productId: org1Data.product.id,
      name: 'Test Price 1',
      type: PriceType.Usage,
      unitPrice: 100,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      usageMeterId: usageMeter1.id,
    })
    price2 = await setupPrice({
      productId: org2Data.product.id,
      name: 'Test Price 2',
      type: PriceType.Usage,
      unitPrice: 200,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      usageMeterId: usageMeter2.id,
    })

    // Setup subscriptions
    subscription1 = await setupSubscription({
      organizationId: org1Data.organization.id,
      customerId: customer1.id,
      paymentMethodId: paymentMethod1.id,
      priceId: price1.id,
      status: SubscriptionStatus.Active,
    })
    subscription2 = await setupSubscription({
      organizationId: org2Data.organization.id,
      customerId: customer2.id,
      paymentMethodId: paymentMethod2.id,
      priceId: price2.id,
      status: SubscriptionStatus.Active,
    })

    // Setup billing periods
    billingPeriod1 = await setupBillingPeriod({
      subscriptionId: subscription1.id,
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
    })
    billingPeriod2 = await setupBillingPeriod({
      subscriptionId: subscription2.id,
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
    })
  })

  it('should allow organization 1 to read their own usage events', async () => {
    // Create usage event for organization 1
    const usageEvent = await setupUsageEvent({
      organizationId: org1Data.organization.id,
      customerId: customer1.id,
      subscriptionId: subscription1.id,
      usageMeterId: usageMeter1.id,
      priceId: price1.id,
      billingPeriodId: billingPeriod1.id,
      amount: 100,
      transactionId: 'txn_org1_rls_test',
    })

    // Query using org1 API key should return the event
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectUsageEventsPaginated(
          {
            cursor: undefined,
            limit: 10,
          },
          transaction
        )
      },
      { apiKey: org1ApiKeyToken }
    )

    expect(result.data).toHaveLength(1)
    expect(result.data[0].id).toBe(usageEvent.id)
  })

  it('should prevent organization 1 from reading organization 2 usage events', async () => {
    // Create usage event for organization 2
    await setupUsageEvent({
      organizationId: org2Data.organization.id,
      customerId: customer2.id,
      subscriptionId: subscription2.id,
      usageMeterId: usageMeter2.id,
      priceId: price2.id,
      billingPeriodId: billingPeriod2.id,
      amount: 200,
      transactionId: 'txn_org2_rls_test',
    })

    // Query using org1 API key should return empty results
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectUsageEventsPaginated(
          {
            cursor: undefined,
            limit: 10,
          },
          transaction
        )
      },
      { apiKey: org1ApiKeyToken }
    )

    expect(result.data).toHaveLength(0)
    expect(result.total).toBe(0)
  })

  it('should allow organization 2 to read their own usage events', async () => {
    // Create usage event for organization 2
    const usageEvent = await setupUsageEvent({
      organizationId: org2Data.organization.id,
      customerId: customer2.id,
      subscriptionId: subscription2.id,
      usageMeterId: usageMeter2.id,
      priceId: price2.id,
      billingPeriodId: billingPeriod2.id,
      amount: 200,
      transactionId: 'txn_org2_rls_test',
    })

    // Query using org2 API key should return the event
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectUsageEventsPaginated(
          {
            cursor: undefined,
            limit: 10,
          },
          transaction
        )
      },
      { apiKey: org2ApiKeyToken }
    )

    expect(result.data).toHaveLength(1)
    expect(result.data[0].id).toBe(usageEvent.id)
  })
})
