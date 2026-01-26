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
import type { UsageMeter } from '@/db/schema/usageMeters'
import {
  IntervalUnit,
  PaymentMethodType,
  PriceType,
  SubscriptionStatus,
} from '@/types'
import core from '@/utils/core'
import {
  insertUsageEvent,
  selectUsageEventsPaginated,
  selectUsageEventsTableRowData,
} from './usageEventMethods'

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
      pricingModelId: org1Data.pricingModel.id,
    })
    usageMeter2 = await setupUsageMeter({
      organizationId: org2Data.organization.id,
      name: 'Test Usage Meter 2',
      pricingModelId: org2Data.pricingModel.id,
    })

    // Setup prices
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
    price2 = await setupPrice({
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
    expect(typeof result.nextCursor).toBe('string')

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
    // Create 7 usage events for organization 1 with deterministic, unique timestamps
    // (enough for two pages of 3 and to keep `hasNextPage` true on the second page)
    const createdEvents = []
    const baseUsageDateMs = 1_700_000_000_000
    for (let i = 0; i < 7; i++) {
      const event = await setupUsageEvent({
        organizationId: org1Data.organization.id,
        customerId: customer1.id,
        subscriptionId: subscription1.id,
        usageMeterId: usageMeter1.id,
        priceId: price1.id,
        billingPeriodId: billingPeriod1.id,
        amount: 100 + i,
        transactionId: `txn_cursor_${i}`,
        usageDate: baseUsageDateMs + i, // deterministic ordering without sleeping
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
    expect(typeof firstResult.endCursor).toBe('string')

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
  }, 15_000)

  it('should handle invalid cursor gracefully by treating it as no cursor (returning first page)', async () => {
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

    // Call selectUsageEventsPaginated with invalid cursor - should treat as no cursor and return first page
    const result = await authenticatedTransaction(
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

    // Should return results (treating invalid cursor as "no cursor" = first page)
    expect(result.data.length).toBeGreaterThanOrEqual(3)
    // All created events should be in the results
    const resultIds = result.data.map((event) => event.id)
    createdEvents.forEach((event) => {
      expect(resultIds).toContain(event.id)
    })
  })
})

describe('insertUsageEvent', () => {
  let org1Data: Awaited<ReturnType<typeof setupOrg>>
  let org1ApiKeyToken: string
  let customer1: Customer.Record
  let subscription1: Subscription.Record
  let usageMeter1: UsageMeter.Record
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

  it('should successfully insert usage event and derive pricingModelId from usage meter', async () => {
    await authenticatedTransaction(
      async ({ transaction }) => {
        const usageEvent = await insertUsageEvent(
          {
            customerId: customer1.id,
            subscriptionId: subscription1.id,
            usageMeterId: usageMeter1.id,
            priceId: price1.id,
            billingPeriodId: billingPeriod1.id,
            amount: 100,
            transactionId: `txn_${core.nanoid()}`,
            usageDate: Date.now(),
            livemode: true,
            properties: {},
          },
          transaction
        )

        // Verify pricingModelId is correctly derived from usage meter
        expect(usageEvent.pricingModelId).toBe(
          usageMeter1.pricingModelId
        )
        expect(usageEvent.pricingModelId).toBe(
          org1Data.pricingModel.id
        )
      },
      { apiKey: org1ApiKeyToken }
    )
  })

  it('should use provided pricingModelId without derivation', async () => {
    await authenticatedTransaction(
      async ({ transaction }) => {
        const usageEvent = await insertUsageEvent(
          {
            customerId: customer1.id,
            subscriptionId: subscription1.id,
            usageMeterId: usageMeter1.id,
            priceId: price1.id,
            billingPeriodId: billingPeriod1.id,
            amount: 100,
            transactionId: `txn_${core.nanoid()}`,
            usageDate: Date.now(),
            livemode: true,
            properties: {},
            pricingModelId: org1Data.pricingModel.id, // Pre-provided
          },
          transaction
        )

        // Verify the provided pricingModelId is used
        expect(usageEvent.pricingModelId).toBe(
          org1Data.pricingModel.id
        )
      },
      { apiKey: org1ApiKeyToken }
    )
  })

  it('should throw an error when usageMeterId does not exist', async () => {
    await authenticatedTransaction(
      async ({ transaction }) => {
        const nonExistentUsageMeterId = `um_${core.nanoid()}`

        await expect(
          insertUsageEvent(
            {
              customerId: customer1.id,
              subscriptionId: subscription1.id,
              usageMeterId: nonExistentUsageMeterId,
              priceId: price1.id,
              billingPeriodId: billingPeriod1.id,
              amount: 100,
              transactionId: `txn_${core.nanoid()}`,
              usageDate: Date.now(),
              livemode: true,
              properties: {},
            },
            transaction
          )
        ).rejects.toThrow()
      },
      { apiKey: org1ApiKeyToken }
    )
  })
})
