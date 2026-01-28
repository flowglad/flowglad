import { beforeEach, describe, expect, it } from 'bun:test'
import {
  setupBillingPeriod,
  setupCustomer,
  setupInvoice,
  setupInvoiceLineItem,
  setupOrg,
  setupPrice,
  setupProduct,
  setupPurchase,
  setupSubscription,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Customer } from '@/db/schema/customers'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Purchase } from '@/db/schema/purchases'
import type { Subscription } from '@/db/schema/subscriptions'
import {
  CurrencyCode,
  IntervalUnit,
  InvoiceStatus,
  InvoiceType,
  PriceType,
} from '@/types'
import { core } from '@/utils/core'
import {
  derivePricingModelIdForInvoice,
  insertInvoice,
  selectInvoicesTableRowData,
} from './invoiceMethods'

describe('selectInvoicesTableRowData', () => {
  let org1Id: string
  let org2Id: string
  let customer1Id: string
  let customer2Id: string
  let customer3Id: string
  let customerOtherOrgId: string
  let invoice1Id: string
  let invoice2Id: string
  let invoice3Id: string
  let invoice1Number: string
  let invoice2Number: string
  let invoice3Number: string
  let priceId: string

  beforeEach(async () => {
    // Set up organizations
    const { organization: org1, pricingModel } = (
      await setupOrg()
    ).unwrap()
    const { organization: org2, pricingModel: pricingModel2 } = (
      await setupOrg()
    ).unwrap()
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

    // Set up customers with specific names for search testing
    const customer1 = (
      await setupCustomer({
        organizationId: org1Id,
        name: 'Alice Smith',
        email: 'alice@example.com',
      })
    ).unwrap()
    const customer2 = (
      await setupCustomer({
        organizationId: org1Id,
        name: 'Bob Jones',
        email: 'bob@example.com',
      })
    ).unwrap()
    const customer3 = (
      await setupCustomer({
        organizationId: org1Id,
        name: 'Charlie Brown',
        email: 'charlie@example.com',
      })
    ).unwrap()
    customer1Id = customer1.id
    customer2Id = customer2.id
    customer3Id = customer3.id

    // Set up invoices
    const invoice1 = await setupInvoice({
      customerId: customer1Id,
      organizationId: org1Id,
      status: InvoiceStatus.Open,
      priceId,
      type: InvoiceType.Purchase,
    })
    const invoice2 = await setupInvoice({
      customerId: customer2Id,
      organizationId: org1Id,
      status: InvoiceStatus.Paid,
      priceId,
      type: InvoiceType.Purchase,
    })
    const invoice3 = await setupInvoice({
      customerId: customer3Id,
      organizationId: org1Id,
      status: InvoiceStatus.Open,
      priceId,
      type: InvoiceType.Purchase,
    })
    invoice1Id = invoice1.id
    invoice2Id = invoice2.id
    invoice3Id = invoice3.id
    invoice1Number = invoice1.invoiceNumber
    invoice2Number = invoice2.invoiceNumber
    invoice3Number = invoice3.invoiceNumber

    // Set up second organization with customer having same name for isolation testing
    const productOtherOrg = await setupProduct({
      organizationId: org2Id,
      name: 'Test Product Other',
      livemode: true,
      pricingModelId: pricingModel2.id,
    })

    const priceOtherOrg = await setupPrice({
      productId: productOtherOrg.id,
      name: 'Test Price Other',
      type: PriceType.Subscription,
      unitPrice: 1000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: true,
      trialPeriodDays: 0,
      currency: CurrencyCode.USD,
    })

    const customerOtherOrg = (
      await setupCustomer({
        organizationId: org2Id,
        name: 'Alice Smith', // Same name as customer1 to test isolation
        email: 'alice-other@example.com',
      })
    ).unwrap()
    customerOtherOrgId = customerOtherOrg.id

    const invoiceOtherOrg = await setupInvoice({
      customerId: customerOtherOrgId,
      organizationId: org2Id,
      status: InvoiceStatus.Open,
      priceId: priceOtherOrg.id,
      type: InvoiceType.Purchase,
    })

    // Set up line items
    await setupInvoiceLineItem({ invoiceId: invoice1Id, priceId })
    await setupInvoiceLineItem({ invoiceId: invoice1Id, priceId })
    await setupInvoiceLineItem({ invoiceId: invoice2Id, priceId })
    await setupInvoiceLineItem({
      invoiceId: invoiceOtherOrg.id,
      priceId: priceOtherOrg.id,
    })
  })

  it('should return correct pagination metadata when there are more results', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return selectInvoicesTableRowData({
        input: {
          pageSize: 2,
          filters: {
            organizationId: org1Id,
          },
        },
        transaction,
      })
    })

    expect(result.items.length).toBe(2)
    expect(result.hasNextPage).toBe(true)
    expect(typeof result.endCursor).toBe('string')
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

    expect(result.items.length).toBe(3)
    expect(result.hasNextPage).toBe(false)
    expect(typeof result.endCursor).toBe('string')
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

  describe('search functionality', () => {
    it('should search by invoice ID, invoice number, or customer name (case-insensitive, trims whitespace)', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Test invoice ID search
        const resultById = await selectInvoicesTableRowData({
          input: {
            pageSize: 10,
            searchQuery: invoice1Id,
            filters: { organizationId: org1Id },
          },
          transaction,
        })
        expect(resultById.items.length).toBe(1)
        expect(resultById.items[0].invoice.id).toBe(invoice1Id)
        expect(resultById.total).toBe(1)

        // Test invoice number search
        const resultByNumber = await selectInvoicesTableRowData({
          input: {
            pageSize: 10,
            searchQuery: invoice2Number,
            filters: { organizationId: org1Id },
          },
          transaction,
        })
        expect(resultByNumber.items.length).toBe(1)
        expect(resultByNumber.items[0].invoice.id).toBe(invoice2Id)
        expect(resultByNumber.items[0].invoice.invoiceNumber).toBe(
          invoice2Number
        )
        expect(resultByNumber.total).toBe(1)

        // Test partial customer name search (case-insensitive)
        const resultByName = await selectInvoicesTableRowData({
          input: {
            pageSize: 10,
            searchQuery: 'alice',
            filters: { organizationId: org1Id },
          },
          transaction,
        })
        expect(resultByName.items.length).toBe(1)
        expect(resultByName.items[0].invoice.id).toBe(invoice1Id)
        expect(resultByName.items[0].customer.name).toBe(
          'Alice Smith'
        )
        expect(resultByName.total).toBe(1)

        // Test case-insensitive search
        const resultCaseInsensitive =
          await selectInvoicesTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'CHARLIE',
              filters: { organizationId: org1Id },
            },
            transaction,
          })
        expect(resultCaseInsensitive.items.length).toBe(1)
        expect(resultCaseInsensitive.items[0].customer.name).toBe(
          'Charlie Brown'
        )

        // Test whitespace trimming
        const resultTrimmed = await selectInvoicesTableRowData({
          input: {
            pageSize: 10,
            searchQuery: '  alice  ',
            filters: { organizationId: org1Id },
          },
          transaction,
        })
        expect(resultTrimmed.items.length).toBe(1)
        expect(resultTrimmed.items[0].invoice.id).toBe(invoice1Id)
      })
    })

    it('should ignore empty or whitespace-only search queries', async () => {
      await adminTransaction(async ({ transaction }) => {
        const resultEmpty = await selectInvoicesTableRowData({
          input: {
            pageSize: 10,
            searchQuery: '',
            filters: { organizationId: org1Id },
          },
          transaction,
        })

        const resultWhitespace = await selectInvoicesTableRowData({
          input: {
            pageSize: 10,
            searchQuery: '   ',
            filters: { organizationId: org1Id },
          },
          transaction,
        })

        const resultUndefined = await selectInvoicesTableRowData({
          input: {
            pageSize: 10,
            searchQuery: undefined,
            filters: { organizationId: org1Id },
          },
          transaction,
        })

        // All should return all 3 invoices for org1
        expect(resultEmpty.items.length).toBe(3)
        expect(resultEmpty.total).toBe(3)
        expect(resultWhitespace.items.length).toBe(3)
        expect(resultWhitespace.total).toBe(3)
        expect(resultUndefined.items.length).toBe(3)
        expect(resultUndefined.total).toBe(3)
      })
    })

    it('should only return invoices for the specified organization when searching', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Search for "Alice" - should only return invoice1 from org1, not invoice from org2
        const result = await selectInvoicesTableRowData({
          input: {
            pageSize: 10,
            searchQuery: 'alice',
            filters: { organizationId: org1Id },
          },
          transaction,
        })

        expect(result.items.length).toBe(1)
        expect(result.items[0].invoice.id).toBe(invoice1Id)
        expect(result.items[0].invoice.organizationId).toBe(org1Id)
        expect(result.total).toBe(1)
      })
    })

    it('should combine search with existing filters', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Search by customer name and filter by status
        const resultWithStatus = await selectInvoicesTableRowData({
          input: {
            pageSize: 10,
            searchQuery: 'alice',
            filters: {
              organizationId: org1Id,
              status: InvoiceStatus.Open,
            },
          },
          transaction,
        })
        expect(resultWithStatus.items.length).toBe(1)
        expect(resultWithStatus.items[0].invoice.id).toBe(invoice1Id)
        expect(resultWithStatus.items[0].invoice.status).toBe(
          InvoiceStatus.Open
        )
        expect(resultWithStatus.total).toBe(1)

        // Search by customer name and filter by different status (should return empty)
        const resultWithDifferentStatus =
          await selectInvoicesTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'alice',
              filters: {
                organizationId: org1Id,
                status: InvoiceStatus.Paid,
              },
            },
            transaction,
          })
        expect(resultWithDifferentStatus.items.length).toBe(0)
        expect(resultWithDifferentStatus.total).toBe(0)

        // Search by invoice number and filter by customerId
        const resultWithCustomerId = await selectInvoicesTableRowData(
          {
            input: {
              pageSize: 10,
              searchQuery: invoice2Number,
              filters: {
                organizationId: org1Id,
                customerId: customer2Id,
              },
            },
            transaction,
          }
        )
        expect(resultWithCustomerId.items.length).toBe(1)
        expect(resultWithCustomerId.items[0].invoice.id).toBe(
          invoice2Id
        )
        expect(resultWithCustomerId.total).toBe(1)
      })
    })
  })

  describe('pricingModelId derivation', () => {
    let pricingModel: PricingModel.Record
    let subscription: Subscription.Record
    let purchase: Purchase.Record
    let customer: Customer.Record

    beforeEach(async () => {
      const { organization, pricingModel: pm } = (
        await setupOrg()
      ).unwrap()
      pricingModel = pm

      const product = await setupProduct({
        organizationId: organization.id,
        name: 'Test Product',
        livemode: true,
        pricingModelId: pricingModel.id,
      })

      const price = await setupPrice({
        productId: product.id,
        name: 'Test Price',
        type: PriceType.SinglePayment,
        unitPrice: 1000,
        livemode: true,
        isDefault: true,
        currency: CurrencyCode.USD,
      })

      customer = (
        await setupCustomer({
          organizationId: organization.id,
          email: 'test@example.com',
          livemode: true,
          pricingModelId: pricingModel.id,
        })
      ).unwrap()

      subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        livemode: true,
      })

      purchase = await setupPurchase({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        livemode: true,
      })
    })

    describe('derivePricingModelIdForInvoice', () => {
      it('should derive pricingModelId from subscription when subscriptionId is provided', async () => {
        await adminTransaction(async ({ transaction }) => {
          const pricingModelId = await derivePricingModelIdForInvoice(
            {
              subscriptionId: subscription.id,
              customerId: customer.id,
            },
            transaction
          )

          expect(pricingModelId).toBe(subscription.pricingModelId)
          expect(pricingModelId).toBe(pricingModel.id)
        })
      })

      it('should derive pricingModelId from purchase when purchaseId is provided', async () => {
        await adminTransaction(async ({ transaction }) => {
          const pricingModelId = await derivePricingModelIdForInvoice(
            {
              purchaseId: purchase.id,
              customerId: customer.id,
            },
            transaction
          )

          expect(pricingModelId).toBe(purchase.pricingModelId)
          expect(pricingModelId).toBe(pricingModel.id)
        })
      })

      it('should derive pricingModelId from customer when neither subscriptionId nor purchaseId is provided', async () => {
        await adminTransaction(async ({ transaction }) => {
          const pricingModelId = await derivePricingModelIdForInvoice(
            {
              customerId: customer.id,
            },
            transaction
          )

          expect(pricingModelId).toBe(customer.pricingModelId)
          expect(pricingModelId).toBe(pricingModel.id)
        })
      })

      it('should prioritize subscription over purchase when both are provided', async () => {
        await adminTransaction(async ({ transaction }) => {
          const pricingModelId = await derivePricingModelIdForInvoice(
            {
              subscriptionId: subscription.id,
              purchaseId: purchase.id,
              customerId: customer.id,
            },
            transaction
          )

          // Should use subscription's pricingModelId, not purchase's
          expect(pricingModelId).toBe(subscription.pricingModelId)
        })
      })

      it('should prioritize purchase over customer when both exist but no subscription', async () => {
        await adminTransaction(async ({ transaction }) => {
          const pricingModelId = await derivePricingModelIdForInvoice(
            {
              purchaseId: purchase.id,
              customerId: customer.id,
            },
            transaction
          )

          // Should use purchase's pricingModelId, not customer's
          expect(pricingModelId).toBe(purchase.pricingModelId)
        })
      })

      it('should throw error when customer does not exist', async () => {
        await adminTransaction(async ({ transaction }) => {
          const nonExistentCustomerId = `cust_${core.nanoid()}`

          await expect(
            derivePricingModelIdForInvoice(
              {
                customerId: nonExistentCustomerId,
              },
              transaction
            )
          ).rejects.toThrow()
        })
      })
    })

    describe('insertInvoice', () => {
      it('should insert invoice and derive pricingModelId from subscription', async () => {
        await adminTransaction(async ({ transaction }) => {
          const now = Date.now()
          const billingPeriod = await setupBillingPeriod({
            subscriptionId: subscription.id,
            startDate: now,
            endDate: now + 30 * 24 * 60 * 60 * 1000, // 30 days later
            livemode: true,
          })

          const invoice = await insertInvoice(
            {
              customerId: customer.id,
              organizationId: subscription.organizationId,
              subscriptionId: subscription.id,
              billingPeriodId: billingPeriod.id,
              status: InvoiceStatus.Draft,
              type: InvoiceType.Subscription,
              livemode: true,
              invoiceNumber: `TEST-${core.nanoid()}`,
              currency: CurrencyCode.USD,
              purchaseId: null,
              invoiceDate: Date.now(),
            },
            transaction
          )

          expect(invoice.pricingModelId).toBe(
            subscription.pricingModelId
          )
          expect(invoice.pricingModelId).toBe(pricingModel.id)
        })
      })

      it('should insert invoice and derive pricingModelId from purchase', async () => {
        await adminTransaction(async ({ transaction }) => {
          const invoice = await insertInvoice(
            {
              customerId: customer.id,
              organizationId: purchase.organizationId,
              purchaseId: purchase.id,
              status: InvoiceStatus.Draft,
              type: InvoiceType.Purchase,
              livemode: true,
              invoiceNumber: `TEST-${core.nanoid()}`,
              currency: CurrencyCode.USD,
              invoiceDate: Date.now(),
            },
            transaction
          )

          expect(invoice.pricingModelId).toBe(purchase.pricingModelId)
          expect(invoice.pricingModelId).toBe(pricingModel.id)
        })
      })

      it('should insert invoice and derive pricingModelId from customer', async () => {
        await adminTransaction(async ({ transaction }) => {
          const invoice = await insertInvoice(
            {
              customerId: customer.id,
              organizationId: customer.organizationId,
              status: InvoiceStatus.Draft,
              type: InvoiceType.Standalone,
              livemode: true,
              invoiceNumber: `TEST-${core.nanoid()}`,
              currency: CurrencyCode.USD,
              billingPeriodId: null,
              purchaseId: null,
              subscriptionId: null,
              invoiceDate: Date.now(),
            },
            transaction
          )

          expect(invoice.pricingModelId).toBe(customer.pricingModelId)
          expect(invoice.pricingModelId).toBe(pricingModel.id)
        })
      })

      it('should throw error when customer does not exist', async () => {
        await adminTransaction(async ({ transaction }) => {
          const nonExistentCustomerId = `cust_${core.nanoid()}`

          await expect(
            insertInvoice(
              {
                customerId: nonExistentCustomerId,
                organizationId: customer.organizationId,
                status: InvoiceStatus.Draft,
                type: InvoiceType.Standalone,
                livemode: true,
                invoiceNumber: `TEST-${core.nanoid()}`,
                currency: CurrencyCode.USD,
                billingPeriodId: null,
                purchaseId: null,
                subscriptionId: null,
                invoiceDate: Date.now(),
              },
              transaction
            )
          ).rejects.toThrow()
        })
      })
    })
  })
})
