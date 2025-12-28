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
import {
  derivePricingModelIdFromPrice,
  derivePricingModelIdFromProduct,
} from './priceMethods'
import { derivePricingModelIdFromUsageCredit } from './usageCreditMethods'
import { derivePricingModelIdFromUsageMeter } from './usageMeterMethods'

describe('derivePricingModelIdFromProduct', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product
  })

  it('should successfully derive pricingModelId when product has pricingModelId', async () => {
    await adminTransaction(async ({ transaction }) => {
      const derivedPricingModelId =
        await derivePricingModelIdFromProduct(product.id, transaction)

      expect(derivedPricingModelId).toBe(product.pricingModelId)
      expect(derivedPricingModelId).toBe(pricingModel.id)
    })
  })

  // Note: We skip testing the case where product.pricingModelId is null because
  // the database schema enforces NOT NULL constraint on pricing_model_id.
  // This scenario cannot occur in production, so testing it would require
  // bypassing database constraints which is not a realistic test case.

  it('should throw an error when product does not exist', async () => {
    await adminTransaction(async ({ transaction }) => {
      const nonExistentProductId = `prod_${core.nanoid()}`

      await expect(
        derivePricingModelIdFromProduct(
          nonExistentProductId,
          transaction
        )
      ).rejects.toThrow()
    })
  })
})

describe('derivePricingModelIdFromUsageMeter', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let usageMeter: UsageMeter.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel

    usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Usage Meter',
      pricingModelId: pricingModel.id,
      livemode: true,
    })
  })

  it('should successfully derive pricingModelId when usage meter has pricingModelId', async () => {
    await adminTransaction(async ({ transaction }) => {
      const derivedPricingModelId =
        await derivePricingModelIdFromUsageMeter(
          usageMeter.id,
          transaction
        )

      expect(derivedPricingModelId).toBe(usageMeter.pricingModelId)
      expect(derivedPricingModelId).toBe(pricingModel.id)
    })
  })

  // Note: We skip testing the case where usageMeter.pricingModelId is null because
  // the database schema enforces NOT NULL constraint on pricing_model_id.
  // This scenario cannot occur in production, so testing it would require
  // bypassing database constraints which is not a realistic test case.

  it('should throw an error when usage meter does not exist', async () => {
    await adminTransaction(async ({ transaction }) => {
      const nonExistentUsageMeterId = `um_${core.nanoid()}`

      await expect(
        derivePricingModelIdFromUsageMeter(
          nonExistentUsageMeterId,
          transaction
        )
      ).rejects.toThrow()
    })
  })
})

describe('derivePricingModelIdFromPrice', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product

    price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      type: PriceType.SinglePayment,
      unitPrice: 1000,
      livemode: true,
      isDefault: true,
      active: true,
    })
  })

  it('should successfully derive pricingModelId from price via product', async () => {
    await adminTransaction(async ({ transaction }) => {
      const derivedPricingModelId =
        await derivePricingModelIdFromPrice(price.id, transaction)

      expect(derivedPricingModelId).toBe(product.pricingModelId)
      expect(derivedPricingModelId).toBe(pricingModel.id)
    })
  })

  it('should throw an error when price does not exist', async () => {
    await adminTransaction(async ({ transaction }) => {
      const nonExistentPriceId = `price_${core.nanoid()}`

      await expect(
        derivePricingModelIdFromPrice(nonExistentPriceId, transaction)
      ).rejects.toThrow()
    })
  })
})

describe('derivePricingModelIdFromUsageCredit', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let usageMeter: UsageMeter.Record
  let subscription: Subscription.Record
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

    usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Usage Meter',
      pricingModelId: pricingModel.id,
      livemode: true,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
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

  it('should successfully derive pricingModelId from usage credit', async () => {
    await adminTransaction(async ({ transaction }) => {
      const derivedPricingModelId =
        await derivePricingModelIdFromUsageCredit(
          usageCredit.id,
          transaction
        )

      expect(derivedPricingModelId).toBe(usageCredit.pricingModelId)
      expect(derivedPricingModelId).toBe(pricingModel.id)
    })
  })

  it('should throw an error when usage credit does not exist', async () => {
    await adminTransaction(async ({ transaction }) => {
      const nonExistentUsageCreditId = `uc_${core.nanoid()}`

      await expect(
        derivePricingModelIdFromUsageCredit(
          nonExistentUsageCreditId,
          transaction
        )
      ).rejects.toThrow()
    })
  })
})
