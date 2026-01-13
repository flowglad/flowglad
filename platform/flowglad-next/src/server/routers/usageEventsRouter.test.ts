import { beforeEach, describe, expect, it } from 'vitest'
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
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { Subscription } from '@/db/schema/subscriptions'
import { UsageEvent } from '@/db/schema/usageEvents'
import type { UsageMeter } from '@/db/schema/usageMeters'
import { updatePrice } from '@/db/tableMethods/priceMethods'
import { updateUsageMeter } from '@/db/tableMethods/usageMeterMethods'
import type { TRPCApiContext } from '@/server/trpcContext'
import {
  IntervalUnit,
  PaymentMethodType,
  PriceType,
  SubscriptionStatus,
} from '@/types'
import { usageEventsRouter } from './usageEventsRouter'

const createCaller = (
  organization: Organization.Record,
  apiKeyToken: string,
  livemode: boolean = true
) => {
  return usageEventsRouter.createCaller({
    organizationId: organization.id,
    organization,
    apiKey: apiKeyToken,
    livemode,
    environment: livemode ? ('live' as const) : ('test' as const),
    isApi: true,
    path: '',
    user: null,
    session: null,
  } as TRPCApiContext)
}

describe('usageEventsRouter', () => {
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
      pricingModelId: org1Data.pricingModel.id,
    })
    customer2 = await setupCustomer({
      organizationId: org2Data.organization.id,
      email: `customer2+${Date.now()}@test.com`,
      pricingModelId: org2Data.pricingModel.id,
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

  describe('list procedure', () => {
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

      // Call list procedure with org1 API key
      const caller = createCaller(
        org1Data.organization,
        org1ApiKeyToken
      )

      const result = await caller.list({
        cursor: undefined,
        limit: 10,
      })

      // Should return only the 5 usage events from organization 1
      expect(result.total).toBe(5)
      expect(result.hasMore).toBe(false)

      // Should respect RLS policies - verify exact events by ID
      const org1EventIds = result.items.map((event) => event.id)
      const expectedEventIds = usageEvents1.map((event) => event.id)
      expect(org1EventIds.sort()).toEqual(expectedEventIds.sort())

      // Verify all returned events belong to org1 (through customer relationship)
      result.items.forEach((event) => {
        expect(event.customerId).toBe(customer1.id)
      })
    })

    it('should handle empty results when no usage events exist', async () => {
      // Create no usage events for organization 1
      const caller = createCaller(
        org1Data.organization,
        org1ApiKeyToken
      )

      const result = await caller.list({
        cursor: undefined,
        limit: 10,
      })

      // Should return empty array
      expect(result.items).toEqual([])
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

      const caller = createCaller(
        org1Data.organization,
        org1ApiKeyToken
      )

      const result = await caller.list({
        cursor: undefined,
        limit: 3,
      })

      // Should return exactly 3 usage events (limited by parameter)
      expect(result.total).toBe(10)
      expect(result.hasMore).toBe(true)
      expect(typeof result.nextCursor).toBe('string')

      // Verify returned events are from our created events
      const returnedEventIds = result.items.map((event) => event.id)
      const createdEventIds = createdEvents.map((event) => event.id)
      expect(returnedEventIds).toHaveLength(3)
      returnedEventIds.forEach((eventId) => {
        expect(createdEventIds).toContain(eventId)
      })

      // Verify all returned events belong to org1 (through customer relationship)
      result.items.forEach((event) => {
        expect(event.customerId).toBe(customer1.id)
      })
    })
  })

  describe('getTableRows procedure', () => {
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

      const caller = createCaller(
        org1Data.organization,
        org1ApiKeyToken
      )

      const result = await caller.getTableRows({
        pageSize: 10,
      })

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
        expect(typeof enrichedEvent.usageEvent).toBe('object')
        expect(typeof enrichedEvent.customer).toBe('object')
        expect(typeof enrichedEvent.subscription).toBe('object')
        expect(typeof enrichedEvent.usageMeter).toBe('object')
        expect(typeof enrichedEvent.price).toBe('object')

        // Verify the data matches our setup
        expect(enrichedEvent.customer.id).toBe(customer1.id)
        expect(enrichedEvent.subscription.id).toBe(subscription1.id)
        expect(enrichedEvent.usageMeter.id).toBe(usageMeter1.id)
        expect(enrichedEvent.price?.id).toBe(price1.id)
      })
    })

    it('should handle empty results when no usage events exist', async () => {
      const caller = createCaller(
        org1Data.organization,
        org1ApiKeyToken
      )

      const result = await caller.getTableRows({
        pageSize: 10,
      })

      // Should return empty array
      expect(result.items).toEqual([])
      expect(result.total).toBe(0)
      expect(result.hasNextPage).toBe(false)
    })

    it('should respect cursor pagination', async () => {
      // Create 10 usage events for organization 1
      for (let i = 0; i < 10; i++) {
        await setupUsageEvent({
          organizationId: org1Data.organization.id,
          customerId: customer1.id,
          subscriptionId: subscription1.id,
          usageMeterId: usageMeter1.id,
          priceId: price1.id,
          billingPeriodId: billingPeriod1.id,
          amount: 100 + i,
          transactionId: `txn_cursor_${i}`,
        })
      }

      const caller = createCaller(
        org1Data.organization,
        org1ApiKeyToken
      )

      // First call with pageSize of 3
      const firstResult = await caller.getTableRows({
        pageSize: 3,
      })

      // Second call using pageAfter from first result
      const secondResult = await caller.getTableRows({
        pageAfter: firstResult.endCursor ?? undefined,
        pageSize: 3,
      })

      // First call should return first 3 events
      expect(firstResult.hasNextPage).toBe(true)
      expect(typeof firstResult.endCursor).toBe('string')
      expect(firstResult.endCursor!.length).toBeGreaterThan(0)

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
    })
  })

  describe('create procedure with price slug support', () => {
    it('should create usage event with priceId', async () => {
      const caller = createCaller(
        org1Data.organization,
        org1ApiKeyToken
      )

      // Test create procedure
      const result = await caller.create({
        usageEvent: {
          subscriptionId: subscription1.id,
          priceId: price1.id,
          amount: 150,
          transactionId: `txn_create_with_priceId_${Date.now()}`,
        },
      })

      expect(result.usageEvent).toMatchObject({})
      expect(result.usageEvent.priceId).toBe(price1.id)
      expect(result.usageEvent.amount).toBe(150)
      expect(result.usageEvent.subscriptionId).toBe(subscription1.id)

      // Test bulkInsert procedure
      const bulkResult = await caller.bulkInsert({
        usageEvents: [
          {
            subscriptionId: subscription1.id,
            priceId: price1.id,
            amount: 100,
            transactionId: `txn_bulk_priceId_1_${Date.now()}`,
          },
          {
            subscriptionId: subscription1.id,
            priceId: price1.id,
            amount: 200,
            transactionId: `txn_bulk_priceId_2_${Date.now()}`,
          },
        ],
      })

      expect(bulkResult.usageEvents).toHaveLength(2)
      expect(bulkResult.usageEvents[0].priceId).toBe(price1.id)
      expect(bulkResult.usageEvents[0].amount).toBe(100)
      expect(bulkResult.usageEvents[1].amount).toBe(200)
    }, 60000)

    it('should create usage event with priceSlug', async () => {
      // First, update price1 to have a slug
      await authenticatedTransaction(
        async ({ transaction }) => {
          await updatePrice(
            {
              id: price1.id,
              slug: 'test-price-slug',
              type: price1.type,
            },
            transaction
          )
        },
        { apiKey: org1ApiKeyToken }
      )

      const caller = createCaller(
        org1Data.organization,
        org1ApiKeyToken
      )

      // Test create procedure
      const result = await caller.create({
        usageEvent: {
          subscriptionId: subscription1.id,
          priceSlug: 'test-price-slug',
          amount: 200,
          transactionId: `txn_create_with_priceSlug_${Date.now()}`,
        },
      })

      expect(result.usageEvent).toMatchObject({})
      expect(result.usageEvent.priceId).toBe(price1.id)
      expect(result.usageEvent.amount).toBe(200)
      expect(result.usageEvent.subscriptionId).toBe(subscription1.id)

      // Test bulkInsert procedure
      const bulkResult = await caller.bulkInsert({
        usageEvents: [
          {
            subscriptionId: subscription1.id,
            priceSlug: 'test-price-slug',
            amount: 150,
            transactionId: `txn_bulk_priceSlug_1_${Date.now()}`,
          },
          {
            subscriptionId: subscription1.id,
            priceSlug: 'test-price-slug',
            amount: 250,
            transactionId: `txn_bulk_priceSlug_2_${Date.now()}`,
          },
        ],
      })

      expect(bulkResult.usageEvents).toHaveLength(2)
      expect(bulkResult.usageEvents[0].priceId).toBe(price1.id)
      expect(bulkResult.usageEvents[0].amount).toBe(150)
      expect(bulkResult.usageEvents[1].priceId).toBe(price1.id)
      expect(bulkResult.usageEvents[1].amount).toBe(250)
    }, 60000)

    it('should throw error when invalid priceSlug is provided', async () => {
      const caller = createCaller(
        org1Data.organization,
        org1ApiKeyToken
      )

      // Test create procedure
      await expect(
        caller.create({
          usageEvent: {
            subscriptionId: subscription1.id,
            priceSlug: 'invalid-slug-does-not-exist',
            amount: 250,
            transactionId: `txn_invalid_slug_${Date.now()}`,
          },
        })
      ).rejects.toThrow(
        "Price with slug invalid-slug-does-not-exist not found for this customer's pricing model"
      )

      // Test bulkInsert procedure
      await expect(
        caller.bulkInsert({
          usageEvents: [
            {
              subscriptionId: subscription1.id,
              priceId: price1.id,
              amount: 100,
              transactionId: `txn_bulk_invalid_1_${Date.now()}`,
            },
            {
              subscriptionId: subscription1.id,
              priceSlug: 'invalid-slug-bulk',
              amount: 200,
              transactionId: `txn_bulk_invalid_2_${Date.now()}`,
            },
          ],
        })
      ).rejects.toThrow(
        "Price with slug invalid-slug-bulk not found for customer's pricing model"
      )
    })

    it('should throw error when both priceId and priceSlug are provided', async () => {
      const caller = createCaller(
        org1Data.organization,
        org1ApiKeyToken
      )

      // Test create procedure
      await expect(
        caller.create({
          usageEvent: {
            subscriptionId: subscription1.id,
            priceId: price1.id,
            priceSlug: 'test-price-slug',
            amount: 300,
            transactionId: `txn_both_provided_${Date.now()}`,
          },
        })
      ).rejects.toThrow(
        'Exactly one of priceId, priceSlug, usageMeterId, or usageMeterSlug must be provided'
      )

      // Test bulkInsert procedure
      await expect(
        caller.bulkInsert({
          usageEvents: [
            {
              subscriptionId: subscription1.id,
              priceId: price1.id,
              priceSlug: 'test-slug',
              amount: 100,
              transactionId: `txn_bulk_both_${Date.now()}`,
            },
          ],
        })
      ).rejects.toThrow(
        'Exactly one of priceId, priceSlug, usageMeterId, or usageMeterSlug must be provided'
      )
    })

    it('should throw error when neither priceId nor priceSlug is provided', async () => {
      const caller = createCaller(
        org1Data.organization,
        org1ApiKeyToken
      )

      // Test create procedure
      await expect(
        caller.create({
          usageEvent: {
            subscriptionId: subscription1.id,
            amount: 350,
            transactionId: `txn_neither_provided_${Date.now()}`,
          },
        })
      ).rejects.toThrow(
        'Exactly one of priceId, priceSlug, usageMeterId, or usageMeterSlug must be provided'
      )

      // Test bulkInsert procedure
      await expect(
        caller.bulkInsert({
          usageEvents: [
            {
              subscriptionId: subscription1.id,
              amount: 100,
              transactionId: `txn_bulk_neither_${Date.now()}`,
            },
          ],
        })
      ).rejects.toThrow(
        'Exactly one of priceId, priceSlug, usageMeterId, or usageMeterSlug must be provided'
      )
    })

    it('should create usage event with usageMeterId', async () => {
      const caller = createCaller(
        org1Data.organization,
        org1ApiKeyToken
      )

      // Test create procedure
      const result = await caller.create({
        usageEvent: {
          subscriptionId: subscription1.id,
          usageMeterId: usageMeter1.id,
          amount: 250,
          transactionId: `txn_usageMeterId_${Date.now()}`,
        },
      })

      expect(result.usageEvent.subscriptionId).toBe(subscription1.id)
      expect(result.usageEvent.amount).toBe(250)
      // When usageMeterId is provided, priceId should be null
      expect(result.usageEvent.priceId).toBeNull()
      expect(result.usageEvent.usageMeterId).toBe(usageMeter1.id)

      // Test bulkInsert procedure
      const bulkResult = await caller.bulkInsert({
        usageEvents: [
          {
            subscriptionId: subscription1.id,
            usageMeterId: usageMeter1.id,
            amount: 100,
            transactionId: `txn_bulk_usageMeterId_1_${Date.now()}`,
          },
          {
            subscriptionId: subscription1.id,
            usageMeterId: usageMeter1.id,
            amount: 200,
            transactionId: `txn_bulk_usageMeterId_2_${Date.now()}`,
          },
          {
            subscriptionId: subscription1.id,
            usageMeterId: usageMeter1.id,
            amount: 300,
            transactionId: `txn_bulk_usageMeterId_3_${Date.now()}`,
          },
        ],
      })

      expect(bulkResult.usageEvents).toHaveLength(3)
      // When usageMeterId is provided, priceId should be null
      bulkResult.usageEvents.forEach((event) => {
        expect(event.priceId).toBeNull()
        expect(event.usageMeterId).toBe(usageMeter1.id)
      })
      expect(bulkResult.usageEvents[0].amount).toBe(100)
      expect(bulkResult.usageEvents[1].amount).toBe(200)
      expect(bulkResult.usageEvents[2].amount).toBe(300)
    }, 60000)

    it('should create usage event with usageMeterSlug', async () => {
      // First, update usageMeter1 to have a slug
      await authenticatedTransaction(
        async ({ transaction }) => {
          await updateUsageMeter(
            {
              id: usageMeter1.id,
              slug: 'test-usage-meter-slug',
            },
            transaction
          )
        },
        { apiKey: org1ApiKeyToken }
      )

      const caller = createCaller(
        org1Data.organization,
        org1ApiKeyToken
      )

      // Test create procedure
      const result = await caller.create({
        usageEvent: {
          subscriptionId: subscription1.id,
          usageMeterSlug: 'test-usage-meter-slug',
          amount: 300,
          transactionId: `txn_usageMeterSlug_${Date.now()}`,
        },
      })

      expect(result.usageEvent.subscriptionId).toBe(subscription1.id)
      expect(result.usageEvent.amount).toBe(300)
      // When usageMeterSlug is provided, priceId should be null
      expect(result.usageEvent.priceId).toBeNull()
      expect(result.usageEvent.usageMeterId).toBe(usageMeter1.id)

      // Test bulkInsert procedure
      const bulkResult = await caller.bulkInsert({
        usageEvents: [
          {
            subscriptionId: subscription1.id,
            usageMeterSlug: 'test-usage-meter-slug',
            amount: 150,
            transactionId: `txn_bulk_usageMeterSlug_1_${Date.now()}`,
          },
          {
            subscriptionId: subscription1.id,
            usageMeterSlug: 'test-usage-meter-slug',
            amount: 250,
            transactionId: `txn_bulk_usageMeterSlug_2_${Date.now()}`,
          },
        ],
      })

      expect(bulkResult.usageEvents).toHaveLength(2)
      // When usageMeterSlug is provided, priceId should be null
      bulkResult.usageEvents.forEach((event) => {
        expect(event.priceId).toBeNull()
        expect(event.usageMeterId).toBe(usageMeter1.id)
      })
      expect(bulkResult.usageEvents[0].amount).toBe(150)
      expect(bulkResult.usageEvents[1].amount).toBe(250)
    }, 60000)

    it('should throw error when invalid usageMeterSlug is provided', async () => {
      const caller = createCaller(
        org1Data.organization,
        org1ApiKeyToken
      )

      // Test create procedure
      await expect(
        caller.create({
          usageEvent: {
            subscriptionId: subscription1.id,
            usageMeterSlug: 'invalid-usage-meter-slug',
            amount: 250,
            transactionId: `txn_invalid_um_slug_${Date.now()}`,
          },
        })
      ).rejects.toThrow(
        "Usage meter with slug invalid-usage-meter-slug not found for this customer's pricing model"
      )

      // Test bulkInsert procedure
      await expect(
        caller.bulkInsert({
          usageEvents: [
            {
              subscriptionId: subscription1.id,
              usageMeterId: usageMeter1.id,
              amount: 100,
              transactionId: `txn_bulk_invalid_um_1_${Date.now()}`,
            },
            {
              subscriptionId: subscription1.id,
              usageMeterSlug: 'invalid-usage-meter-slug',
              amount: 200,
              transactionId: `txn_bulk_invalid_um_2_${Date.now()}`,
            },
          ],
        })
      ).rejects.toThrow(
        "Usage meter with slug invalid-usage-meter-slug not found for customer's pricing model"
      )
    })

    it('should throw error when both priceId and usageMeterId are provided', async () => {
      const caller = createCaller(
        org1Data.organization,
        org1ApiKeyToken
      )

      // Test create procedure
      await expect(
        caller.create({
          usageEvent: {
            subscriptionId: subscription1.id,
            priceId: price1.id,
            usageMeterId: usageMeter1.id,
            amount: 300,
            transactionId: `txn_both_price_um_${Date.now()}`,
          },
        })
      ).rejects.toThrow(
        'Exactly one of priceId, priceSlug, usageMeterId, or usageMeterSlug must be provided'
      )

      // Test bulkInsert procedure
      await expect(
        caller.bulkInsert({
          usageEvents: [
            {
              subscriptionId: subscription1.id,
              priceId: price1.id,
              usageMeterId: usageMeter1.id,
              amount: 100,
              transactionId: `txn_bulk_both_types_${Date.now()}`,
            },
          ],
        })
      ).rejects.toThrow(
        'Exactly one of priceId, priceSlug, usageMeterId, or usageMeterSlug must be provided'
      )
    })

    it('should throw error when both priceSlug and usageMeterSlug are provided', async () => {
      // First, update price1 and usageMeter1 to have slugs
      await authenticatedTransaction(
        async ({ transaction }) => {
          await updatePrice(
            {
              id: price1.id,
              slug: 'test-price-slug',
              type: price1.type,
            },
            transaction
          )
          await updateUsageMeter(
            {
              id: usageMeter1.id,
              slug: 'test-usage-meter-slug',
            },
            transaction
          )
        },
        { apiKey: org1ApiKeyToken }
      )

      const caller = createCaller(
        org1Data.organization,
        org1ApiKeyToken
      )

      // Test create procedure
      await expect(
        caller.create({
          usageEvent: {
            subscriptionId: subscription1.id,
            priceSlug: 'test-price-slug',
            usageMeterSlug: 'test-usage-meter-slug',
            amount: 300,
            transactionId: `txn_both_slugs_${Date.now()}`,
          },
        })
      ).rejects.toThrow(
        'Exactly one of priceId, priceSlug, usageMeterId, or usageMeterSlug must be provided'
      )

      // Test bulkInsert procedure
      await expect(
        caller.bulkInsert({
          usageEvents: [
            {
              subscriptionId: subscription1.id,
              priceSlug: 'test-price-slug',
              usageMeterSlug: 'test-usage-meter-slug',
              amount: 100,
              transactionId: `txn_bulk_both_slugs_${Date.now()}`,
            },
          ],
        })
      ).rejects.toThrow(
        'Exactly one of priceId, priceSlug, usageMeterId, or usageMeterSlug must be provided'
      )
    })

    it('should throw error when priceId and usageMeterSlug are provided', async () => {
      // First, update usageMeter1 to have a slug
      await authenticatedTransaction(
        async ({ transaction }) => {
          await updateUsageMeter(
            {
              id: usageMeter1.id,
              slug: 'test-usage-meter-slug',
            },
            transaction
          )
        },
        { apiKey: org1ApiKeyToken }
      )

      const caller = createCaller(
        org1Data.organization,
        org1ApiKeyToken
      )

      // Test create procedure
      await expect(
        caller.create({
          usageEvent: {
            subscriptionId: subscription1.id,
            priceId: price1.id,
            usageMeterSlug: 'test-usage-meter-slug',
            amount: 300,
            transactionId: `txn_price_um_slug_${Date.now()}`,
          },
        })
      ).rejects.toThrow(
        'Exactly one of priceId, priceSlug, usageMeterId, or usageMeterSlug must be provided'
      )

      // Test bulkInsert procedure
      await expect(
        caller.bulkInsert({
          usageEvents: [
            {
              subscriptionId: subscription1.id,
              priceId: price1.id,
              usageMeterSlug: 'test-usage-meter-slug',
              amount: 100,
              transactionId: `txn_bulk_price_um_slug_${Date.now()}`,
            },
          ],
        })
      ).rejects.toThrow(
        'Exactly one of priceId, priceSlug, usageMeterId, or usageMeterSlug must be provided'
      )
    })

    it('should throw error when usageMeterId from different pricing model is provided', async () => {
      const caller = createCaller(
        org1Data.organization,
        org1ApiKeyToken
      )

      // Test create procedure - try to use org2's usage meter with org1's subscription
      await expect(
        caller.create({
          usageEvent: {
            subscriptionId: subscription1.id,
            usageMeterId: usageMeter2.id, // This belongs to org2
            amount: 250,
            transactionId: `txn_wrong_org_um_${Date.now()}`,
          },
        })
      ).rejects.toThrow(
        `Usage meter ${usageMeter2.id} not found for this customer's pricing model`
      )

      // Test bulkInsert procedure - try to use org2's usage meter with org1's subscription
      await expect(
        caller.bulkInsert({
          usageEvents: [
            {
              subscriptionId: subscription1.id,
              usageMeterId: usageMeter2.id, // This belongs to org2
              amount: 100,
              transactionId: `txn_bulk_wrong_org_${Date.now()}`,
            },
          ],
        })
      ).rejects.toThrow(
        `Usage meter ${usageMeter2.id} not found for this customer's pricing model`
      )
    })
  })

  describe('bulkInsert procedure', () => {
    it('should successfully bulk insert usage events', async () => {
      const caller = createCaller(
        org1Data.organization,
        org1ApiKeyToken
      )

      const result = await caller.bulkInsert({
        usageEvents: [
          {
            subscriptionId: subscription1.id,
            priceId: price1.id,
            amount: 100,
            transactionId: `txn_smoke_${Date.now()}`,
          },
        ],
      })

      // Verify endpoint is wired and returns expected structure
      expect(result.usageEvents).toHaveLength(1)
      const event = result.usageEvents[0]
      expect(event.subscriptionId).toBe(subscription1.id)
      expect(event.priceId).toBe(price1.id)
      expect(event.customerId).toBe(customer1.id)
      expect(event.amount).toBe(100)
    }, 60000)

    it('should throw error when no identifier is provided', async () => {
      const caller = createCaller(
        org1Data.organization,
        org1ApiKeyToken
      )

      await expect(
        caller.bulkInsert({
          usageEvents: [
            {
              subscriptionId: subscription1.id,
              // Missing required identifier (priceId, priceSlug, usageMeterId, or usageMeterSlug)
              amount: 100,
              transactionId: `txn_invalid_${Date.now()}`,
            },
          ],
        })
      ).rejects.toThrow(
        'Exactly one of priceId, priceSlug, usageMeterId, or usageMeterSlug must be provided'
      )
    })
  })
})
