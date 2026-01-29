import { beforeEach, describe, expect, it } from 'bun:test'
import { Result } from 'better-result'
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
  selectCustomerFacingInvoicesWithLineItems,
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
      const orgData = (await setupOrg()).unwrap()
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

      customer = (
        await setupCustomer({
          organizationId: organization.id,
          email: 'test@test.com',
          livemode: true,
        })
      ).unwrap()

      invoice = (
        await setupInvoice({
          organizationId: organization.id,
          customerId: customer.id,
          priceId: price.id,
          status: InvoiceStatus.Draft,
        })
      ).unwrap()
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
      const orgData = (await setupOrg()).unwrap()
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

      customer = (
        await setupCustomer({
          organizationId: organization.id,
          email: 'test@test.com',
          livemode: true,
        })
      ).unwrap()

      invoice = (
        await setupInvoice({
          organizationId: organization.id,
          customerId: customer.id,
          priceId: price.id,
          status: InvoiceStatus.Draft,
        })
      ).unwrap()
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
      const orgData = (await setupOrg()).unwrap()
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

      customer = (
        await setupCustomer({
          organizationId: organization.id,
          email: 'test@test.com',
          livemode: true,
        })
      ).unwrap()

      invoice = (
        await setupInvoice({
          organizationId: organization.id,
          customerId: customer.id,
          priceId: price1.id,
          status: InvoiceStatus.Draft,
        })
      ).unwrap()
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

describe('selectCustomerFacingInvoicesWithLineItems', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let invoice: Invoice.Record

  beforeEach(async () => {
    const orgData = (await setupOrg()).unwrap()
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

    customer = (
      await setupCustomer({
        organizationId: organization.id,
        email: `test+${core.nanoid()}@test.com`,
        livemode: true,
      })
    ).unwrap()

    // Create invoice with customer-facing status (Paid)
    invoice = (
      await setupInvoice({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: InvoiceStatus.Paid,
      })
    ).unwrap()
  })

  it('should return invoices with line items for a customer with customer-facing statuses', async () => {
    await adminTransaction(async ({ transaction }) => {
      const result = await selectCustomerFacingInvoicesWithLineItems(
        customer.id,
        transaction,
        true
      )

      expect(result.length).toBeGreaterThanOrEqual(1)
      const foundInvoice = result.find(
        (item) => item.invoice.id === invoice.id
      )
      expect(foundInvoice).toMatchObject({
        invoice: {
          id: invoice.id,
          customerId: customer.id,
          pricingModelId: pricingModel.id,
          status: InvoiceStatus.Paid,
        },
        invoiceLineItems: expect.any(Array),
      })
    })
  })

  it('should return empty array when customer has no invoices', async () => {
    const customerWithNoInvoices = (
      await setupCustomer({
        organizationId: organization.id,
        email: `empty+${core.nanoid()}@test.com`,
        livemode: true,
      })
    ).unwrap()

    await adminTransaction(async ({ transaction }) => {
      const result = await selectCustomerFacingInvoicesWithLineItems(
        customerWithNoInvoices.id,
        transaction,
        true
      )

      expect(result).toEqual([])
    })
  })

  it('should not return invoices with Draft status', async () => {
    // Create a draft invoice (not customer-facing)
    const draftInvoice = (
      await setupInvoice({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: InvoiceStatus.Draft,
      })
    ).unwrap()

    await adminTransaction(async ({ transaction }) => {
      const result = await selectCustomerFacingInvoicesWithLineItems(
        customer.id,
        transaction,
        true
      )

      const invoiceIds = result.map((item) => item.invoice.id)
      // Should include the Paid invoice
      expect(invoiceIds).toContain(invoice.id)
      // Should NOT include the Draft invoice
      expect(invoiceIds).not.toContain(draftInvoice.id)
    })
  })

  it('should only return invoices for the specified customer', async () => {
    const otherCustomer = (
      await setupCustomer({
        organizationId: organization.id,
        email: `other+${core.nanoid()}@test.com`,
        livemode: true,
      })
    ).unwrap()

    const otherInvoice = (
      await setupInvoice({
        organizationId: organization.id,
        customerId: otherCustomer.id,
        priceId: price.id,
        status: InvoiceStatus.Paid,
      })
    ).unwrap()

    await adminTransaction(async ({ transaction }) => {
      const result = await selectCustomerFacingInvoicesWithLineItems(
        customer.id,
        transaction,
        true
      )

      const invoiceIds = result.map((item) => item.invoice.id)
      expect(invoiceIds).toContain(invoice.id)
      expect(invoiceIds).not.toContain(otherInvoice.id)
    })
  })
})
