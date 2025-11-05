import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import {
  selectInvoicesTableRowData,
  updateInvoice,
  selectInvoiceById,
} from './invoiceMethods'
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
import { insertCustomer } from './customerMethods'
import { Customer } from '@/db/schema/customers'
import { Invoice } from '@/db/schema/invoices'

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

  describe('Search functionality', () => {
    let testData: {
      org1: Awaited<ReturnType<typeof setupOrg>>
      org2: Awaited<ReturnType<typeof setupOrg>>
      customers: {
        johnDoe: Customer.Record
        janeSmith: Customer.Record
        otherOrg: Customer.Record
        specialChars: Customer.Record
        unicode: Customer.Record
      }
      invoices: {
        johnInvoice1: Invoice.Record
        johnInvoice2: Invoice.Record
        janeInvoice1: Invoice.Record
        specialInvoice: Invoice.Record
        unicodeInvoice: Invoice.Record
        otherOrgInvoice: Invoice.Record
      }
      invoiceNumbers: {
        johnInvoice1: string
        johnInvoice2: string
        janeInvoice1: string
        specialInvoice: string
        unicodeInvoice: string
        otherOrgInvoice: string
      }
    }

    beforeEach(async () => {
      // Set up organizations
      const org1 = await setupOrg()
      const org2 = await setupOrg()

      // Set up customers with various names
      const customers = {
        johnDoe: await adminTransaction(async ({ transaction }) => {
          const customer = await insertCustomer(
            {
              organizationId: org1.organization.id,
              name: 'John Doe',
              email: `john+${core.nanoid()}@test.com`,
              externalId: core.nanoid(),
              livemode: true,
            },
            transaction
          )
          return customer
        }),
        janeSmith: await adminTransaction(async ({ transaction }) => {
          const customer = await insertCustomer(
            {
              organizationId: org1.organization.id,
              name: 'Jane Smith',
              email: `jane+${core.nanoid()}@test.com`,
              externalId: core.nanoid(),
              livemode: true,
            },
            transaction
          )
          return customer
        }),
        otherOrg: await adminTransaction(async ({ transaction }) => {
          const customer = await insertCustomer(
            {
              organizationId: org2.organization.id,
              name: 'Other Org Customer',
              email: `other+${core.nanoid()}@test.com`,
              externalId: core.nanoid(),
              livemode: true,
            },
            transaction
          )
          return customer
        }),
        specialChars: await adminTransaction(
          async ({ transaction }) => {
            const customer = await insertCustomer(
              {
                organizationId: org1.organization.id,
                name: "O'Brien-Smith",
                email: `special+${core.nanoid()}@test.com`,
                externalId: core.nanoid(),
                livemode: true,
              },
              transaction
            )
            return customer
          }
        ),
        unicode: await adminTransaction(async ({ transaction }) => {
          const customer = await insertCustomer(
            {
              organizationId: org1.organization.id,
              name: '测试 Café',
              email: `unicode+${core.nanoid()}@test.com`,
              externalId: core.nanoid(),
              livemode: true,
            },
            transaction
          )
          return customer
        }),
      }

      // Set up invoices
      const invoices = {
        johnInvoice1: await setupInvoice({
          customerId: customers.johnDoe.id,
          organizationId: org1.organization.id,
          priceId: org1.price.id,
          livemode: true,
        }),
        johnInvoice2: await setupInvoice({
          customerId: customers.johnDoe.id,
          organizationId: org1.organization.id,
          priceId: org1.price.id,
          livemode: true,
        }),
        janeInvoice1: await setupInvoice({
          customerId: customers.janeSmith.id,
          organizationId: org1.organization.id,
          priceId: org1.price.id,
          livemode: true,
        }),
        specialInvoice: await setupInvoice({
          customerId: customers.specialChars.id,
          organizationId: org1.organization.id,
          priceId: org1.price.id,
          livemode: true,
        }),
        unicodeInvoice: await setupInvoice({
          customerId: customers.unicode.id,
          organizationId: org1.organization.id,
          priceId: org1.price.id,
          livemode: true,
        }),
        otherOrgInvoice: await setupInvoice({
          customerId: customers.otherOrg.id,
          organizationId: org2.organization.id,
          priceId: org2.price.id,
          livemode: true,
        }),
      }

      // Generate unique invoice numbers for this test run to avoid conflicts
      const testPrefix = core.nanoid(8)
      const invoiceNumbers = {
        johnInvoice1: `INV-${testPrefix}-001`,
        johnInvoice2: `INV-${testPrefix}-002`,
        janeInvoice1: `INV-${testPrefix}-003`,
        specialInvoice: `INV-${testPrefix}-SPECIAL`,
        unicodeInvoice: `INV-${testPrefix}-UNICODE`,
        otherOrgInvoice: `INV-${testPrefix}-OTHER`,
      }

      // Update invoice numbers to have specific values for testing
      await adminTransaction(async ({ transaction }) => {
        const johnInvoice1Record = await selectInvoiceById(
          invoices.johnInvoice1.id,
          transaction
        )!
        const johnInvoice2Record = await selectInvoiceById(
          invoices.johnInvoice2.id,
          transaction
        )!
        const janeInvoice1Record = await selectInvoiceById(
          invoices.janeInvoice1.id,
          transaction
        )!
        const specialInvoiceRecord = await selectInvoiceById(
          invoices.specialInvoice.id,
          transaction
        )!
        const unicodeInvoiceRecord = await selectInvoiceById(
          invoices.unicodeInvoice.id,
          transaction
        )!
        const otherOrgInvoiceRecord = await selectInvoiceById(
          invoices.otherOrgInvoice.id,
          transaction
        )!

        await updateInvoice(
          {
            id: johnInvoice1Record.id,
            invoiceNumber: invoiceNumbers.johnInvoice1,
            type: johnInvoice1Record.type,
          },
          transaction
        )
        await updateInvoice(
          {
            id: johnInvoice2Record.id,
            invoiceNumber: invoiceNumbers.johnInvoice2,
            type: johnInvoice2Record.type,
          },
          transaction
        )
        await updateInvoice(
          {
            id: janeInvoice1Record.id,
            invoiceNumber: invoiceNumbers.janeInvoice1,
            type: janeInvoice1Record.type,
          },
          transaction
        )
        await updateInvoice(
          {
            id: specialInvoiceRecord.id,
            invoiceNumber: invoiceNumbers.specialInvoice,
            type: specialInvoiceRecord.type,
          },
          transaction
        )
        await updateInvoice(
          {
            id: unicodeInvoiceRecord.id,
            invoiceNumber: invoiceNumbers.unicodeInvoice,
            type: unicodeInvoiceRecord.type,
          },
          transaction
        )
        await updateInvoice(
          {
            id: otherOrgInvoiceRecord.id,
            invoiceNumber: invoiceNumbers.otherOrgInvoice,
            type: otherOrgInvoiceRecord.type,
          },
          transaction
        )
      })

      // Fetch updated invoices
      const updatedInvoices = await adminTransaction(
        async ({ transaction }) => {
          return {
            johnInvoice1: (await selectInvoiceById(
              invoices.johnInvoice1.id,
              transaction
            ))!,
            johnInvoice2: (await selectInvoiceById(
              invoices.johnInvoice2.id,
              transaction
            ))!,
            janeInvoice1: (await selectInvoiceById(
              invoices.janeInvoice1.id,
              transaction
            ))!,
            specialInvoice: (await selectInvoiceById(
              invoices.specialInvoice.id,
              transaction
            ))!,
            unicodeInvoice: (await selectInvoiceById(
              invoices.unicodeInvoice.id,
              transaction
            ))!,
            otherOrgInvoice: (await selectInvoiceById(
              invoices.otherOrgInvoice.id,
              transaction
            ))!,
          }
        }
      )

      testData = {
        org1,
        org2,
        customers,
        invoices: updatedInvoices,
        invoiceNumbers,
      }
    })

    it('should search by invoice ID (exact match only)', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return selectInvoicesTableRowData({
            input: {
              pageSize: 10,
              searchQuery: testData.invoices.johnInvoice1.id,
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )

      expect(result.items.length).toBe(1)
      expect(result.items[0].invoice.id).toBe(
        testData.invoices.johnInvoice1.id
      )

      // Partial ID should not match
      const partialId = testData.invoices.johnInvoice1.id.substring(
        0,
        testData.invoices.johnInvoice1.id.length / 2
      )
      const partialResult = await adminTransaction(
        async ({ transaction }) => {
          return selectInvoicesTableRowData({
            input: {
              pageSize: 10,
              searchQuery: partialId,
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )
      expect(
        partialResult.items.some(
          (item) =>
            item.invoice.id === testData.invoices.johnInvoice1.id
        )
      ).toBe(false)

      // Non-existent ID should return empty
      const nonExistentId = `inv_${core.nanoid()}`
      const emptyResult = await adminTransaction(
        async ({ transaction }) => {
          return selectInvoicesTableRowData({
            input: {
              pageSize: 10,
              searchQuery: nonExistentId,
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )
      expect(emptyResult.items.length).toBe(0)
      expect(emptyResult.total).toBe(0)
    })

    it('should search by invoice number (exact match)', async () => {
      // Search for exact invoice number
      const result = await adminTransaction(
        async ({ transaction }) => {
          return selectInvoicesTableRowData({
            input: {
              pageSize: 10,
              searchQuery: testData.invoiceNumbers.johnInvoice1,
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )
      expect(
        result.items.some(
          (item) =>
            item.invoice.id === testData.invoices.johnInvoice1.id
        )
      ).toBe(true)
      expect(result.items.length).toBe(1)

      // Partial invoice number should not match (exact match only)
      const partialResult = await adminTransaction(
        async ({ transaction }) => {
          return selectInvoicesTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'INV-00',
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )
      expect(partialResult.items.length).toBe(0)

      // Non-existent invoice number should return empty
      const emptyResult = await adminTransaction(
        async ({ transaction }) => {
          return selectInvoicesTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'INV-NONEXISTENT',
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )
      expect(emptyResult.items.length).toBe(0)
      expect(emptyResult.total).toBe(0)
    })

    it('should search by customer name (partial, case-insensitive)', async () => {
      // Search for "John" - should match John Doe
      const resultJohn = await adminTransaction(
        async ({ transaction }) => {
          return selectInvoicesTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'John',
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )
      expect(
        resultJohn.items.some(
          (item) =>
            item.invoice.id === testData.invoices.johnInvoice1.id
        )
      ).toBe(true)
      expect(
        resultJohn.items.some(
          (item) =>
            item.invoice.id === testData.invoices.johnInvoice2.id
        )
      ).toBe(true)

      // Search for "Doe" - should match John Doe
      const resultDoe = await adminTransaction(
        async ({ transaction }) => {
          return selectInvoicesTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'Doe',
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )
      expect(
        resultDoe.items.some(
          (item) =>
            item.invoice.id === testData.invoices.johnInvoice1.id
        )
      ).toBe(true)

      // Case-insensitive search
      const resultLower = await adminTransaction(
        async ({ transaction }) => {
          return selectInvoicesTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'john',
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )
      expect(
        resultLower.items.some(
          (item) =>
            item.invoice.id === testData.invoices.johnInvoice1.id
        )
      ).toBe(true)

      const resultUpper = await adminTransaction(
        async ({ transaction }) => {
          return selectInvoicesTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'JOHN',
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )
      expect(
        resultUpper.items.some(
          (item) =>
            item.invoice.id === testData.invoices.johnInvoice1.id
        )
      ).toBe(true)

      // Search for "J" should match both John and Jane
      const resultJ = await adminTransaction(
        async ({ transaction }) => {
          return selectInvoicesTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'J',
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )
      expect(
        resultJ.items.some(
          (item) =>
            item.invoice.id === testData.invoices.johnInvoice1.id
        )
      ).toBe(true)
      expect(
        resultJ.items.some(
          (item) =>
            item.invoice.id === testData.invoices.janeInvoice1.id
        )
      ).toBe(true)
    })

    it('should return multiple invoices for same customer', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return selectInvoicesTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'John',
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )

      const johnInvoiceIds = new Set(
        result.items
          .filter(
            (item) =>
              item.customer.id === testData.customers.johnDoe.id
          )
          .map((item) => item.invoice.id)
      )
      expect(
        johnInvoiceIds.has(testData.invoices.johnInvoice1.id)
      ).toBe(true)
      expect(
        johnInvoiceIds.has(testData.invoices.johnInvoice2.id)
      ).toBe(true)
    })

    it('should handle special characters and unicode in customer names', async () => {
      // Special characters
      const resultSpecial = await adminTransaction(
        async ({ transaction }) => {
          return selectInvoicesTableRowData({
            input: {
              pageSize: 10,
              searchQuery: "O'Brien",
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )
      expect(
        resultSpecial.items.some(
          (item) =>
            item.invoice.id === testData.invoices.specialInvoice.id
        )
      ).toBe(true)

      // Unicode characters
      const resultUnicode = await adminTransaction(
        async ({ transaction }) => {
          return selectInvoicesTableRowData({
            input: {
              pageSize: 10,
              searchQuery: '测试',
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )
      expect(
        resultUnicode.items.some(
          (item) =>
            item.invoice.id === testData.invoices.unicodeInvoice.id
        )
      ).toBe(true)
    })

    it('should handle empty, undefined, whitespace, and null search queries', async () => {
      // Empty string
      const resultEmpty = await adminTransaction(
        async ({ transaction }) => {
          return selectInvoicesTableRowData({
            input: {
              pageSize: 10,
              searchQuery: '',
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )
      expect(resultEmpty.items.length).toBeGreaterThanOrEqual(2)

      // Undefined
      const resultUndefined = await adminTransaction(
        async ({ transaction }) => {
          return selectInvoicesTableRowData({
            input: {
              pageSize: 10,
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )
      expect(resultUndefined.items.length).toBeGreaterThanOrEqual(2)

      // Whitespace only should return all invoices (whitespace is trimmed)
      const resultWhitespace = await adminTransaction(
        async ({ transaction }) => {
          return selectInvoicesTableRowData({
            input: {
              pageSize: 10,
              searchQuery: '   ',
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )
      expect(resultWhitespace.items.length).toBeGreaterThan(0)

      // Null
      const resultNull = await adminTransaction(
        async ({ transaction }) => {
          return selectInvoicesTableRowData({
            input: {
              pageSize: 10,
              searchQuery: null as any,
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )
      expect(resultNull.items.length).toBeGreaterThanOrEqual(2)
    })

    it('should paginate correctly with search applied', async () => {
      const firstPage = await adminTransaction(
        async ({ transaction }) => {
          return selectInvoicesTableRowData({
            input: {
              pageSize: 1,
              searchQuery: 'John',
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )

      expect(firstPage.items.length).toBe(1)
      expect(firstPage.hasNextPage).toBe(true)

      const secondPage = await adminTransaction(
        async ({ transaction }) => {
          return selectInvoicesTableRowData({
            input: {
              pageSize: 1,
              pageAfter: firstPage.endCursor!,
              searchQuery: 'John',
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )

      expect(secondPage.items.length).toBeGreaterThanOrEqual(1)
      // Verify no overlap
      const firstPageIds = new Set(
        firstPage.items.map((item) => item.invoice.id)
      )
      const secondPageIds = new Set(
        secondPage.items.map((item) => item.invoice.id)
      )
      const intersection = new Set(
        [...firstPageIds].filter((id) => secondPageIds.has(id))
      )
      expect(intersection.size).toBe(0)

      // Verify all items are for John
      expect(
        firstPage.items.every((item) =>
          item.customer.name.toLowerCase().includes('john')
        )
      ).toBe(true)
      expect(
        secondPage.items.every((item) =>
          item.customer.name.toLowerCase().includes('john')
        )
      ).toBe(true)
    })

    it('should return correct total count with search applied', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return selectInvoicesTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'John',
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )

      expect(result.total).toBeGreaterThanOrEqual(2)
      expect(
        result.items.every((item) =>
          item.customer.name.toLowerCase().includes('john')
        )
      ).toBe(true)
    })

    it('should only return results from the authenticated organization', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return selectInvoicesTableRowData({
            input: {
              pageSize: 10,
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )

      // Should only contain invoices from org1
      expect(
        result.items.every(
          (item) =>
            item.invoice.organizationId ===
            testData.org1.organization.id
        )
      ).toBe(true)

      // Should not contain invoice from org2
      expect(
        result.items.some(
          (item) =>
            item.invoice.id === testData.invoices.otherOrgInvoice.id
        )
      ).toBe(false)
    })

    it('should be case-insensitive for customer name search', async () => {
      // Test various case combinations
      const testCases = ['john', 'JOHN', 'John', 'jOhN']

      for (const searchQuery of testCases) {
        const result = await adminTransaction(
          async ({ transaction }) => {
            return selectInvoicesTableRowData({
              input: {
                pageSize: 10,
                searchQuery,
                filters: {
                  organizationId: testData.org1.organization.id,
                },
              },
              transaction,
            })
          }
        )

        // All case variations should return the same results
        expect(
          result.items.some(
            (item) =>
              item.invoice.id === testData.invoices.johnInvoice1.id
          )
        ).toBe(true)
        expect(
          result.items.some(
            (item) =>
              item.invoice.id === testData.invoices.johnInvoice2.id
          )
        ).toBe(true)
      }
    })
  })

  describe('Combined Search', () => {
    let testData: {
      org1: Awaited<ReturnType<typeof setupOrg>>
      invoice1: Invoice.Record
      invoice2: Invoice.Record
      customer: Customer.Record
      invoiceNumbers: {
        invoice1: string
        invoice2: string
      }
    }

    beforeEach(async () => {
      const org1 = await setupOrg()

      const customer = await adminTransaction(
        async ({ transaction }) => {
          return await insertCustomer(
            {
              organizationId: org1.organization.id,
              name: 'John Doe',
              email: `john+${core.nanoid()}@test.com`,
              externalId: core.nanoid(),
              livemode: true,
            },
            transaction
          )
        }
      )

      const invoice1 = await setupInvoice({
        customerId: customer.id,
        organizationId: org1.organization.id,
        priceId: org1.price.id,
        livemode: true,
      })

      const invoice2 = await setupInvoice({
        customerId: customer.id,
        organizationId: org1.organization.id,
        priceId: org1.price.id,
        livemode: true,
      })

      // Generate unique invoice numbers for this test run to avoid conflicts
      const testPrefix = core.nanoid(8)
      const invoiceNumbers = {
        invoice1: `INV-COMBINED-${testPrefix}-001`,
        invoice2: `INV-COMBINED-${testPrefix}-002`,
      }

      await adminTransaction(async ({ transaction }) => {
        const invoice1Record = await selectInvoiceById(
          invoice1.id,
          transaction
        )!
        const invoice2Record = await selectInvoiceById(
          invoice2.id,
          transaction
        )!

        await updateInvoice(
          {
            id: invoice1Record.id,
            invoiceNumber: invoiceNumbers.invoice1,
            type: invoice1Record.type,
          },
          transaction
        )
        await updateInvoice(
          {
            id: invoice2Record.id,
            invoiceNumber: invoiceNumbers.invoice2,
            type: invoice2Record.type,
          },
          transaction
        )
      })

      const updatedInvoices = await adminTransaction(
        async ({ transaction }) => {
          return {
            invoice1: (await selectInvoiceById(
              invoice1.id,
              transaction
            ))!,
            invoice2: (await selectInvoiceById(
              invoice2.id,
              transaction
            ))!,
          }
        }
      )

      testData = {
        org1,
        invoice1: updatedInvoices.invoice1,
        invoice2: updatedInvoices.invoice2,
        customer,
        invoiceNumbers,
      }
    })

    it('should return invoice matching any of invoice ID, invoice number, or customer name', async () => {
      // Search by invoice ID
      const resultById = await adminTransaction(
        async ({ transaction }) => {
          return selectInvoicesTableRowData({
            input: {
              pageSize: 10,
              searchQuery: testData.invoice1.id,
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )
      expect(
        resultById.items.some(
          (item) => item.invoice.id === testData.invoice1.id
        )
      ).toBe(true)

      // Search by invoice number
      const resultByNumber = await adminTransaction(
        async ({ transaction }) => {
          return selectInvoicesTableRowData({
            input: {
              pageSize: 10,
              searchQuery: testData.invoiceNumbers.invoice1,
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )
      expect(
        resultByNumber.items.some(
          (item) => item.invoice.id === testData.invoice1.id
        )
      ).toBe(true)

      // Search by customer name (should match multiple invoices)
      const resultByName = await adminTransaction(
        async ({ transaction }) => {
          return selectInvoicesTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'John',
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )
      expect(
        resultByName.items.some(
          (item) => item.invoice.id === testData.invoice1.id
        )
      ).toBe(true)
      expect(
        resultByName.items.some(
          (item) => item.invoice.id === testData.invoice2.id
        )
      ).toBe(true)
    })
  })
})
