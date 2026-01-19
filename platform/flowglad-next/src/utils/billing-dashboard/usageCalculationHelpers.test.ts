import { describe, expect, it } from 'vitest'
import {
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPricingModel,
  setupProduct,
  setupSubscription,
  setupUsageEvent,
  setupUsageMeter,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  RevenueChartIntervalUnit,
  SubscriptionStatus,
  UsageMeterAggregationType,
} from '@/types'
import core from '@/utils/core'
import {
  calculateUsageVolumeByInterval,
  getUsageMetersWithEvents,
} from './usageCalculationHelpers'

describe('calculateUsageVolumeByInterval', () => {
  describe('Sum aggregation', () => {
    it('returns zeros for org with no usage events', async () => {
      const { organization, pricingModel } = await setupOrg()
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'API Calls',
        pricingModelId: pricingModel.id,
        aggregationType: UsageMeterAggregationType.Sum,
      })

      const startDate = new Date('2023-01-01T00:00:00.000Z')
      const endDate = new Date('2023-01-07T23:59:59.999Z')

      const result = (
        await adminTransaction(async ({ transaction }) => {
          return calculateUsageVolumeByInterval(
            organization.id,
            {
              startDate,
              endDate,
              granularity: RevenueChartIntervalUnit.Day,
              usageMeterId: usageMeter.id,
              livemode: true,
            },
            transaction
          )
        })
      ).unwrap()

      // Should return 7 data points with zeros
      expect(result).toHaveLength(7)
      result.forEach((point) => {
        expect(point.amount).toBe(0)
      })
    })

    it('correctly sums usage by day', async () => {
      const { organization, pricingModel, price } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        defaultPaymentMethodId: paymentMethod.id,
        priceId: price.id,
        status: SubscriptionStatus.Active,
      })
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'API Calls',
        pricingModelId: pricingModel.id,
        aggregationType: UsageMeterAggregationType.Sum,
      })

      // Create usage events: 3 on day 1 (amounts 10, 20, 30), 1 on day 2 (amount 15)
      await setupUsageEvent({
        organizationId: organization.id,
        customerId: customer.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        amount: 10,
        usageDate: new Date('2023-01-01T10:00:00.000Z').getTime(),
        transactionId: `tx_${core.nanoid()}`,
      })
      await setupUsageEvent({
        organizationId: organization.id,
        customerId: customer.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        amount: 20,
        usageDate: new Date('2023-01-01T14:00:00.000Z').getTime(),
        transactionId: `tx_${core.nanoid()}`,
      })
      await setupUsageEvent({
        organizationId: organization.id,
        customerId: customer.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        amount: 30,
        usageDate: new Date('2023-01-01T18:00:00.000Z').getTime(),
        transactionId: `tx_${core.nanoid()}`,
      })
      await setupUsageEvent({
        organizationId: organization.id,
        customerId: customer.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        amount: 15,
        usageDate: new Date('2023-01-02T10:00:00.000Z').getTime(),
        transactionId: `tx_${core.nanoid()}`,
      })

      const startDate = new Date('2023-01-01T00:00:00.000Z')
      const endDate = new Date('2023-01-02T23:59:59.999Z')

      const result = (
        await adminTransaction(async ({ transaction }) => {
          return calculateUsageVolumeByInterval(
            organization.id,
            {
              startDate,
              endDate,
              granularity: RevenueChartIntervalUnit.Day,
              usageMeterId: usageMeter.id,
              livemode: true,
            },
            transaction
          )
        })
      ).unwrap()

      expect(result).toHaveLength(2)
      expect(result[0].amount).toBe(60) // 10 + 20 + 30
      expect(result[1].amount).toBe(15)
    })

    it('fills missing intervals with zero', async () => {
      const { organization, pricingModel, price } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        defaultPaymentMethodId: paymentMethod.id,
        priceId: price.id,
        status: SubscriptionStatus.Active,
      })
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'API Calls',
        pricingModelId: pricingModel.id,
        aggregationType: UsageMeterAggregationType.Sum,
      })

      // Events on Jan 1 and Jan 5, query range Jan 1-7
      await setupUsageEvent({
        organizationId: organization.id,
        customerId: customer.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        amount: 100,
        usageDate: new Date('2023-01-01T10:00:00.000Z').getTime(),
        transactionId: `tx_${core.nanoid()}`,
      })
      await setupUsageEvent({
        organizationId: organization.id,
        customerId: customer.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        amount: 50,
        usageDate: new Date('2023-01-05T10:00:00.000Z').getTime(),
        transactionId: `tx_${core.nanoid()}`,
      })

      const startDate = new Date('2023-01-01T00:00:00.000Z')
      const endDate = new Date('2023-01-07T23:59:59.999Z')

      const result = (
        await adminTransaction(async ({ transaction }) => {
          return calculateUsageVolumeByInterval(
            organization.id,
            {
              startDate,
              endDate,
              granularity: RevenueChartIntervalUnit.Day,
              usageMeterId: usageMeter.id,
              livemode: true,
            },
            transaction
          )
        })
      ).unwrap()

      expect(result).toHaveLength(7)
      expect(result[0].amount).toBe(100) // Jan 1
      expect(result[1].amount).toBe(0) // Jan 2
      expect(result[2].amount).toBe(0) // Jan 3
      expect(result[3].amount).toBe(0) // Jan 4
      expect(result[4].amount).toBe(50) // Jan 5
      expect(result[5].amount).toBe(0) // Jan 6
      expect(result[6].amount).toBe(0) // Jan 7
    })

    it('only includes livemode=true events', async () => {
      const { organization, pricingModel, price } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        defaultPaymentMethodId: paymentMethod.id,
        priceId: price.id,
        status: SubscriptionStatus.Active,
      })
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'API Calls',
        pricingModelId: pricingModel.id,
        aggregationType: UsageMeterAggregationType.Sum,
      })

      // Livemode event (amount 100)
      await setupUsageEvent({
        organizationId: organization.id,
        customerId: customer.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        amount: 100,
        livemode: true,
        usageDate: new Date('2023-01-01T10:00:00.000Z').getTime(),
        transactionId: `tx_${core.nanoid()}`,
      })
      // Testmode event (amount 50) - should be excluded
      await setupUsageEvent({
        organizationId: organization.id,
        customerId: customer.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        amount: 50,
        livemode: false,
        usageDate: new Date('2023-01-01T14:00:00.000Z').getTime(),
        transactionId: `tx_${core.nanoid()}`,
      })

      const startDate = new Date('2023-01-01T00:00:00.000Z')
      const endDate = new Date('2023-01-01T23:59:59.999Z')

      const result = (
        await adminTransaction(async ({ transaction }) => {
          return calculateUsageVolumeByInterval(
            organization.id,
            {
              startDate,
              endDate,
              granularity: RevenueChartIntervalUnit.Day,
              usageMeterId: usageMeter.id,
              livemode: true,
            },
            transaction
          )
        })
      ).unwrap()

      expect(result).toHaveLength(1)
      expect(result[0].amount).toBe(100) // Only livemode event
    })
  })

  describe('CountDistinctProperties aggregation', () => {
    it('counts distinct properties per interval', async () => {
      const { organization, pricingModel, price } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        defaultPaymentMethodId: paymentMethod.id,
        priceId: price.id,
        status: SubscriptionStatus.Active,
      })
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Unique Users',
        pricingModelId: pricingModel.id,
        aggregationType:
          UsageMeterAggregationType.CountDistinctProperties,
      })

      // 3 events same day, 2 with same properties
      await setupUsageEvent({
        organizationId: organization.id,
        customerId: customer.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        amount: 1,
        properties: { userId: 'user_1' },
        usageDate: new Date('2023-01-01T10:00:00.000Z').getTime(),
        transactionId: `tx_${core.nanoid()}`,
      })
      await setupUsageEvent({
        organizationId: organization.id,
        customerId: customer.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        amount: 1,
        properties: { userId: 'user_1' }, // Same as above
        usageDate: new Date('2023-01-01T14:00:00.000Z').getTime(),
        transactionId: `tx_${core.nanoid()}`,
      })
      await setupUsageEvent({
        organizationId: organization.id,
        customerId: customer.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        amount: 1,
        properties: { userId: 'user_2' }, // Different
        usageDate: new Date('2023-01-01T18:00:00.000Z').getTime(),
        transactionId: `tx_${core.nanoid()}`,
      })

      const startDate = new Date('2023-01-01T00:00:00.000Z')
      const endDate = new Date('2023-01-01T23:59:59.999Z')

      const result = (
        await adminTransaction(async ({ transaction }) => {
          return calculateUsageVolumeByInterval(
            organization.id,
            {
              startDate,
              endDate,
              granularity: RevenueChartIntervalUnit.Day,
              usageMeterId: usageMeter.id,
              livemode: true,
            },
            transaction
          )
        })
      ).unwrap()

      expect(result).toHaveLength(1)
      expect(result[0].amount).toBe(2) // 2 distinct property combinations
    })

    it('counts same user in multiple intervals (DAU semantics)', async () => {
      const { organization, pricingModel, price } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        defaultPaymentMethodId: paymentMethod.id,
        priceId: price.id,
        status: SubscriptionStatus.Active,
      })
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Unique Users',
        pricingModelId: pricingModel.id,
        aggregationType:
          UsageMeterAggregationType.CountDistinctProperties,
      })

      // Same user active on day 1 and day 2
      await setupUsageEvent({
        organizationId: organization.id,
        customerId: customer.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        amount: 1,
        properties: { userId: 'user_1' },
        usageDate: new Date('2023-01-01T10:00:00.000Z').getTime(),
        transactionId: `tx_${core.nanoid()}`,
      })
      await setupUsageEvent({
        organizationId: organization.id,
        customerId: customer.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        amount: 1,
        properties: { userId: 'user_1' }, // Same user on day 2
        usageDate: new Date('2023-01-02T10:00:00.000Z').getTime(),
        transactionId: `tx_${core.nanoid()}`,
      })

      const startDate = new Date('2023-01-01T00:00:00.000Z')
      const endDate = new Date('2023-01-02T23:59:59.999Z')

      const result = (
        await adminTransaction(async ({ transaction }) => {
          return calculateUsageVolumeByInterval(
            organization.id,
            {
              startDate,
              endDate,
              granularity: RevenueChartIntervalUnit.Day,
              usageMeterId: usageMeter.id,
              livemode: true,
            },
            transaction
          )
        })
      ).unwrap()

      expect(result).toHaveLength(2)
      expect(result[0].amount).toBe(1) // Day 1: user_1
      expect(result[1].amount).toBe(1) // Day 2: user_1 (counted again)
    })
  })

  describe('Security', () => {
    it('throws NOT_FOUND when meter belongs to different org', async () => {
      const { organization: org1, pricingModel: pm1 } =
        await setupOrg()
      const { organization: org2 } = await setupOrg()

      // Create meter in org1
      const usageMeter = await setupUsageMeter({
        organizationId: org1.id,
        name: 'API Calls',
        pricingModelId: pm1.id,
      })

      const startDate = new Date('2023-01-01T00:00:00.000Z')
      const endDate = new Date('2023-01-07T23:59:59.999Z')

      // Request from org2 should fail
      await expect(
        adminTransaction(async ({ transaction }) => {
          return calculateUsageVolumeByInterval(
            org2.id, // Different org
            {
              startDate,
              endDate,
              granularity: RevenueChartIntervalUnit.Day,
              usageMeterId: usageMeter.id,
              livemode: true,
            },
            transaction
          )
        })
      ).rejects.toThrow('Usage meter not found')
    })

    it('returns zeros when product belongs to different org (cross-tenant protection)', async () => {
      const {
        organization: org1,
        pricingModel: pm1,
        product: productInOrg1,
      } = await setupOrg()
      const { organization: org2, pricingModel: pm2 } =
        await setupOrg()

      // Create meter in org2
      const usageMeter = await setupUsageMeter({
        organizationId: org2.id,
        name: 'API Calls',
        pricingModelId: pm2.id,
      })

      const startDate = new Date('2023-01-01T00:00:00.000Z')
      const endDate = new Date('2023-01-07T23:59:59.999Z')

      // Request from org2 with product from org1 should return zeros
      // (product should not be found due to org validation)
      const result = (
        await adminTransaction(async ({ transaction }) => {
          return calculateUsageVolumeByInterval(
            org2.id,
            {
              startDate,
              endDate,
              granularity: RevenueChartIntervalUnit.Day,
              usageMeterId: usageMeter.id,
              productId: productInOrg1.id, // Product from different org
              livemode: true,
            },
            transaction
          )
        })
      ).unwrap()

      // Should return zeros - product from different org is effectively "not found"
      expect(result).toHaveLength(7)
      result.forEach((point) => {
        expect(point.amount).toBe(0)
      })
    })
  })

  describe('Product filter', () => {
    it('filters by pricingModelId when productId provided', async () => {
      const {
        organization,
        pricingModel: pm1,
        product: product1,
        price,
      } = await setupOrg()

      // Create second product with different pricing model
      const product2 = await setupProduct({
        organizationId: organization.id,
        name: 'Product 2',
        pricingModelId: pm1.id,
      })

      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        defaultPaymentMethodId: paymentMethod.id,
        priceId: price.id,
        status: SubscriptionStatus.Active,
      })
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'API Calls',
        pricingModelId: pm1.id,
        aggregationType: UsageMeterAggregationType.Sum,
      })

      // Create usage events for product1's pricing model
      await setupUsageEvent({
        organizationId: organization.id,
        customerId: customer.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        amount: 100,
        usageDate: new Date('2023-01-01T10:00:00.000Z').getTime(),
        transactionId: `tx_${core.nanoid()}`,
      })

      const startDate = new Date('2023-01-01T00:00:00.000Z')
      const endDate = new Date('2023-01-01T23:59:59.999Z')

      // Query with product filter - should find matching events
      const result = (
        await adminTransaction(async ({ transaction }) => {
          return calculateUsageVolumeByInterval(
            organization.id,
            {
              startDate,
              endDate,
              granularity: RevenueChartIntervalUnit.Day,
              usageMeterId: usageMeter.id,
              productId: product1.id,
              livemode: true,
            },
            transaction
          )
        })
      ).unwrap()

      expect(result).toHaveLength(1)
      expect(result[0].amount).toBe(100)
    })

    it('returns zeros when product not found', async () => {
      const { organization, pricingModel, price } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        defaultPaymentMethodId: paymentMethod.id,
        priceId: price.id,
        status: SubscriptionStatus.Active,
      })
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'API Calls',
        pricingModelId: pricingModel.id,
        aggregationType: UsageMeterAggregationType.Sum,
      })

      await setupUsageEvent({
        organizationId: organization.id,
        customerId: customer.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        amount: 100,
        usageDate: new Date('2023-01-01T10:00:00.000Z').getTime(),
        transactionId: `tx_${core.nanoid()}`,
      })

      const startDate = new Date('2023-01-01T00:00:00.000Z')
      const endDate = new Date('2023-01-01T23:59:59.999Z')

      // Query with non-existent productId
      const result = (
        await adminTransaction(async ({ transaction }) => {
          return calculateUsageVolumeByInterval(
            organization.id,
            {
              startDate,
              endDate,
              granularity: RevenueChartIntervalUnit.Day,
              usageMeterId: usageMeter.id,
              productId: 'prod_nonexistent',
              livemode: true,
            },
            transaction
          )
        })
      ).unwrap()

      expect(result).toHaveLength(1)
      expect(result[0].amount).toBe(0) // Zeros when product not found
    })
  })
})

