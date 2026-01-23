import { beforeEach, describe, expect, it } from 'bun:test'
import {
  setupBillingPeriod,
  setupBillingRun,
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupSubscription,
  setupUsageMeter,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { BillingRun } from '@/db/schema/billingRuns'
import type { Customer } from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import type { Subscription } from '@/db/schema/subscriptions'
import type { UsageMeter } from '@/db/schema/usageMeters'
import {
  CurrencyCode,
  SubscriptionMeterPeriodCalculationStatus,
} from '@/types'
import { core } from '@/utils/core'
import { insertSubscriptionMeterPeriodCalculation } from './subscriptionMeterPeriodCalculationMethods'

describe('insertSubscriptionMeterPeriodCalculation', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let subscription: Subscription.Record
  let usageMeter: UsageMeter.Record
  let billingPeriod: BillingPeriod.Record
  let billingRun: BillingRun.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product
    price = orgData.price

    customer = await setupCustomer({
      organizationId: organization.id,
      email: `customer+${core.nanoid()}@test.com`,
      livemode: true,
    })

    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      livemode: true,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
      livemode: true,
    })

    usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Usage Meter',
      pricingModelId: pricingModel.id,
      livemode: true,
    })

    billingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now()),
    })

    billingRun = await setupBillingRun({
      billingPeriodId: billingPeriod.id,
      subscriptionId: subscription.id,
      paymentMethodId: paymentMethod.id,
      livemode: true,
    })
  })

  it('should successfully insert subscription meter period calculation and derive pricingModelId from usage meter', async () => {
    await adminTransaction(async ({ transaction }) => {
      const calculation =
        await insertSubscriptionMeterPeriodCalculation(
          {
            organizationId: organization.id,
            subscriptionId: subscription.id,
            usageMeterId: usageMeter.id,
            billingPeriodId: billingPeriod.id,
            billingRunId: billingRun.id,
            totalRawUsageAmount: 1000,
            creditsAppliedAmount: 0,
            netBilledAmount: 1000,
            status: SubscriptionMeterPeriodCalculationStatus.Active,
            calculatedAt: Date.now(),
            livemode: true,
          },
          transaction
        )

      // Verify pricingModelId is correctly derived from usage meter
      expect(calculation.pricingModelId).toBe(
        usageMeter.pricingModelId
      )
      expect(calculation.pricingModelId).toBe(pricingModel.id)
    })
  })

  it('should use provided pricingModelId without derivation', async () => {
    await adminTransaction(async ({ transaction }) => {
      const calculation =
        await insertSubscriptionMeterPeriodCalculation(
          {
            organizationId: organization.id,
            subscriptionId: subscription.id,
            usageMeterId: usageMeter.id,
            billingPeriodId: billingPeriod.id,
            billingRunId: billingRun.id,
            totalRawUsageAmount: 1000,
            creditsAppliedAmount: 0,
            netBilledAmount: 1000,
            status: SubscriptionMeterPeriodCalculationStatus.Active,
            calculatedAt: Date.now(),
            livemode: true,
            pricingModelId: pricingModel.id, // Pre-provided
          },
          transaction
        )

      // Verify the provided pricingModelId is used
      expect(calculation.pricingModelId).toBe(pricingModel.id)
    })
  })

  it('should throw an error when usageMeterId does not exist', async () => {
    await adminTransaction(async ({ transaction }) => {
      const nonExistentUsageMeterId = `um_${core.nanoid()}`

      await expect(
        insertSubscriptionMeterPeriodCalculation(
          {
            organizationId: organization.id,
            subscriptionId: subscription.id,
            usageMeterId: nonExistentUsageMeterId,
            billingPeriodId: billingPeriod.id,
            billingRunId: billingRun.id,
            totalRawUsageAmount: 1000,
            creditsAppliedAmount: 0,
            netBilledAmount: 1000,
            status: SubscriptionMeterPeriodCalculationStatus.Active,
            calculatedAt: Date.now(),
            livemode: true,
          },
          transaction
        )
      ).rejects.toThrow()
    })
  })
})
