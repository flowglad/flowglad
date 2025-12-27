import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupCustomer,
  setupOrg,
  setupPrice,
  setupPurchase,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { CurrencyCode, PriceType, PurchaseStatus } from '@/types'
import { core } from '@/utils/core'
import type { Customer } from '../schema/customers'
import type { Organization } from '../schema/organizations'
import type { Price } from '../schema/prices'
import type { PricingModel } from '../schema/pricingModels'
import type { Product } from '../schema/products'
import type { Purchase } from '../schema/purchases'
import {
  bulkInsertPurchases,
  insertPurchase,
  upsertPurchaseById,
} from './purchaseMethods'

describe('insertPurchase', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record

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
  })

  it('should successfully insert purchase and derive pricingModelId from price', async () => {
    await adminTransaction(async ({ transaction }) => {
      const purchase = await insertPurchase(
        {
          organizationId: organization.id,
          customerId: customer.id,
          priceId: price.id,
          livemode: true,
          name: 'Test Purchase',
          priceType: PriceType.SinglePayment,
          totalPurchaseValue: price.unitPrice,
          quantity: 1,
          firstInvoiceValue: price.unitPrice,
          status: PurchaseStatus.Paid,
          pricePerBillingCycle: null,
          intervalUnit: null,
          intervalCount: null,
          trialPeriodDays: null,
        },
        transaction
      )

      // Verify pricingModelId is correctly derived from price's product
      expect(purchase.pricingModelId).toBe(price.pricingModelId)
      expect(purchase.pricingModelId).toBe(product.pricingModelId)
      expect(purchase.pricingModelId).toBe(pricingModel.id)
    })
  })
})

describe('bulkInsertPurchases', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price1: Price.Record
  let price2: Price.Record
  let customer: Customer.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product

    price1 = await setupPrice({
      productId: product.id,
      name: 'Test Price 1',
      unitPrice: 1000,
      type: PriceType.SinglePayment,
      livemode: true,
      isDefault: false,
      currency: CurrencyCode.USD,
    })

    price2 = await setupPrice({
      productId: product.id,
      name: 'Test Price 2',
      unitPrice: 2000,
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
  })

  it('should bulk insert purchases and derive pricingModelId for each', async () => {
    await adminTransaction(async ({ transaction }) => {
      const purchases = await bulkInsertPurchases(
        [
          {
            organizationId: organization.id,
            customerId: customer.id,
            priceId: price1.id,
            livemode: true,
            name: 'Test Purchase 1',
            priceType: PriceType.SinglePayment,
            totalPurchaseValue: price1.unitPrice,
            quantity: 1,
            firstInvoiceValue: price1.unitPrice,
            status: PurchaseStatus.Paid,
            pricePerBillingCycle: null,
            intervalUnit: null,
            intervalCount: null,
            trialPeriodDays: null,
          },
          {
            organizationId: organization.id,
            customerId: customer.id,
            priceId: price2.id,
            livemode: true,
            name: 'Test Purchase 2',
            priceType: PriceType.SinglePayment,
            totalPurchaseValue: price2.unitPrice,
            quantity: 1,
            firstInvoiceValue: price2.unitPrice,
            status: PurchaseStatus.Paid,
            pricePerBillingCycle: null,
            intervalUnit: null,
            intervalCount: null,
            trialPeriodDays: null,
          },
        ],
        transaction
      )

      expect(purchases).toHaveLength(2)

      // Verify pricingModelId is correctly derived for each purchase
      expect(purchases[0]!.pricingModelId).toBe(price1.pricingModelId)
      expect(purchases[0]!.pricingModelId).toBe(pricingModel.id)

      expect(purchases[1]!.pricingModelId).toBe(price2.pricingModelId)
      expect(purchases[1]!.pricingModelId).toBe(pricingModel.id)
    })
  })
})

describe('upsertPurchaseById', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record

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
  })

  it('should upsert purchase and derive pricingModelId from price', async () => {
    await adminTransaction(async ({ transaction }) => {
      const purchase = await upsertPurchaseById(
        {
          organizationId: organization.id,
          customerId: customer.id,
          priceId: price.id,
          livemode: true,
          name: 'Test Purchase',
          priceType: PriceType.SinglePayment,
          totalPurchaseValue: price.unitPrice,
          quantity: 1,
          firstInvoiceValue: price.unitPrice,
          status: PurchaseStatus.Paid,
          pricePerBillingCycle: null,
          intervalUnit: null,
          intervalCount: null,
          trialPeriodDays: null,
        },
        transaction
      )

      // Verify pricingModelId is correctly derived from price's product
      expect(purchase.pricingModelId).toBe(price.pricingModelId)
      expect(purchase.pricingModelId).toBe(product.pricingModelId)
      expect(purchase.pricingModelId).toBe(pricingModel.id)
    })
  })
})

describe('setupPurchase', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record

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
  })

  it('should create purchase via setupPurchase and verify pricingModelId', async () => {
    const purchase = await setupPurchase({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
    })

    // Verify pricingModelId is correctly derived
    expect(purchase.pricingModelId).toBe(price.pricingModelId)
    expect(purchase.pricingModelId).toBe(product.pricingModelId)
    expect(purchase.pricingModelId).toBe(pricingModel.id)
  })
})