describe('getUsageMetersWithEvents', () => {
  it('returns only meters with livemode events', async () => {
    const { organization, pricingModel, price } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })
    const subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      defaultPaymentMethodId: paymentMethod.id,
      priceId: price.id,
      status: SubscriptionStatus.Active,
    })

    // Meter A with livemode events
    const meterA = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Meter A - Has Events',
      pricingModelId: pricingModel.id,
    })
    await setupUsageEvent({
      organizationId: organization.id,
      customerId: customer.id,
      subscriptionId: subscription.id,
      usageMeterId: meterA.id,
      amount: 100,
      livemode: true,
      usageDate: new Date('2023-01-01T10:00:00.000Z').getTime(),
      transactionId: `tx_${core.nanoid()}`,
    })

    // Meter B with only testmode events
    const meterB = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Meter B - Only Testmode',
      pricingModelId: pricingModel.id,
    })
    await setupUsageEvent({
      organizationId: organization.id,
      customerId: customer.id,
      subscriptionId: subscription.id,
      usageMeterId: meterB.id,
      amount: 50,
      livemode: false,
      usageDate: new Date('2023-01-01T10:00:00.000Z').getTime(),
      transactionId: `tx_${core.nanoid()}`,
    })

    // Meter C with no events
    await setupUsageMeter({
      organizationId: organization.id,
      name: 'Meter C - No Events',
      pricingModelId: pricingModel.id,
    })

    const result = (
      await adminTransaction(async ({ transaction }) => {
        return getUsageMetersWithEvents(
          organization.id,
          true,
          transaction
        )
      })
    ).unwrap()

    // Only meter A should be returned
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(meterA.id)
    expect(result[0].name).toBe('Meter A - Has Events')
  })

  it('returns empty array when no meters have events', async () => {
    const { organization, pricingModel } = await setupOrg()

    // Create meter with no events
    await setupUsageMeter({
      organizationId: organization.id,
      name: 'Empty Meter',
      pricingModelId: pricingModel.id,
    })

    const result = (
      await adminTransaction(async ({ transaction }) => {
        return getUsageMetersWithEvents(
          organization.id,
          true,
          transaction
        )
      })
    ).unwrap()

    expect(result).toHaveLength(0)
  })

  it('returns empty array when organization has no customers', async () => {
    const { organization, pricingModel } = await setupOrg()

    await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Meter',
      pricingModelId: pricingModel.id,
    })

    // No customers created for this org
    const result = (
      await adminTransaction(async ({ transaction }) => {
        return getUsageMetersWithEvents(
          organization.id,
          true,
          transaction
        )
      })
    ).unwrap()

    expect(result).toHaveLength(0)
  })

  it('returns ALL meters with events regardless of pricingModel (decoupled)', async () => {
    const {
      organization,
      pricingModel: pm1,
      price: price1,
    } = await setupOrg()

    // Create a second pricing model within the same organization
    const pm2 = await setupPricingModel({
      organizationId: organization.id,
      name: 'Second Pricing Model',
    })

    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })
    const subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      defaultPaymentMethodId: paymentMethod.id,
      priceId: price1.id,
      status: SubscriptionStatus.Active,
    })

    // Meter for pricingModel 1
    const meterPM1 = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Meter PM1',
      pricingModelId: pm1.id,
    })
    await setupUsageEvent({
      organizationId: organization.id,
      customerId: customer.id,
      subscriptionId: subscription.id,
      usageMeterId: meterPM1.id,
      amount: 100,
      livemode: true,
      usageDate: new Date('2023-01-01T10:00:00.000Z').getTime(),
      transactionId: `tx_${core.nanoid()}`,
    })

    // Meter for pricingModel 2 (different pricing model)
    const meterPM2 = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Meter PM2',
      pricingModelId: pm2.id,
    })
    await setupUsageEvent({
      organizationId: organization.id,
      customerId: customer.id,
      subscriptionId: subscription.id,
      usageMeterId: meterPM2.id,
      amount: 50,
      livemode: true,
      usageDate: new Date('2023-01-01T10:00:00.000Z').getTime(),
      transactionId: `tx_${core.nanoid()}`,
    })

    // getUsageMetersWithEvents should return BOTH meters (decoupled from product filter)
    const result = (
      await adminTransaction(async ({ transaction }) => {
        return getUsageMetersWithEvents(
          organization.id,
          true,
          transaction
        )
      })
    ).unwrap()

    // Both meters should be returned regardless of their pricingModel
    expect(result).toHaveLength(2)
    const meterIds = result.map((m) => m.id)
    expect(meterIds).toContain(meterPM1.id)
    expect(meterIds).toContain(meterPM2.id)
  })

  it('includes pricingModelId in response', async () => {
    const { organization, pricingModel, price } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })
    const subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      defaultPaymentMethodId: paymentMethod.id,
      priceId: price.id,
      status: SubscriptionStatus.Active,
    })

    const meter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Meter',
      pricingModelId: pricingModel.id,
    })
    await setupUsageEvent({
      organizationId: organization.id,
      customerId: customer.id,
      subscriptionId: subscription.id,
      usageMeterId: meter.id,
      amount: 100,
      livemode: true,
      usageDate: new Date('2023-01-01T10:00:00.000Z').getTime(),
      transactionId: `tx_${core.nanoid()}`,
    })

    const result = (
      await adminTransaction(async ({ transaction }) => {
        return getUsageMetersWithEvents(
          organization.id,
          true,
          transaction
        )
      })
    ).unwrap()

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      id: meter.id,
      name: 'Test Meter',
      aggregationType: UsageMeterAggregationType.Sum,
      pricingModelId: pricingModel.id,
    })
  })

  it('returns aggregationType for each meter', async () => {
    const { organization, pricingModel, price } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })
    const subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      defaultPaymentMethodId: paymentMethod.id,
      priceId: price.id,
      status: SubscriptionStatus.Active,
    })

    // Sum meter
    const sumMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Sum Meter',
      pricingModelId: pricingModel.id,
      aggregationType: UsageMeterAggregationType.Sum,
    })
    await setupUsageEvent({
      organizationId: organization.id,
      customerId: customer.id,
      subscriptionId: subscription.id,
      usageMeterId: sumMeter.id,
      amount: 100,
      livemode: true,
      usageDate: new Date('2023-01-01T10:00:00.000Z').getTime(),
      transactionId: `tx_${core.nanoid()}`,
    })

    // CountDistinct meter
    const countMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Count Distinct Meter',
      pricingModelId: pricingModel.id,
      aggregationType:
        UsageMeterAggregationType.CountDistinctProperties,
    })
    await setupUsageEvent({
      organizationId: organization.id,
      customerId: customer.id,
      subscriptionId: subscription.id,
      usageMeterId: countMeter.id,
      amount: 1,
      livemode: true,
      usageDate: new Date('2023-01-01T10:00:00.000Z').getTime(),
      transactionId: `tx_${core.nanoid()}`,
    })

    const result = (
      await adminTransaction(async ({ transaction }) => {
        return getUsageMetersWithEvents(
          organization.id,
          true,
          transaction
        )
      })
    ).unwrap()

    expect(result).toHaveLength(2)

    const sumResult = result.find((m) => m.id === sumMeter.id)
    const countResult = result.find((m) => m.id === countMeter.id)

    expect(sumResult?.aggregationType).toBe(
      UsageMeterAggregationType.Sum
    )
    expect(countResult?.aggregationType).toBe(
      UsageMeterAggregationType.CountDistinctProperties
    )
  })
})
