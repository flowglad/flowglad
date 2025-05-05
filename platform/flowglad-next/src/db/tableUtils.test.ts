import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import { DbTransaction } from '@/db/types'
import { selectCustomersCursorPaginatedWithTableRowData } from './tableMethods/customerMethods'
import { setupOrg, setupCustomer } from '../../seedDatabase'
import { core } from '@/utils/core'

describe('createCursorPaginatedSelectFunction', () => {
  let organizationId: string
  let customerIds: string[] = []
  let customerEmails: string[] = []

  beforeEach(async () => {
    // Set up organization
    const { organization } = await setupOrg()
    organizationId = organization.id

    // Clear previous customer IDs and emails
    customerIds = []
    customerEmails = []

    // Create 15 customers with different properties for testing
    for (let i = 0; i < 15; i++) {
      const customer = await setupCustomer({
        organizationId,
        email: `test${i}-${core.nanoid()}@example.com`,
        livemode: i % 2 === 0, // Alternate between livemode true/false
      })
      customerIds.push(customer.id)
      customerEmails.push(customer.email)
    }
  })

  it('should return correct pagination metadata when there are more results', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 5,
        },
        transaction,
      })
    })

    expect(result.items.length).toBe(5)
    expect(result.hasNextPage).toBe(true)
    expect(result.endCursor).toBeDefined()
  })

  it('should return correct pagination metadata when there are no more results', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 20,
          filters: {
            organizationId,
          },
        },
        transaction,
      })
    })
    expect(result.items.length).toBe(15)

    expect(result.hasNextPage).toBe(false)
    expect(result.endCursor).toBeDefined()
  })

  it('should handle different page sizes correctly', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 3,
        },
        transaction,
      })
    })

    expect(result.items.length).toBe(3)
    expect(result.hasNextPage).toBe(true)
  })

  it('should return empty result set when no records match filter', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 10,
          pageAfter: '0',
          filters: {
            logoURL: 'not-a-url',
          },
        },
        transaction,
      })
    })
    expect(result.items.length).toBe(0)
    expect(result.hasNextPage).toBe(false)
    expect(result.endCursor).toBeDefined()
  })

  it('should maintain correct order by creation date', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 15,
        },
        transaction,
      })
    })

    // Verify records are ordered by creation date ascending
    for (let i = 0; i < result.items.length - 1; i++) {
      expect(
        result.items[i].customer.createdAt.getTime()
      ).toBeLessThanOrEqual(
        result.items[i + 1].customer.createdAt.getTime()
      )
    }
  })

  it('should paginate to next page correctly', async () => {
    // Get first page
    const firstPage = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomersCursorPaginatedWithTableRowData({
          input: {
            pageSize: 5,
          },
          transaction,
        })
      }
    )

    // Get second page using cursor from first page
    const secondPage = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomersCursorPaginatedWithTableRowData({
          input: {
            pageSize: 5,
            pageAfter: firstPage.endCursor!,
          },
          transaction,
        })
      }
    )

    // Verify no overlap between pages
    const firstPageIds = new Set(
      firstPage.items.map((row) => row.customer.id)
    )
    const secondPageIds = new Set(
      secondPage.items.map((row) => row.customer.id)
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
        return selectCustomersCursorPaginatedWithTableRowData({
          input: {
            pageSize: 5,
          },
          transaction,
        })
      }
    )

    // Get second page
    const secondPage = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomersCursorPaginatedWithTableRowData({
          input: {
            pageSize: 5,
            pageAfter: firstPage.endCursor!,
          },
          transaction,
        })
      }
    )

    // Go back to first page using pageBefore
    const backToFirstPage = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomersCursorPaginatedWithTableRowData({
          input: {
            pageSize: 5,
            pageBefore: secondPage.startCursor!,
          },
          transaction,
        })
      }
    )

    // Verify we got back to the first page
    expect(backToFirstPage.items).toEqual(firstPage.items)
  })

  it('should return correct total count for filtered and unfiltered results', async () => {
    // Test unfiltered total (should be all 15 customers)
    const unfilteredResult = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomersCursorPaginatedWithTableRowData({
          input: {
            pageSize: 5,
            filters: {
              organizationId,
            },
          },
          transaction,
        })
      }
    )
    expect(unfilteredResult.total).toBe(15)

    // Test filtered total (should be 8 customers with livemode true)
    const filteredResult = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomersCursorPaginatedWithTableRowData({
          input: {
            pageSize: 5,
            filters: {
              livemode: true,
              organizationId,
            },
          },
          transaction,
        })
      }
    )
    expect(filteredResult.total).toBe(8)

    // Test filtered total with no matches
    const noMatchesResult = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomersCursorPaginatedWithTableRowData({
          input: {
            pageSize: 5,
            filters: {
              email: 'nonexistent@example.com',
            },
          },
          transaction,
        })
      }
    )
    expect(noMatchesResult.total).toBe(0)
  })

  it('should not return duplicate items when using pageAfter', async () => {
    // Get first page
    const firstPage = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomersCursorPaginatedWithTableRowData({
          input: {
            pageSize: 5,
          },
          transaction,
        })
      }
    )

    // Get second page using pageAfter
    const secondPage = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomersCursorPaginatedWithTableRowData({
          input: {
            pageSize: 5,
            pageAfter: firstPage.endCursor!,
          },
          transaction,
        })
      }
    )

    // Create sets of IDs for comparison
    const firstPageIds = new Set(
      firstPage.items.map((item) => item.customer.id)
    )
    const secondPageIds = new Set(
      secondPage.items.map((item) => item.customer.id)
    )

    // Verify no overlap between pages
    const intersection = new Set(
      [...firstPageIds].filter((id) => secondPageIds.has(id))
    )
    expect(intersection.size).toBe(0)
  })

  it('should not return duplicate items when using pageBefore', async () => {
    // Get first page
    const firstPage = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomersCursorPaginatedWithTableRowData({
          input: {
            pageSize: 5,
          },
          transaction,
        })
      }
    )

    // Get second page using pageAfter
    const secondPage = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomersCursorPaginatedWithTableRowData({
          input: {
            pageSize: 5,
            pageAfter: firstPage.endCursor!,
          },
          transaction,
        })
      }
    )

    // Go back to first page using pageBefore
    const backToFirstPage = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomersCursorPaginatedWithTableRowData({
          input: {
            pageSize: 5,
            pageBefore: secondPage.startCursor!,
          },
          transaction,
        })
      }
    )

    // Create sets of IDs for comparison
    const backToFirstPageIds = new Set(
      backToFirstPage.items.map((item) => item.customer.id)
    )
    const secondPageIds = new Set(
      secondPage.items.map((item) => item.customer.id)
    )

    // Verify no overlap between pages
    const intersection = new Set(
      [...backToFirstPageIds].filter((id) => secondPageIds.has(id))
    )
    expect(intersection.size).toBe(0)
  })
})
