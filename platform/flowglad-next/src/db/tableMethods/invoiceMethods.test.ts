import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import { selectInvoicesTableRowData } from './invoiceMethods'
import {
  setupOrg,
  setupCustomer,
  setupInvoice,
  setupInvoiceLineItem,
  setupPrice,
  setupProduct,
} from '@/../seedDatabase'
import {
  InvoiceStatus,
  InvoiceType,
  PriceType,
  IntervalUnit,
  CurrencyCode,
} from '@/types'
import core from '@/utils/core'

describe('selectInvoicesTableRowData', () => {
  let org1Id: string
  let org2Id: string
  let customer1Id: string
  let customer2Id: string
  let invoice1Id: string
  let invoice2Id: string
  let invoice3Id: string
  let priceId: string

  beforeEach(async () => {
    // Set up organizations
    const { organization: org1, catalog } = await setupOrg()
    const { organization: org2 } = await setupOrg()
    org1Id = org1.id
    org2Id = org2.id

    // Set up product
    const product = await setupProduct({
      organizationId: org1Id,
      name: 'Test Product',
      livemode: true,
      catalogId: catalog.id,
    })

    // Set up price
    const price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      type: PriceType.Subscription,
      unitPrice: 1000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: true,
      setupFeeAmount: 0,
      trialPeriodDays: 0,
      currency: CurrencyCode.USD,
    })
    priceId = price.id

    // Set up customers
    const customer1 = await setupCustomer({ organizationId: org1Id })
    const customer2 = await setupCustomer({ organizationId: org2Id })
    customer1Id = customer1.id
    customer2Id = customer2.id

    // Set up invoices
    const invoice1 = await setupInvoice({
      customerId: customer1Id,
      organizationId: org1Id,
      status: InvoiceStatus.Open,
      priceId,
      type: InvoiceType.Purchase,
    })
    const invoice2 = await setupInvoice({
      customerId: customer1Id,
      organizationId: org1Id,
      status: InvoiceStatus.Paid,
      priceId,
      type: InvoiceType.Purchase,
    })
    const invoice3 = await setupInvoice({
      customerId: customer2Id,
      organizationId: org2Id,
      status: InvoiceStatus.Open,
      priceId,
      type: InvoiceType.Purchase,
    })
    invoice1Id = invoice1.id
    invoice2Id = invoice2.id
    invoice3Id = invoice3.id

    // Set up line items
    await setupInvoiceLineItem({ invoiceId: invoice1Id, priceId })
    await setupInvoiceLineItem({ invoiceId: invoice1Id, priceId })
    await setupInvoiceLineItem({ invoiceId: invoice2Id, priceId })
  })

  it('filters by customer id', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return selectInvoicesTableRowData({
        input: {
          where: {
            customerId: customer1Id,
          },
        },
        transaction,
      })
    })

    expect(result.data).toHaveLength(2)
    expect(result.data[0].customer.id).toBe(customer1Id)
    expect(result.data[1].customer.id).toBe(customer1Id)
  })

  it('filters by status', async () => {
    const firstResult = await adminTransaction(
      async ({ transaction }) => {
        return selectInvoicesTableRowData({
          input: {
            where: {
              status: InvoiceStatus.Open,
              organizationId: org1Id,
            },
          },
          transaction,
        })
      }
    )

    expect(firstResult.data).toHaveLength(1)
    expect(firstResult.data[0].invoice.status).toBe(
      InvoiceStatus.Open
    )

    const secondResult = await adminTransaction(
      async ({ transaction }) => {
        return selectInvoicesTableRowData({
          input: {
            where: {
              status: InvoiceStatus.Paid,
              organizationId: org1Id,
            },
          },
          transaction,
        })
      }
    )
    expect(secondResult.data).toHaveLength(1)
    expect(secondResult.data[0].invoice.status).toBe(
      InvoiceStatus.Paid
    )
  })

  it('filters by organization id', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return selectInvoicesTableRowData({
        input: {
          where: {
            organizationId: org1Id,
          },
        },
        transaction,
      })
    })

    expect(result.data).toHaveLength(2)
    expect(result.data[0].customer.id).toBe(customer1Id)
    expect(result.data[1].customer.id).toBe(customer1Id)
  })

  it('filters by organization id and status', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return selectInvoicesTableRowData({
        input: {
          where: {
            organizationId: org1Id,
            status: InvoiceStatus.Open,
          },
        },
        transaction,
      })
    })

    expect(result.data).toHaveLength(1)
    expect(result.data[0].customer.id).toBe(customer1Id)
    expect(result.data[0].invoice.status).toBe(InvoiceStatus.Open)
  })

  it('correctly joins and groups line items', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return selectInvoicesTableRowData({
        input: {
          where: {
            id: invoice1Id,
          },
        },
        transaction,
      })
    })
    expect(result.data).toHaveLength(1)
    // invoice1 gets a single line item automatically on setup
    expect(result.data[0].invoiceLineItems).toHaveLength(3)
  })

  it('orders by createdAt desc when direction is backward', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return selectInvoicesTableRowData({
        input: {
          where: {
            customerId: customer1Id,
          },
          direction: 'backward',
        },
        transaction,
      })
    })

    expect(result.data).toHaveLength(2)
    expect(
      new Date(result.data[0].invoice.createdAt).getTime()
    ).toBeGreaterThan(
      new Date(result.data[1].invoice.createdAt).getTime()
    )
  })

  it('returns correct customer data structure', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return selectInvoicesTableRowData({
        input: {
          where: {
            id: invoice1Id,
          },
        },
        transaction,
      })
    })

    expect(result.data[0].customer).toHaveProperty('id', customer1Id)
    expect(result.data[0].customer).toHaveProperty(
      'name',
      expect.any(String)
    )
  })
})
