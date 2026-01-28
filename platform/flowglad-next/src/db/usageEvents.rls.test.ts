import { beforeEach, describe, expect, it } from 'bun:test'
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
import type { UsageEvent } from '@/db/schema/usageEvents'
import type { UsageMeter } from '@/db/schema/usageMeters'
import {
  insertUsageEvent,
  selectUsageEvents,
} from '@/db/tableMethods/usageEventMethods'
import {
  IntervalUnit,
  PaymentMethodType,
  PriceType,
  SubscriptionStatus,
} from '@/types'

describe('usage_events RLS policies', () => {
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
    org1Data = (await setupOrg()).unwrap()
    const userApiKeyOrg1 = await setupUserAndApiKey({
      organizationId: org1Data.organization.id,
      livemode: true,
    })
    if (!userApiKeyOrg1.apiKey.token) {
      throw new Error('API key token not found after setup for org1')
    }
    org1ApiKeyToken = userApiKeyOrg1.apiKey.token

    // Setup organization 2 with API key
    org2Data = (await setupOrg()).unwrap()
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

  it('should ALLOW merchants to read usage events for their organization', async () => {
    // Create usage event for organization 1
    const usageEvent = await authenticatedTransaction(
      async ({ transaction }) => {
        return insertUsageEvent(
          {
            customerId: customer1.id,
            subscriptionId: subscription1.id,
            usageMeterId: usageMeter1.id,
            priceId: price1.id,
            billingPeriodId: billingPeriod1.id,
            amount: 100,
            transactionId: 'txn_org1_allowed',
            usageDate: Date.now(),
            livemode: true,
            properties: {},
          },
          transaction
        )
      },
      { apiKey: org1ApiKeyToken }
    )

    // Try to read with org1 API key
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectUsageEvents(
          {
            id: usageEvent.id,
          },
          transaction
        )
      },
      { apiKey: org1ApiKeyToken }
    )

    // Should return the usage event
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(usageEvent.id)
  })

  it('should DENY merchants from reading usage events for other organizations', async () => {
    // Create usage event for organization 2
    const usageEvent = await authenticatedTransaction(
      async ({ transaction }) => {
        return insertUsageEvent(
          {
            customerId: customer2.id,
            subscriptionId: subscription2.id,
            usageMeterId: usageMeter2.id,
            priceId: price2.id,
            billingPeriodId: billingPeriod2.id,
            amount: 200,
            transactionId: 'txn_org2_denied',
            usageDate: Date.now(),
            livemode: true,
            properties: {},
          },
          transaction
        )
      },
      { apiKey: org2ApiKeyToken }
    )

    // Try to read with org1 API key
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectUsageEvents(
          {
            id: usageEvent.id,
          },
          transaction
        )
      },
      { apiKey: org1ApiKeyToken }
    )

    // Should return empty results due to RLS
    expect(result).toHaveLength(0)
  })

  it('should ALLOW insertion of usage events for valid subscriptions', async () => {
    // Create usage event insert for organization 1 subscription
    const usageEventInsert: UsageEvent.Insert = {
      customerId: customer1.id,
      subscriptionId: subscription1.id,
      usageMeterId: usageMeter1.id,
      priceId: price1.id,
      billingPeriodId: billingPeriod1.id,
      amount: 100,
      transactionId: 'txn_valid_insert',
      usageDate: Date.now(),
      livemode: true,
      properties: {},
    }

    // Try to insert with org1 API key
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        return insertUsageEvent(usageEventInsert, transaction)
      },
      { apiKey: org1ApiKeyToken }
    )

    // Should successfully insert usage event
    expect(typeof result.id).toBe('string')
    expect(result.amount).toBe(100)
  })

  it('should DENY insertion of usage events for other organization subscriptions', async () => {
    // Create usage event insert for organization 2 subscription
    const usageEventInsert: UsageEvent.Insert = {
      customerId: customer2.id,
      subscriptionId: subscription2.id,
      usageMeterId: usageMeter2.id,
      priceId: price2.id,
      billingPeriodId: billingPeriod2.id,
      amount: 200,
      transactionId: 'txn_invalid_insert',
      usageDate: Date.now(),
      livemode: true,
      properties: {},
    }

    // Try to insert with org1 API key (should fail due to RLS)
    await expect(
      authenticatedTransaction(
        async ({ transaction }) => {
          return insertUsageEvent(usageEventInsert, transaction)
        },
        { apiKey: org1ApiKeyToken }
      )
    ).rejects.toThrow()
  })

  it('should enforce livemode/testmode separation', async () => {
    // Create usage event in livemode
    const usageEvent = await authenticatedTransaction(
      async ({ transaction }) => {
        return insertUsageEvent(
          {
            customerId: customer1.id,
            subscriptionId: subscription1.id,
            usageMeterId: usageMeter1.id,
            priceId: price1.id,
            billingPeriodId: billingPeriod1.id,
            amount: 100,
            transactionId: 'txn_livemode',
            usageDate: Date.now(),
            livemode: true,
            properties: {},
          },
          transaction
        )
      },
      { apiKey: org1ApiKeyToken }
    )

    // Try to read with testmode API key (should fail due to livemode policy)
    const testmodeApiKey = await setupUserAndApiKey({
      organizationId: org1Data.organization.id,
      livemode: false,
    })

    if (!testmodeApiKey.apiKey.token) {
      throw new Error('Testmode API key token not found')
    }

    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectUsageEvents(
          {
            id: usageEvent.id,
          },
          transaction
        )
      },
      { apiKey: testmodeApiKey.apiKey.token }
    )

    // Should return empty results due to livemode policy
    expect(result).toHaveLength(0)
  })
})
