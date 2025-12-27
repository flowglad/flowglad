import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupCustomer,
  setupOrg,
  setupPrice,
  setupSubscription,
  setupUsageCredit,
  setupUsageCreditBalanceAdjustment,
  setupUsageMeter,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { CurrencyCode, PriceType, UsageCreditType } from '@/types'
import { core } from '@/utils/core'
import type { Customer } from '../schema/customers'
import type { Organization } from '../schema/organizations'
import type { Price } from '../schema/prices'
import type { PricingModel } from '../schema/pricingModels'
import type { Product } from '../schema/products'
import type { Subscription } from '../schema/subscriptions'
import type { UsageCredit } from '../schema/usageCredits'
import type { UsageMeter } from '../schema/usageMeters'
import { insertUsageCreditBalanceAdjustment } from './usageCreditBalanceAdjustmentMethods'

describe('insertUsageCreditBalanceAdjustment', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let subscription: Subscription.Record
  let usageMeter: UsageMeter.Record
  let usageCredit: UsageCredit.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product

    price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      unitPrice: 1000,
      type: PriceType.SinglePayment,
      livemode: true,
      isDefault: false,
      currency: CurrencyCode.USD,
    })

    customer = await setupCustomer({
      organizationId: organization.id,
      email: 'test@test.com',
      livemode: true,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      livemode: true,
    })

    usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Usage Meter',
      pricingModelId: pricingModel.id,
      livemode: true,
    })

    usageCredit = await setupUsageCredit({
      organizationId: organization.id,
      usageMeterId: usageMeter.id,
      subscriptionId: subscription.id,
      creditType: UsageCreditType.Grant,
      livemode: true,
      issuedAmount: 1000,
    })
  })

  it('should successfully insert usage credit balance adjustment and derive pricingModelId from usage credit', async () => {
    await adminTransaction(async ({ transaction }) => {
      const usageCreditBalanceAdjustment =
        await insertUsageCreditBalanceAdjustment(
          {
            organizationId: organization.id,
            adjustedUsageCreditId: usageCredit.id,
            usageMeterId: usageMeter.id,
            amountAdjusted: 100,
            adjustmentInitiatedAt: Date.now(),
            reason: 'Test adjustment',
            livemode: true,
          },
          transaction
        )

      // Verify pricingModelId is correctly derived from usage credit
      expect(usageCreditBalanceAdjustment.pricingModelId).toBe(
        usageCredit.pricingModelId
      )
      expect(usageCreditBalanceAdjustment.pricingModelId).toBe(
        usageMeter.pricingModelId
      )
      expect(usageCreditBalanceAdjustment.pricingModelId).toBe(
        pricingModel.id
      )
    })
  })
})

describe('setupUsageCreditBalanceAdjustment', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let subscription: Subscription.Record
  let usageMeter: UsageMeter.Record
  let usageCredit: UsageCredit.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product

    price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      unitPrice: 1000,
      type: PriceType.SinglePayment,
      livemode: true,
      isDefault: false,
      currency: CurrencyCode.USD,
    })

    customer = await setupCustomer({
      organizationId: organization.id,
      email: 'test@test.com',
      livemode: true,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      livemode: true,
    })

    usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Usage Meter',
      pricingModelId: pricingModel.id,
      livemode: true,
    })

    usageCredit = await setupUsageCredit({
      organizationId: organization.id,
      usageMeterId: usageMeter.id,
      subscriptionId: subscription.id,
      creditType: UsageCreditType.Grant,
      livemode: true,
      issuedAmount: 1000,
    })
  })

  it('should create usage credit balance adjustment via setupUsageCreditBalanceAdjustment and verify pricingModelId', async () => {
    const usageCreditBalanceAdjustment =
      await setupUsageCreditBalanceAdjustment({
        organizationId: organization.id,
        adjustedUsageCreditId: usageCredit.id,
        amountAdjusted: 100,
        usageMeterId: usageMeter.id,
        reason: 'Test adjustment',
        livemode: true,
      })

    // Verify pricingModelId is correctly derived from usage credit
    expect(usageCreditBalanceAdjustment.pricingModelId).toBe(
      usageCredit.pricingModelId
    )
    expect(usageCreditBalanceAdjustment.pricingModelId).toBe(
      usageMeter.pricingModelId
    )
    expect(usageCreditBalanceAdjustment.pricingModelId).toBe(
      pricingModel.id
    )
  })
})
