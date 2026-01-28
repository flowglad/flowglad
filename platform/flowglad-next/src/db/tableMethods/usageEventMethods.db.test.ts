import { beforeAll, beforeEach, describe, expect, it } from 'bun:test'
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
  IntervalUnit,
  PaymentMethodType,
  PriceType,
  SubscriptionStatus,
} from '@/types'
import core from '@/utils/core'
import {
  bulkInsertOrDoNothingUsageEventsByTransactionId,
  insertUsageEvent,
  selectUsageEventsPaginated,
  selectUsageEventsTableRowData,
} from './usageEventMethods'

describe('selectUsageEventsPaginated', () => {
  // Shared setup - created once in beforeAll (immutable across tests)
  let org1Data: Awaited<ReturnType<typeof setupOrg>>
  let org1ApiKeyToken: string
  let usageMeter1: UsageMeter.Record
  let price1: Price.Record

  // Per-test setup - created fresh in beforeEach (mutable/test-specific)
  let customer1: Customer.Record
  let subscription1: Subscription.Record
  let billingPeriod1: BillingPeriod.Record
  let paymentMethod1: PaymentMethod.Record

  // beforeAll: Set up shared data that doesn't change between tests
  beforeAll(async () => {
    org1Data = (await setupOrg()).unwrap()
    const userApiKeyOrg1 = await setupUserAndApiKey({
      organizationId: org1Data.organization.id,
      livemode: true,
    })
    if (!userApiKeyOrg1.apiKey.token) {
      throw new Error('API key token not found after setup for org1')
    }
    org1ApiKeyToken = userApiKeyOrg1.apiKey.token

    usageMeter1 = await setupUsageMeter({
      organizationId: org1Data.organization.id,
      name: 'Test Usage Meter 1',
      pricingModelId: org1Data.pricingModel.id,
    })

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
  })

  // beforeEach: Create fresh customer/subscription data for test isolation
  beforeEach(async () => {
    customer1 = await setupCustomer({
      organizationId: org1Data.organization.id,
      email: `customer1+${Date.now()}@test.com`,
      pricingModelId: org1Data.pricingModel.id,
    })

    paymentMethod1 = await setupPaymentMethod({
      organizationId: org1Data.organization.id,
      customerId: customer1.id,
      type: PaymentMethodType.Card,
    })

    subscription1 = await setupSubscription({
      organizationId: org1Data.organization.id,
      customerId: customer1.id,
      paymentMethodId: paymentMethod1.id,
      priceId: price1.id,
      status: SubscriptionStatus.Active,
    })

    billingPeriod1 = await setupBillingPeriod({
      subscriptionId: subscription1.id,
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
    })
  })

  // Helper to create org2 data only when needed for cross-tenant tests
  async function setupOrg2() {
    const org2Data = (await setupOrg()).unwrap()

    const customer2 = await setupCustomer({
      organizationId: org2Data.organization.id,
      email: `customer2+${Date.now()}@test.com`,
      pricingModelId: org2Data.pricingModel.id,
    })

    const paymentMethod2 = await setupPaymentMethod({
      organizationId: org2Data.organization.id,
      customerId: customer2.id,
      type: PaymentMethodType.Card,
    })

    const usageMeter2 = await setupUsageMeter({
      organizationId: org2Data.organization.id,
      name: 'Test Usage Meter 2',
      pricingModelId: org2Data.pricingModel.id,
    })

    const price2 = await setupPrice({
      name: 'Test Price 2',
      type: PriceType.Usage,
      unitPrice: 200,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      usageMeterId: usageMeter2.id,
    })

    const subscription2 = await setupSubscription({
      organizationId: org2Data.organization.id,
      customerId: customer2.id,
      paymentMethodId: paymentMethod2.id,
      priceId: price2.id,
      status: SubscriptionStatus.Active,
    })

    const billingPeriod2 = await setupBillingPeriod({
      subscriptionId: subscription2.id,
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
    })

    return {
      org2Data,
      customer2,
      usageMeter2,
      price2,
      subscription2,
      billingPeriod2,
    }
  }

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
        transactionId: `txn_org1_${i}_${Date.now()}`,
      })
      usageEvents1.push(usageEvent)
    }

    // Create org2 and 3 usage events for it (to verify RLS isolation)
    const {
      org2Data,
      customer2,
      subscription2,
      usageMeter2,
      price2,
      billingPeriod2,
    } = await setupOrg2()

    for (let i = 0; i < 3; i++) {
      await setupUsageEvent({
        organizationId: org2Data.organization.id,
        customerId: customer2.id,
        subscriptionId: subscription2.id,
        usageMeterId: usageMeter2.id,
        priceId: price2.id,
        billingPeriodId: billingPeriod2.id,
        amount: 200 + i,
        transactionId: `txn_org2_${i}_${Date.now()}`,
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
    // Create an isolated org with no usage events to test empty results
    const isolatedOrgData = (await setupOrg()).unwrap()
    const userApiKeyIsolatedOrg = await setupUserAndApiKey({
      organizationId: isolatedOrgData.organization.id,
      livemode: true,
    })
    if (!userApiKeyIsolatedOrg.apiKey.token) {
      throw new Error('API key token not found for isolated org')
    }
    const isolatedOrgApiKeyToken = userApiKeyIsolatedOrg.apiKey.token

    // Call selectUsageEventsPaginated with isolated org API key (no events created)
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
      { apiKey: isolatedOrgApiKeyToken }
    )

    // Should return empty array
    expect(result.data).toEqual([])
    expect(result.total).toBe(0)
    expect(result.hasMore).toBe(false)
  })

  it('should respect limit parameter', async () => {
    // Create an isolated org to test limit behavior with known event count
    const isolatedOrgData = (await setupOrg()).unwrap()
    const userApiKeyIsolatedOrg = await setupUserAndApiKey({
      organizationId: isolatedOrgData.organization.id,
      livemode: true,
    })
    if (!userApiKeyIsolatedOrg.apiKey.token) {
      throw new Error('API key token not found for isolated org')
    }
    const isolatedOrgApiKeyToken = userApiKeyIsolatedOrg.apiKey.token

    const isolatedCustomer = await setupCustomer({
      organizationId: isolatedOrgData.organization.id,
      email: `customer_limit_test+${Date.now()}@test.com`,
      pricingModelId: isolatedOrgData.pricingModel.id,
    })

    const isolatedPaymentMethod = await setupPaymentMethod({
      organizationId: isolatedOrgData.organization.id,
      customerId: isolatedCustomer.id,
      type: PaymentMethodType.Card,
    })

    const isolatedUsageMeter = await setupUsageMeter({
      organizationId: isolatedOrgData.organization.id,
      name: 'Test Usage Meter Limit',
      pricingModelId: isolatedOrgData.pricingModel.id,
    })

    const isolatedPrice = await setupPrice({
      name: 'Test Price Limit',
      type: PriceType.Usage,
      unitPrice: 100,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      usageMeterId: isolatedUsageMeter.id,
    })

    const isolatedSubscription = await setupSubscription({
      organizationId: isolatedOrgData.organization.id,
      customerId: isolatedCustomer.id,
      paymentMethodId: isolatedPaymentMethod.id,
      priceId: isolatedPrice.id,
      status: SubscriptionStatus.Active,
    })

    const isolatedBillingPeriod = await setupBillingPeriod({
      subscriptionId: isolatedSubscription.id,
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
    })

    // Create 10 usage events for the isolated org
    const createdEvents = []
    for (let i = 0; i < 10; i++) {
      const event = await setupUsageEvent({
        organizationId: isolatedOrgData.organization.id,
        customerId: isolatedCustomer.id,
        subscriptionId: isolatedSubscription.id,
        usageMeterId: isolatedUsageMeter.id,
        priceId: isolatedPrice.id,
        billingPeriodId: isolatedBillingPeriod.id,
        amount: 100 + i,
        transactionId: `txn_limit_${i}_${Date.now()}`,
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
      { apiKey: isolatedOrgApiKeyToken }
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

    // Verify all returned events belong to isolated org (through customer relationship)
    result.data.forEach((event) => {
      expect(event.customerId).toBe(isolatedCustomer.id)
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
    // Create an isolated org to test invalid cursor behavior
    const isolatedOrgData = (await setupOrg()).unwrap()
    const userApiKeyIsolatedOrg = await setupUserAndApiKey({
      organizationId: isolatedOrgData.organization.id,
      livemode: true,
    })
    if (!userApiKeyIsolatedOrg.apiKey.token) {
      throw new Error('API key token not found for isolated org')
    }
    const isolatedOrgApiKeyToken = userApiKeyIsolatedOrg.apiKey.token

    const isolatedCustomer = await setupCustomer({
      organizationId: isolatedOrgData.organization.id,
      email: `customer_cursor_test+${Date.now()}@test.com`,
      pricingModelId: isolatedOrgData.pricingModel.id,
    })

    const isolatedPaymentMethod = await setupPaymentMethod({
      organizationId: isolatedOrgData.organization.id,
      customerId: isolatedCustomer.id,
      type: PaymentMethodType.Card,
    })

    const isolatedUsageMeter = await setupUsageMeter({
      organizationId: isolatedOrgData.organization.id,
      name: 'Test Usage Meter Cursor',
      pricingModelId: isolatedOrgData.pricingModel.id,
    })

    const isolatedPrice = await setupPrice({
      name: 'Test Price Cursor',
      type: PriceType.Usage,
      unitPrice: 100,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      usageMeterId: isolatedUsageMeter.id,
    })

    const isolatedSubscription = await setupSubscription({
      organizationId: isolatedOrgData.organization.id,
      customerId: isolatedCustomer.id,
      paymentMethodId: isolatedPaymentMethod.id,
      priceId: isolatedPrice.id,
      status: SubscriptionStatus.Active,
    })

    const isolatedBillingPeriod = await setupBillingPeriod({
      subscriptionId: isolatedSubscription.id,
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
    })

    // Create 3 usage events for isolated org
    const createdEvents = []
    for (let i = 0; i < 3; i++) {
      const event = await setupUsageEvent({
        organizationId: isolatedOrgData.organization.id,
        customerId: isolatedCustomer.id,
        subscriptionId: isolatedSubscription.id,
        usageMeterId: isolatedUsageMeter.id,
        priceId: isolatedPrice.id,
        billingPeriodId: isolatedBillingPeriod.id,
        amount: 100 + i,
        transactionId: `txn_invalid_cursor_${i}_${Date.now()}`,
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
      { apiKey: isolatedOrgApiKeyToken }
    )

    // Should return exactly 3 events (the ones we created in isolated org)
    expect(result.data.length).toBe(3)
    // All created events should be in the results
    const resultIds = result.data.map((event) => event.id)
    createdEvents.forEach((event) => {
      expect(resultIds).toContain(event.id)
    })
  })
})

describe('insertUsageEvent', () => {
  // Shared setup - created once in beforeAll (immutable across tests)
  let org1Data: Awaited<ReturnType<typeof setupOrg>>
  let org1ApiKeyToken: string
  let usageMeter1: UsageMeter.Record
  let price1: Price.Record

  // Per-test setup - created fresh in beforeEach (mutable/test-specific)
  let customer1: Customer.Record
  let subscription1: Subscription.Record
  let billingPeriod1: BillingPeriod.Record
  let paymentMethod1: PaymentMethod.Record

  // beforeAll: Set up shared data that doesn't change between tests
  beforeAll(async () => {
    org1Data = (await setupOrg()).unwrap()

    const userApiKeyOrg1 = await setupUserAndApiKey({
      organizationId: org1Data.organization.id,
      livemode: true,
    })
    if (!userApiKeyOrg1.apiKey.token) {
      throw new Error('API key token not found after setup for org1')
    }
    org1ApiKeyToken = userApiKeyOrg1.apiKey.token

    usageMeter1 = await setupUsageMeter({
      organizationId: org1Data.organization.id,
      name: 'Test Usage Meter 1',
      pricingModelId: org1Data.pricingModel.id,
    })

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
  })

  // beforeEach: Create fresh customer/subscription data for test isolation
  beforeEach(async () => {
    customer1 = await setupCustomer({
      organizationId: org1Data.organization.id,
      email: `customer1+${Date.now()}@test.com`,
      pricingModelId: org1Data.pricingModel.id,
    })

    paymentMethod1 = await setupPaymentMethod({
      organizationId: org1Data.organization.id,
      customerId: customer1.id,
      type: PaymentMethodType.Card,
    })

    subscription1 = await setupSubscription({
      organizationId: org1Data.organization.id,
      customerId: customer1.id,
      paymentMethodId: paymentMethod1.id,
      priceId: price1.id,
      status: SubscriptionStatus.Active,
    })

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

describe('selectUsageEventsTableRowData', () => {
  // Shared setup - created once in beforeAll (immutable across tests)
  let org1Data: Awaited<ReturnType<typeof setupOrg>>
  let org1ApiKeyToken: string
  let usageMeter1: UsageMeter.Record
  let price1: Price.Record

  // Per-test setup - created fresh in beforeEach (mutable/test-specific)
  let customer1: Customer.Record
  let subscription1: Subscription.Record
  let billingPeriod1: BillingPeriod.Record
  let paymentMethod1: PaymentMethod.Record

  // beforeAll: Set up shared data that doesn't change between tests
  beforeAll(async () => {
    org1Data = (await setupOrg()).unwrap()
    const userApiKeyOrg1 = await setupUserAndApiKey({
      organizationId: org1Data.organization.id,
      livemode: true,
    })
    if (!userApiKeyOrg1.apiKey.token) {
      throw new Error('API key token not found after setup for org1')
    }
    org1ApiKeyToken = userApiKeyOrg1.apiKey.token

    usageMeter1 = await setupUsageMeter({
      organizationId: org1Data.organization.id,
      name: 'Test Usage Meter 1',
      pricingModelId: org1Data.pricingModel.id,
    })

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
  })

  // beforeEach: Create fresh customer/subscription data for test isolation
  beforeEach(async () => {
    customer1 = await setupCustomer({
      organizationId: org1Data.organization.id,
      email: `customer1+${Date.now()}@test.com`,
      pricingModelId: org1Data.pricingModel.id,
    })

    paymentMethod1 = await setupPaymentMethod({
      organizationId: org1Data.organization.id,
      customerId: customer1.id,
      type: PaymentMethodType.Card,
    })

    subscription1 = await setupSubscription({
      organizationId: org1Data.organization.id,
      customerId: customer1.id,
      paymentMethodId: paymentMethod1.id,
      priceId: price1.id,
      status: SubscriptionStatus.Active,
    })

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
  // Shared setup - created once in beforeAll (immutable across tests)
  let org1Data: Awaited<ReturnType<typeof setupOrg>>
  let org1ApiKeyToken: string
  let usageMeter1: UsageMeter.Record
  let usageMeter2: UsageMeter.Record
  let price1: Price.Record

  // Per-test setup - created fresh in beforeEach (mutable/test-specific)
  let customer1: Customer.Record
  let subscription1: Subscription.Record
  let billingPeriod1: BillingPeriod.Record
  let paymentMethod1: PaymentMethod.Record

  // beforeAll: Set up shared data that doesn't change between tests
  beforeAll(async () => {
    org1Data = (await setupOrg()).unwrap()

    const userApiKeyOrg1 = await setupUserAndApiKey({
      organizationId: org1Data.organization.id,
      livemode: true,
    })
    if (!userApiKeyOrg1.apiKey.token) {
      throw new Error('API key token not found after setup for org1')
    }
    org1ApiKeyToken = userApiKeyOrg1.apiKey.token

    usageMeter1 = await setupUsageMeter({
      organizationId: org1Data.organization.id,
      name: 'Test Usage Meter 1',
      pricingModelId: org1Data.pricingModel.id,
    })

    usageMeter2 = await setupUsageMeter({
      organizationId: org1Data.organization.id,
      name: 'Test Usage Meter 2',
      pricingModelId: org1Data.pricingModel.id,
    })

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
  })

  // beforeEach: Create fresh customer/subscription data for test isolation
  beforeEach(async () => {
    customer1 = await setupCustomer({
      organizationId: org1Data.organization.id,
      email: `customer1+${Date.now()}@test.com`,
      pricingModelId: org1Data.pricingModel.id,
    })

    paymentMethod1 = await setupPaymentMethod({
      organizationId: org1Data.organization.id,
      customerId: customer1.id,
      type: PaymentMethodType.Card,
    })

    subscription1 = await setupSubscription({
      organizationId: org1Data.organization.id,
      customerId: customer1.id,
      paymentMethodId: paymentMethod1.id,
      priceId: price1.id,
      status: SubscriptionStatus.Active,
    })

    billingPeriod1 = await setupBillingPeriod({
      subscriptionId: subscription1.id,
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
    })
  })

  it('should insert new usage events when they do not exist', async () => {
    const transactionId = `test_txn_${Date.now()}`
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
    const transactionId = `test_txn_duplicate_${Date.now()}`
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
