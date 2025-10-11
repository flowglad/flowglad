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
    const { organization: org1, pricingModel } = await setupOrg()
    const { organization: org2 } = await setupOrg()
    org1Id = org1.id
    org2Id = org2.id

    // Set up product
    const product = await setupProduct({
      organizationId: org1Id,
      name: 'Test Product',
      livemode: true,
      pricingModelId: pricingModel.id,
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

  it('should return correct pagination metadata when there are more results', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return selectInvoicesTableRowData({
        input: {
          pageSize: 2,
        },
        transaction,
      })
    })

    expect(result.items.length).toBe(2)
    expect(result.hasNextPage).toBe(true)
    expect(result.endCursor).toBeDefined()
  })

  it('should return correct pagination metadata when there are no more results', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return selectInvoicesTableRowData({
        input: {
          pageSize: 10,
          filters: {
            organizationId: org1Id,
          },
        },
        transaction,
      })
    })

    expect(result.items.length).toBe(2)
    expect(result.hasNextPage).toBe(false)
    expect(result.endCursor).toBeDefined()
  })

  it('should handle different page sizes correctly', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return selectInvoicesTableRowData({
        input: {
          pageSize: 1,
        },
        transaction,
      })
    })

    expect(result.items.length).toBe(1)
    expect(result.hasNextPage).toBe(true)
  })

  it('should maintain correct order by creation date (newest first)', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return selectInvoicesTableRowData({
        input: {
          pageSize: 3,
        },
        transaction,
      })
    })

    // Verify records are ordered by creation date descending (newest first)
    for (let i = 0; i < result.items.length - 1; i++) {
      expect(
        result.items[i].invoice.createdAt
      ).toBeGreaterThanOrEqual(result.items[i + 1].invoice.createdAt)
    }
  })

  it('should paginate to next page correctly', async () => {
    // Get first page
    const firstPage = await adminTransaction(
      async ({ transaction }) => {
        return selectInvoicesTableRowData({
          input: {
            pageSize: 2,
          },
          transaction,
        })
      }
    )

    // Get second page using cursor from first page
    const secondPage = await adminTransaction(
      async ({ transaction }) => {
        return selectInvoicesTableRowData({
          input: {
            pageSize: 2,
            pageAfter: firstPage.endCursor!,
          },
          transaction,
        })
      }
    )

    // Verify no overlap between pages
    const firstPageIds = new Set(
      firstPage.items.map((row) => row.invoice.id)
    )
    const secondPageIds = new Set(
      secondPage.items.map((row) => row.invoice.id)
    )
    const intersection = new Set(
      [...firstPageIds].filter((id) => secondPageIds.has(id))
    )
    expect(intersection.size).toBe(0)
  })

  it('should handle backward pagination correctly', async () => {
    // Get first page
    const firstPage = await adminTransaction(
      async ({ transaction }) => {
        return selectInvoicesTableRowData({
          input: {
            pageSize: 2,
            filters: {
              organizationId: org1Id,
            },
          },
          transaction,
        })
      }
    )

    // Get second page
    const secondPage = await adminTransaction(
      async ({ transaction }) => {
        return selectInvoicesTableRowData({
          input: {
            pageSize: 2,
            pageAfter: firstPage.endCursor!,
            filters: {
              organizationId: org1Id,
            },
          },
          transaction,
        })
      }
    )

    // Go back to first page using pageBefore
    const backToFirstPage = await adminTransaction(
      async ({ transaction }) => {
        return selectInvoicesTableRowData({
          input: {
            pageSize: 2,
            pageBefore: secondPage.startCursor!,
            filters: {
              organizationId: org1Id,
            },
          },
          transaction,
        })
      }
    )

    // Verify we got back to the first page
    expect(backToFirstPage.items).toEqual(firstPage.items)
  })

  it('should correctly join and group line items', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return selectInvoicesTableRowData({
        input: {
          filters: {
            organizationId: org1Id,
          },
        },
        transaction,
      })
    })
    // Find the invoice with multiple line items
    const invoiceWithMultipleLineItems = result.items.find(
      (item) => item.invoice.id === invoice1Id
    )
    expect(
      invoiceWithMultipleLineItems?.invoiceLineItems
    ).toHaveLength(3)
  })

  it('should return correct customer data structure', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return selectInvoicesTableRowData({
        input: {
          pageSize: 1,
        },
        transaction,
      })
    })

    const firstItem = result.items[0]
    expect(firstItem.customer).toHaveProperty('id')
    expect(firstItem.customer).toHaveProperty(
      'name',
      expect.any(String)
    )
  })
})
