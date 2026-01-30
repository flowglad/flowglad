import { beforeEach, describe, expect, it } from 'bun:test'
import {
  CurrencyCode,
  PriceType,
  PurchaseStatus,
} from '@db-core/enums'
import type { Customer } from '@db-core/schema/customers'
import type { Organization } from '@db-core/schema/organizations'
import type { Price } from '@db-core/schema/prices'
import type { PricingModel } from '@db-core/schema/pricingModels'
import type { Product } from '@db-core/schema/products'
import type { Purchase } from '@db-core/schema/purchases'
import {
  setupCustomer,
  setupOrg,
  setupPrice,
  setupPurchase,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { core } from '@/utils/core'
import {
  bulkInsertPurchases,
  derivePricingModelIdFromPurchase,
  insertPurchase,
  selectPurchasesByCustomerId,
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

  it('should throw an error when priceId does not exist', async () => {
    await adminTransaction(async ({ transaction }) => {
      const nonExistentPriceId = `price_${core.nanoid()}`

      await expect(
        insertPurchase(
          {
            organizationId: organization.id,
            customerId: customer.id,
            priceId: nonExistentPriceId,
            livemode: true,
            name: 'Test Purchase',
            priceType: PriceType.SinglePayment,
            totalPurchaseValue: 1000,
            quantity: 1,
            firstInvoiceValue: 1000,
            status: PurchaseStatus.Paid,
            pricePerBillingCycle: null,
            intervalUnit: null,
            intervalCount: null,
            trialPeriodDays: null,
          },
          transaction
        )
      ).rejects.toThrow()
    })
  })

  it('should use provided pricingModelId without derivation', async () => {
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
          pricingModelId: pricingModel.id, // explicitly provided
        },
        transaction
      )

      // Verify the provided pricingModelId is used
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
      const purchases = (
        await bulkInsertPurchases(
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
      ).unwrap()

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

  it('should use provided pricingModelId without derivation', async () => {
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
          pricingModelId: pricingModel.id, // explicitly provided
        },
        transaction
      )

      // Verify the provided pricingModelId is used
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

describe('derivePricingModelIdFromPurchase', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let purchase: Purchase.Record

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

    purchase = await setupPurchase({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
    })
  })

  it('should derive pricingModelId from an existing purchase', async () => {
    await adminTransaction(async ({ transaction }) => {
      const derivedPricingModelId =
        await derivePricingModelIdFromPurchase(
          purchase.id,
          transaction
        )

      expect(derivedPricingModelId).toBe(pricingModel.id)
      expect(derivedPricingModelId).toBe(purchase.pricingModelId)
    })
  })

  it('should throw error when purchase does not exist', async () => {
    await adminTransaction(async ({ transaction }) => {
      const nonExistentPurchaseId = `purchase_${core.nanoid()}`

      await expect(
        derivePricingModelIdFromPurchase(
          nonExistentPurchaseId,
          transaction
        )
      ).rejects.toThrow()
    })
  })
})

describe('selectPurchasesByCustomerId', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let purchase: Purchase.Record

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
      email: `test+${core.nanoid()}@test.com`,
      livemode: true,
    })

    purchase = await setupPurchase({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
    })
  })

  it('should return purchase records for a customer', async () => {
    await adminTransaction(async ({ transaction }) => {
      const purchases = await selectPurchasesByCustomerId(
        customer.id,
        transaction,
        true
      )

      expect(purchases.length).toBeGreaterThanOrEqual(1)
      const foundPurchase = purchases.find(
        (p) => p.id === purchase.id
      )
      expect(foundPurchase).toMatchObject({
        id: purchase.id,
        customerId: customer.id,
        priceId: price.id,
        pricingModelId: pricingModel.id,
      })
    })
  })

  it('should return empty array when customer has no purchases', async () => {
    const customerWithNoPurchases = await setupCustomer({
      organizationId: organization.id,
      email: `empty+${core.nanoid()}@test.com`,
      livemode: true,
    })

    await adminTransaction(async ({ transaction }) => {
      const purchases = await selectPurchasesByCustomerId(
        customerWithNoPurchases.id,
        transaction,
        true
      )

      expect(purchases).toEqual([])
    })
  })

  it('should only return purchases for the specified customer', async () => {
    const otherCustomer = await setupCustomer({
      organizationId: organization.id,
      email: `other+${core.nanoid()}@test.com`,
      livemode: true,
    })

    const otherPurchase = await setupPurchase({
      organizationId: organization.id,
      customerId: otherCustomer.id,
      priceId: price.id,
    })

    await adminTransaction(async ({ transaction }) => {
      const purchases = await selectPurchasesByCustomerId(
        customer.id,
        transaction,
        true
      )

      const customerPurchaseIds = purchases.map((p) => p.id)
      expect(customerPurchaseIds).toContain(purchase.id)
      expect(customerPurchaseIds).not.toContain(otherPurchase.id)
    })
  })
})
