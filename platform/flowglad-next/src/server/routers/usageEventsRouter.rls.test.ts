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
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { Subscription } from '@/db/schema/subscriptions'
import { UsageEvent } from '@/db/schema/usageEvents'
import type { UsageMeter } from '@/db/schema/usageMeters'
import { updatePrice } from '@/db/tableMethods/priceMethods'
import { updateUsageMeter } from '@/db/tableMethods/usageMeterMethods'
import type { AuthenticatedTransactionParams } from '@/db/types'
import { usageEventsRouter } from '@/server/routers/usageEventsRouter'
import type { TRPCApiContext } from '@/server/trpcContext'
import {
  IntervalUnit,
  PaymentMethodType,
  PriceType,
  SubscriptionStatus,
} from '@/types'

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
    // Setup organization 1 with API key
    org1Data = (await setupOrg()).unwrap()

    // Parallelize independent setup operations
    const [userApiKeyOrg1, usageMeterResult] = await Promise.all([
      setupUserAndApiKey({
        organizationId: org1Data.organization.id,
        livemode: true,
      }),
      setupUsageMeter({
        organizationId: org1Data.organization.id,
        name: 'Test Usage Meter 1',
        pricingModelId: org1Data.pricingModel.id,
      }),
    ])

    if (!userApiKeyOrg1.apiKey.token) {
      throw new Error('API key token not found after setup for org1')
    }
    org1ApiKeyToken = userApiKeyOrg1.apiKey.token
    usageMeter1 = usageMeterResult

    // Setup price - set as default so it can be resolved when events use usageMeterId/usageMeterSlug
    price1 = await setupPrice({
      name: 'Test Price 1',
      type: PriceType.Usage,
      unitPrice: 100,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: true,
      usageMeterId: usageMeter1.id,
    })
  })

  // beforeEach: Create fresh customer/subscription data for test isolation
  beforeEach(async () => {
    customer1 = (
      await setupCustomer({
        organizationId: org1Data.organization.id,
        email: `customer1+${Date.now()}@test.com`,
        pricingModelId: org1Data.pricingModel.id,
      })
    ).unwrap()

    paymentMethod1 = (
      await setupPaymentMethod({
        organizationId: org1Data.organization.id,
        customerId: customer1.id,
        type: PaymentMethodType.Card,
      })
    ).unwrap()

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
    const userApiKeyOrg2 = (
      await setupUserAndApiKey({
        organizationId: org2Data.organization.id,
        livemode: true,
      })
    ).unwrap()
    if (!userApiKeyOrg2.apiKey.token) {
      throw new Error('API key token not found after setup for org2')
    }

    const customer2 = (
      await setupCustomer({
        organizationId: org2Data.organization.id,
        email: `customer2+${Date.now()}@test.com`,
        pricingModelId: org2Data.pricingModel.id,
      })
    ).unwrap()

    const paymentMethod2 = (
      await setupPaymentMethod({
        organizationId: org2Data.organization.id,
        customerId: customer2.id,
        type: PaymentMethodType.Card,
      })
    ).unwrap()

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
      isDefault: true,
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
      org2ApiKeyToken: userApiKeyOrg2.apiKey.token,
      customer2,
      paymentMethod2,
      usageMeter2,
      price2,
      subscription2,
      billingPeriod2,
    }
  }

  describe('list procedure', () => {
    it('should return paginated usage events for organization 1 only', async () => {
      // Create 5 usage events for organization 1 in parallel
      const usageEvents1 = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          setupUsageEvent({
            organizationId: org1Data.organization.id,
            customerId: customer1.id,
            subscriptionId: subscription1.id,
            usageMeterId: usageMeter1.id,
            priceId: price1.id,
            billingPeriodId: billingPeriod1.id,
            amount: 100 + i,
            transactionId: `txn_org1_${i}_${Date.now()}`,
          })
        )
      )

      // Create org2 and 3 usage events for it (to verify RLS isolation)
      const {
        org2Data,
        customer2,
        subscription2,
        usageMeter2,
        price2,
        billingPeriod2,
      } = await setupOrg2()
      await Promise.all(
        Array.from({ length: 3 }, (_, i) =>
          setupUsageEvent({
            organizationId: org2Data.organization.id,
            customerId: customer2.id,
            subscriptionId: subscription2.id,
            usageMeterId: usageMeter2.id,
            priceId: price2.id,
            billingPeriodId: billingPeriod2.id,
            amount: 200 + i,
            transactionId: `txn_org2_${i}_${Date.now()}`,
          })
        )
      )

      // Call list procedure with org1 API key, filtering by customer1
      const caller = createCaller(
        org1Data.organization,
        org1ApiKeyToken
      )

      const result = await caller.list({
        cursor: undefined,
        limit: 10,
        customerId: customer1.id,
      })

      // Should return only the 5 usage events for customer1
      expect(result.total).toBe(5)
      expect(result.hasMore).toBe(false)

      // Should respect RLS policies - verify exact events by ID
      const org1EventIds = result.data.map(
        (event: UsageEvent.Record) => event.id
      )
      const expectedEventIds = usageEvents1.map(
        (event: UsageEvent.Record) => event.id
      )
      expect(org1EventIds.sort()).toEqual(expectedEventIds.sort())

      // Verify all returned events belong to customer1
      result.data.forEach((event: UsageEvent.Record) => {
        expect(event.customerId).toBe(customer1.id)
      })
    })

    it('should handle empty results when no usage events exist', async () => {
      // Create isolated org quickly (parallel setup)
      const isolatedOrgData = (await setupOrg()).unwrap()
      const userApiKey = (
        await setupUserAndApiKey({
          organizationId: isolatedOrgData.organization.id,
          livemode: true,
        })
      ).unwrap()

      const caller = createCaller(
        isolatedOrgData.organization,
        userApiKey.apiKey.token!
      )

      const result = await caller.list({
        cursor: undefined,
        limit: 10,
      })

      // Should return empty array - no events in isolated org
      expect(result.data).toEqual([])
      expect(result.total).toBe(0)
      expect(result.hasMore).toBe(false)
    })

    it('should respect limit parameter', async () => {
      // Create an isolated org for deterministic testing
      // (the list procedure's customerId filter doesn't affect total count)
      const isolatedOrgData = (await setupOrg()).unwrap()
      const isolatedUserApiKey = (
        await setupUserAndApiKey({
          organizationId: isolatedOrgData.organization.id,
          livemode: true,
        })
      ).unwrap()

      const isolatedUsageMeter = await setupUsageMeter({
        organizationId: isolatedOrgData.organization.id,
        name: 'Limit Test Meter',
        pricingModelId: isolatedOrgData.pricingModel.id,
      })

      const isolatedPrice = await setupPrice({
        name: 'Limit Test Price',
        type: PriceType.Usage,
        unitPrice: 100,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
        usageMeterId: isolatedUsageMeter.id,
      })

      const isolatedCustomer = (
        await setupCustomer({
          organizationId: isolatedOrgData.organization.id,
          email: `limit-test+${Date.now()}@test.com`,
          pricingModelId: isolatedOrgData.pricingModel.id,
        })
      ).unwrap()

      const isolatedPaymentMethod = (
        await setupPaymentMethod({
          organizationId: isolatedOrgData.organization.id,
          customerId: isolatedCustomer.id,
          type: PaymentMethodType.Card,
        })
      ).unwrap()

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

      // Create 10 usage events for the isolated customer
      const createdEvents = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          setupUsageEvent({
            organizationId: isolatedOrgData.organization.id,
            customerId: isolatedCustomer.id,
            subscriptionId: isolatedSubscription.id,
            usageMeterId: isolatedUsageMeter.id,
            priceId: isolatedPrice.id,
            billingPeriodId: isolatedBillingPeriod.id,
            amount: 100 + i,
            transactionId: `txn_limit_${i}_${Date.now()}`,
          })
        )
      )

      const caller = createCaller(
        isolatedOrgData.organization,
        isolatedUserApiKey.apiKey.token!
      )

      const result = await caller.list({
        cursor: undefined,
        limit: 3,
      })

      // Isolated org has exactly 10 events, limit returns 3
      expect(result.total).toBe(10)
      expect(result.hasMore).toBe(true)
      expect(typeof result.nextCursor).toBe('string')

      // Verify returned events are from our created events
      const returnedEventIds = result.data.map(
        (event: UsageEvent.Record) => event.id
      )
      const createdEventIds = createdEvents.map(
        (event: UsageEvent.Record) => event.id
      )
      expect(returnedEventIds).toHaveLength(3)
      returnedEventIds.forEach((eventId: string) => {
        expect(createdEventIds).toContain(eventId)
      })

      // Verify all returned events belong to isolated customer
      result.data.forEach((event: UsageEvent.Record) => {
        expect(event.customerId).toBe(isolatedCustomer.id)
      })
    })
  })

  describe('getTableRows procedure', () => {
    it('should return enriched data with all related records', async () => {
      // Create 3 usage events using shared org setup
      const createdEvents = await Promise.all(
        Array.from({ length: 3 }, (_, i) =>
          setupUsageEvent({
            organizationId: org1Data.organization.id,
            customerId: customer1.id,
            subscriptionId: subscription1.id,
            usageMeterId: usageMeter1.id,
            priceId: price1.id,
            billingPeriodId: billingPeriod1.id,
            amount: 100 + i,
            transactionId: `txn_enriched_${i}_${Date.now()}`,
          })
        )
      )

      const caller = createCaller(
        org1Data.organization,
        org1ApiKeyToken
      )

      const result = await caller.getTableRows({
        pageSize: 10,
        customerId: customer1.id,
      })

      // Verify by specific IDs - all created events should be in result
      const returnedEventIds = result.items.map(
        (item: { usageEvent: { id: string } }) => item.usageEvent.id
      )
      const expectedEventIds = createdEvents.map(
        (event: UsageEvent.Record) => event.id
      )
      expectedEventIds.forEach((id: string) => {
        expect(returnedEventIds).toContain(id)
      })

      // Each created event should have proper enrichment data
      const createdEventItems = result.items.filter(
        (item: { usageEvent: { id: string } }) =>
          expectedEventIds.includes(item.usageEvent.id)
      )
      expect(createdEventItems).toHaveLength(3)

      createdEventItems.forEach(
        (enrichedEvent: {
          usageEvent: object
          customer: { id: string }
          subscription: { id: string }
          usageMeter: { id: string }
          price?: { id: string }
        }) => {
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
        }
      )
    })

    it('should handle empty results when no usage events exist', async () => {
      // Create isolated org quickly (parallel setup)
      const isolatedOrgData = (await setupOrg()).unwrap()
      const userApiKey = (
        await setupUserAndApiKey({
          organizationId: isolatedOrgData.organization.id,
          livemode: true,
        })
      ).unwrap()

      const caller = createCaller(
        isolatedOrgData.organization,
        userApiKey.apiKey.token!
      )

      const result = await caller.getTableRows({
        pageSize: 10,
      })

      // Should return empty array - no events in isolated org
      expect(result.items).toEqual([])
      expect(result.total).toBe(0)
      expect(result.hasNextPage).toBe(false)
    })

    it('should respect cursor pagination', async () => {
      // Create isolated customer to have deterministic event count for pagination
      const isolatedCustomer = (
        await setupCustomer({
          organizationId: org1Data.organization.id,
          email: `pagination-test+${Date.now()}@test.com`,
          pricingModelId: org1Data.pricingModel.id,
        })
      ).unwrap()

      const isolatedPaymentMethod = (
        await setupPaymentMethod({
          organizationId: org1Data.organization.id,
          customerId: isolatedCustomer.id,
          type: PaymentMethodType.Card,
        })
      ).unwrap()

      const isolatedSubscription = await setupSubscription({
        organizationId: org1Data.organization.id,
        customerId: isolatedCustomer.id,
        paymentMethodId: isolatedPaymentMethod.id,
        priceId: price1.id,
        status: SubscriptionStatus.Active,
      })

      const isolatedBillingPeriod = await setupBillingPeriod({
        subscriptionId: isolatedSubscription.id,
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
      })

      // Create 10 usage events sequentially to ensure distinct positions
      // (parallel creation can cause position collisions affecting cursor pagination)
      const createdEvents: UsageEvent.Record[] = []
      for (let i = 0; i < 10; i++) {
        const event = await setupUsageEvent({
          organizationId: org1Data.organization.id,
          customerId: isolatedCustomer.id,
          subscriptionId: isolatedSubscription.id,
          usageMeterId: usageMeter1.id,
          priceId: price1.id,
          billingPeriodId: isolatedBillingPeriod.id,
          amount: 100 + i,
          transactionId: `txn_cursor_${i}_${Date.now()}`,
        })
        createdEvents.push(event)
      }
      const allCreatedIds = createdEvents.map((e) => e.id)

      const caller = createCaller(
        org1Data.organization,
        org1ApiKeyToken
      )

      // First call with pageSize of 3, filtered by isolated customer
      const firstResult = await caller.getTableRows({
        pageSize: 3,
        customerId: isolatedCustomer.id,
      })

      // Second call using pageAfter from first result
      const secondResult = await caller.getTableRows({
        pageAfter: firstResult.endCursor ?? undefined,
        pageSize: 3,
        customerId: isolatedCustomer.id,
      })

      // First call should return first 3 events
      expect(firstResult.items).toHaveLength(3)
      expect(firstResult.hasNextPage).toBe(true)
      expect(typeof firstResult.endCursor).toBe('string')
      expect(firstResult.endCursor!.length).toBeGreaterThan(0)

      // Second call should return next 3 events
      expect(secondResult.items).toHaveLength(3)
      expect(secondResult.hasNextPage).toBe(true)

      // Get event IDs from results
      const firstEventIds = firstResult.items.map(
        (event: { usageEvent: { id: string } }) => event.usageEvent.id
      )
      const secondEventIds = secondResult.items.map(
        (event: { usageEvent: { id: string } }) => event.usageEvent.id
      )

      // All returned events should be from our created set
      firstEventIds.forEach((id: string) => {
        expect(allCreatedIds).toContain(id)
      })
      secondEventIds.forEach((id: string) => {
        expect(allCreatedIds).toContain(id)
      })

      // Verify no duplicate events between pages
      const overlap = firstEventIds.filter((id: string) =>
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
        async (ctx: AuthenticatedTransactionParams) => {
          await updatePrice(
            {
              id: price1.id,
              slug: 'test-price-slug',
              type: price1.type,
            },
            ctx
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
        "Price not found: with slug invalid-slug-does-not-exist (not in customer's pricing model)"
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
        "Price not found: with slug invalid-slug-bulk (not in customer's pricing model)"
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
      // When usageMeterId is provided, priceId should be resolved to the meter's default price
      expect(result.usageEvent.priceId).toBe(price1.id)
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
      // When usageMeterId is provided, priceId should be resolved to the meter's default price
      bulkResult.usageEvents.forEach((event) => {
        expect(event.priceId).toBe(price1.id)
        expect(event.usageMeterId).toBe(usageMeter1.id)
      })
      expect(bulkResult.usageEvents[0].amount).toBe(100)
      expect(bulkResult.usageEvents[1].amount).toBe(200)
      expect(bulkResult.usageEvents[2].amount).toBe(300)
    }, 60000)

    it('should create usage event with usageMeterSlug', async () => {
      // First, update usageMeter1 to have a slug
      await authenticatedTransaction(
        async (ctx: AuthenticatedTransactionParams) => {
          await updateUsageMeter(
            {
              id: usageMeter1.id,
              slug: 'test-usage-meter-slug',
            },
            ctx
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
      // When usageMeterSlug is provided, priceId should be resolved to the meter's default price
      expect(result.usageEvent.priceId).toBe(price1.id)
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
      // When usageMeterSlug is provided, priceId should be resolved to the meter's default price
      bulkResult.usageEvents.forEach((event) => {
        expect(event.priceId).toBe(price1.id)
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
        "UsageMeter not found: with slug invalid-usage-meter-slug (not in customer's pricing model)"
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
        'UsageMeter not found: slug "invalid-usage-meter-slug"'
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
        async (ctx: AuthenticatedTransactionParams) => {
          await updatePrice(
            {
              id: price1.id,
              slug: 'test-price-slug',
              type: price1.type,
            },
            ctx
          )
          await updateUsageMeter(
            {
              id: usageMeter1.id,
              slug: 'test-usage-meter-slug',
            },
            ctx
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
        async (ctx: AuthenticatedTransactionParams) => {
          await updateUsageMeter(
            {
              id: usageMeter1.id,
              slug: 'test-usage-meter-slug',
            },
            ctx
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
      // Create org2 to get a usage meter from a different pricing model
      const { usageMeter2 } = await setupOrg2()

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
        `UsageMeter not found: ${usageMeter2.id} (not in customer's pricing model)`
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
      ).rejects.toThrow(`UsageMeter not found: ${usageMeter2.id}`)
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
