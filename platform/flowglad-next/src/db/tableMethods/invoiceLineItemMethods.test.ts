import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupCustomer,
  setupInvoice,
  setupOrg,
  setupPrice,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  CurrencyCode,
  InvoiceStatus,
  PriceType,
  SubscriptionItemType,
} from '@/types'
import core from '@/utils/core'
import type { Customer } from '../schema/customers'
import type { Invoice } from '../schema/invoices'
import type { Organization } from '../schema/organizations'
import type { Price } from '../schema/prices'
import type { PricingModel } from '../schema/pricingModels'
import type { Product } from '../schema/products'
import {
  derivePricingModelIdForInvoiceLineItem,
  insertInvoiceLineItem,
  insertInvoiceLineItems,
} from './invoiceLineItemMethods'

describe('pricingModelId derivation', () => {
  describe('derivePricingModelIdForInvoiceLineItem', () => {
    let organization: Organization.Record
    let pricingModel: PricingModel.Record
    let product: Product.Record
    let price: Price.Record
    let customer: Customer.Record
    let invoice: Invoice.Record

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

      invoice = await setupInvoice({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: InvoiceStatus.Draft,
      })
    })

    it('should derive pricingModelId from invoice when invoiceId is provided', async () => {
      await adminTransaction(async ({ transaction }) => {
        const derivedPricingModelId =
          await derivePricingModelIdForInvoiceLineItem(
            {
              invoiceId: invoice.id,
              priceId: price.id,
            },
            transaction
          )

        expect(derivedPricingModelId).toBe(invoice.pricingModelId)
        expect(derivedPricingModelId).toBe(pricingModel.id)
      })
    })

    it('should derive pricingModelId from price when only priceId is provided', async () => {
      await adminTransaction(async ({ transaction }) => {
        const derivedPricingModelId =
          await derivePricingModelIdForInvoiceLineItem(
            {
              invoiceId: null,
              priceId: price.id,
            },
            transaction
          )

        expect(derivedPricingModelId).toBe(price.pricingModelId)
        expect(derivedPricingModelId).toBe(product.pricingModelId)
        expect(derivedPricingModelId).toBe(pricingModel.id)
      })
    })

    it('should throw error when both invoiceId and priceId are null', async () => {
      await adminTransaction(async ({ transaction }) => {
        await expect(
          derivePricingModelIdForInvoiceLineItem(
            {
              invoiceId: null,
              priceId: null,
            },
            transaction
          )
        ).rejects.toThrow(
          'Cannot derive pricingModelId for invoice line item: both invoiceId and priceId are null'
        )
      })
    })
  })

  describe('insertInvoiceLineItem', () => {
    let organization: Organization.Record
    let pricingModel: PricingModel.Record
    let product: Product.Record
    let price: Price.Record
    let customer: Customer.Record
    let invoice: Invoice.Record

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

      invoice = await setupInvoice({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: InvoiceStatus.Draft,
      })
    })

    it('should successfully insert invoice line item and derive pricingModelId from invoice', async () => {
      await adminTransaction(async ({ transaction }) => {
        const invoiceLineItem = await insertInvoiceLineItem(
          {
            invoiceId: invoice.id,
            quantity: 1,
            price: 1000,
            priceId: price.id,
            description: 'Test line item',
            type: SubscriptionItemType.Static,
            livemode: true,
          },
          transaction
        )

        // Verify pricingModelId is correctly derived from invoice
        expect(invoiceLineItem.pricingModelId).toBe(
          invoice.pricingModelId
        )
        expect(invoiceLineItem.pricingModelId).toBe(pricingModel.id)
      })
    })

    it('should throw an error when invoiceId is invalid and priceId is null', async () => {
      await adminTransaction(async ({ transaction }) => {
        await expect(
          insertInvoiceLineItem(
            {
              invoiceId: 'invalid_invoice_id',
              quantity: 1,
              price: 1000,
              priceId: null,
              description: 'Test line item',
              type: SubscriptionItemType.Static,
              livemode: true,
            },
            transaction
          )
        ).rejects.toThrow()
      })
    })

    it('should use provided pricingModelId without derivation', async () => {
      await adminTransaction(async ({ transaction }) => {
        const invoiceLineItem = await insertInvoiceLineItem(
          {
            invoiceId: invoice.id,
            quantity: 1,
            price: 1000,
            priceId: price.id,
            description: 'Test line item',
            type: SubscriptionItemType.Static,
            livemode: true,
            pricingModelId: pricingModel.id, // explicitly provided
          },
          transaction
        )

        // Verify the provided pricingModelId is used
        expect(invoiceLineItem.pricingModelId).toBe(pricingModel.id)
      })
    })
  })

  describe('insertInvoiceLineItems', () => {
    let organization: Organization.Record
    let pricingModel: PricingModel.Record
    let product: Product.Record
    let price1: Price.Record
    let price2: Price.Record
    let customer: Customer.Record
    let invoice: Invoice.Record

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

      invoice = await setupInvoice({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price1.id,
        status: InvoiceStatus.Draft,
      })
    })

    it('should bulk insert invoice line items and derive pricingModelId for each', async () => {
      await adminTransaction(async ({ transaction }) => {
        const invoiceLineItems = await insertInvoiceLineItems(
          [
            {
              invoiceId: invoice.id,
              quantity: 1,
              price: 1000,
              priceId: price1.id,
              description: 'Test line item 1',
              type: SubscriptionItemType.Static,
              livemode: true,
            },
            {
              invoiceId: invoice.id,
              quantity: 2,
              price: 2000,
              priceId: price2.id,
              description: 'Test line item 2',
              type: SubscriptionItemType.Static,
              livemode: true,
            },
          ],
          transaction
        )

        expect(invoiceLineItems).toHaveLength(2)

        // Verify pricingModelId is correctly derived for each invoice line item
        expect(invoiceLineItems[0]!.pricingModelId).toBe(
          price1.pricingModelId
        )
        expect(invoiceLineItems[0]!.pricingModelId).toBe(
          invoice.pricingModelId
        )
        expect(invoiceLineItems[0]!.pricingModelId).toBe(
          pricingModel.id
        )

        expect(invoiceLineItems[1]!.pricingModelId).toBe(
          price2.pricingModelId
        )
        expect(invoiceLineItems[1]!.pricingModelId).toBe(
          invoice.pricingModelId
        )
        expect(invoiceLineItems[1]!.pricingModelId).toBe(
          pricingModel.id
        )
      })
    })

    it('should throw error when one invoice line item has invalid invoiceId and null priceId', async () => {
      await adminTransaction(async ({ transaction }) => {
        await expect(
          insertInvoiceLineItems(
            [
              {
                invoiceId: invoice.id,
                quantity: 1,
                price: 1000,
                priceId: price1.id,
                description: 'Valid line item',
                type: SubscriptionItemType.Static,
                livemode: true,
              },
              {
                invoiceId: 'invalid_invoice_id',
                quantity: 2,
                price: 2000,
                priceId: null,
                description: 'Invalid line item',
                type: SubscriptionItemType.Static,
                livemode: true,
              },
            ],
            transaction
          )
        ).rejects.toThrow()
      })
    })
  })
})
