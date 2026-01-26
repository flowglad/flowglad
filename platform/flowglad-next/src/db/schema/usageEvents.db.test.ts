import { beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import {
  setupBillingPeriod,
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupSubscription,
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
import { insertUsageEvent } from '@/db/tableMethods/usageEventMethods'
import {
  IntervalUnit,
  PaymentMethodType,
  PriceType,
  SubscriptionStatus,
} from '@/types'
import core from '@/utils/core'

// NOTE: RLS tests have been moved to integration-tests/db/usageEventsRLS.rls.test.ts

describe('usageEvents schema - priceId NOT NULL constraint', () => {
  // Shared setup - created once in beforeAll (immutable across tests)
  let orgData: Awaited<ReturnType<typeof setupOrg>>
  let apiKeyToken: string
  let usageMeter: UsageMeter.Record
  let usageMeter2: UsageMeter.Record
  let price: Price.Record
  let price2: Price.Record

  // Per-test setup - created fresh in beforeEach (mutable/test-specific)
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let subscription: Subscription.Record
  let billingPeriod: BillingPeriod.Record

  // beforeAll: Set up shared data that doesn't change between tests
  beforeAll(async () => {
    orgData = await setupOrg()
    const userApiKey = await setupUserAndApiKey({
      organizationId: orgData.organization.id,
      livemode: true,
    })
    if (!userApiKey.apiKey.token) {
      throw new Error('API key token not found')
    }
    apiKeyToken = userApiKey.apiKey.token

    usageMeter = await setupUsageMeter({
      organizationId: orgData.organization.id,
      name: 'Test Usage Meter',
      pricingModelId: orgData.pricingModel.id,
    })

    usageMeter2 = await setupUsageMeter({
      organizationId: orgData.organization.id,
      name: 'Test Usage Meter 2',
      pricingModelId: orgData.pricingModel.id,
    })

    price = await setupPrice({
      name: 'Test Usage Price',
      type: PriceType.Usage,
      unitPrice: 10,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      usageMeterId: usageMeter.id,
    })

    price2 = await setupPrice({
      name: 'Test Usage Price 2',
      type: PriceType.Usage,
      unitPrice: 20,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      usageMeterId: usageMeter2.id,
    })
  })

  // beforeEach: Create fresh customer/subscription data for test isolation
  beforeEach(async () => {
    customer = await setupCustomer({
      organizationId: orgData.organization.id,
    })
    paymentMethod = await setupPaymentMethod({
      organizationId: orgData.organization.id,
      customerId: customer.id,
      type: PaymentMethodType.Card,
    })

    subscription = await setupSubscription({
      organizationId: orgData.organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
      status: SubscriptionStatus.Active,
    })

    billingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
    })
  })

  it('rejects inserting usage event without priceId at the database level', async () => {
    // setup: attempt to insert usage event with priceId explicitly set to null
    // expectation: database constraint violation error
    await expect(
      authenticatedTransaction(
        async ({ transaction }) => {
          return insertUsageEvent(
            {
              customerId: customer.id,
              subscriptionId: subscription.id,
              usageMeterId: usageMeter.id,
              // @ts-expect-error - Testing that null priceId is rejected at runtime
              priceId: null,
              billingPeriodId: billingPeriod.id,
              amount: 100,
              transactionId: `txn_null_price_${core.nanoid()}`,
              usageDate: Date.now(),
              livemode: true,
              properties: {},
            },
            transaction
          )
        },
        { apiKey: apiKeyToken }
      )
    ).rejects.toThrow()
  })

  it('successfully inserts usage event with valid priceId for matching usage meter', async () => {
    // setup: insert usage event with valid priceId that matches the usage meter
    // expectation: success, event created with the specified priceId
    const usageEvent = await authenticatedTransaction(
      async ({ transaction }) => {
        return insertUsageEvent(
          {
            customerId: customer.id,
            subscriptionId: subscription.id,
            usageMeterId: usageMeter.id,
            priceId: price.id,
            billingPeriodId: billingPeriod.id,
            amount: 100,
            transactionId: `txn_valid_price_${core.nanoid()}`,
            usageDate: Date.now(),
            livemode: true,
            properties: {},
          },
          transaction
        )
      },
      { apiKey: apiKeyToken }
    )

    expect(usageEvent.priceId).toBe(price.id)
    expect(usageEvent.usageMeterId).toBe(usageMeter.id)
    expect(usageEvent.amount).toBe(100)
  })

  it('successfully inserts usage events with different valid priceIds for different meters', async () => {
    // setup: insert usage events for different meters with their respective prices
    // expectation: each event has the correct priceId for its meter
    const usageEvent1 = await authenticatedTransaction(
      async ({ transaction }) => {
        return insertUsageEvent(
          {
            customerId: customer.id,
            subscriptionId: subscription.id,
            usageMeterId: usageMeter.id,
            priceId: price.id,
            billingPeriodId: billingPeriod.id,
            amount: 100,
            transactionId: `txn_meter1_${core.nanoid()}`,
            usageDate: Date.now(),
            livemode: true,
            properties: {},
          },
          transaction
        )
      },
      { apiKey: apiKeyToken }
    )

    const usageEvent2 = await authenticatedTransaction(
      async ({ transaction }) => {
        return insertUsageEvent(
          {
            customerId: customer.id,
            subscriptionId: subscription.id,
            usageMeterId: usageMeter2.id,
            priceId: price2.id,
            billingPeriodId: billingPeriod.id,
            amount: 200,
            transactionId: `txn_meter2_${core.nanoid()}`,
            usageDate: Date.now(),
            livemode: true,
            properties: {},
          },
          transaction
        )
      },
      { apiKey: apiKeyToken }
    )

    expect(usageEvent1.priceId).toBe(price.id)
    expect(usageEvent1.usageMeterId).toBe(usageMeter.id)
    expect(usageEvent2.priceId).toBe(price2.id)
    expect(usageEvent2.usageMeterId).toBe(usageMeter2.id)
  })
})
