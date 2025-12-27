import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupCustomer,
  setupOrg,
  setupPrice,
  setupSubscription,
  setupUsageCredit,
  setupUsageMeter,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  CurrencyCode,
  PriceType,
  UsageCreditSourceReferenceType,
  UsageCreditStatus,
  UsageCreditType,
} from '@/types'
import { core } from '@/utils/core'
import type { Customer } from '../schema/customers'
import type { Organization } from '../schema/organizations'
import type { Price } from '../schema/prices'
import type { PricingModel } from '../schema/pricingModels'
import type { Product } from '../schema/products'
import type { Subscription } from '../schema/subscriptions'
import type { UsageCredit } from '../schema/usageCredits'
import type { UsageMeter } from '../schema/usageMeters'
import { insertUsageCredit } from './usageCreditMethods'

describe('insertUsageCredit', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let subscription: Subscription.Record
  let usageMeter: UsageMeter.Record

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
  })

  it('should successfully insert usage credit and derive pricingModelId from usage meter', async () => {
    await adminTransaction(async ({ transaction }) => {
      const usageCredit = await insertUsageCredit(
        {
          organizationId: organization.id,
          usageMeterId: usageMeter.id,
          subscriptionId: subscription.id,
          creditType: UsageCreditType.Grant,
          livemode: true,
          issuedAmount: 1000,
          issuedAt: Date.now(),
          status: UsageCreditStatus.Posted,
          sourceReferenceId: `src_ref_${core.nanoid()}`,
          sourceReferenceType:
            UsageCreditSourceReferenceType.InvoiceSettlement,
          notes: 'Test usage credit',
          metadata: {},
          paymentId: null,
        },
        transaction
      )

      // Verify pricingModelId is correctly derived from usage meter
      expect(usageCredit.pricingModelId).toBe(
        usageMeter.pricingModelId
      )
      expect(usageCredit.pricingModelId).toBe(pricingModel.id)
    })
  })
})

describe('setupUsageCredit', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let subscription: Subscription.Record
  let usageMeter: UsageMeter.Record

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
  })

  it('should create usage credit via setupUsageCredit and verify pricingModelId', async () => {
    const usageCredit = await setupUsageCredit({
      organizationId: organization.id,
      usageMeterId: usageMeter.id,
      subscriptionId: subscription.id,
      creditType: UsageCreditType.Grant,
      livemode: true,
      issuedAmount: 1000,
    })

    // Verify pricingModelId is correctly derived from usage meter
    expect(usageCredit.pricingModelId).toBe(usageMeter.pricingModelId)
    expect(usageCredit.pricingModelId).toBe(pricingModel.id)
  })
})
