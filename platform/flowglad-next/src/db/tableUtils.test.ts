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
        email: `test${i}@example.com`,
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
          limit: 5,
          where: {
            organizationId,
          },
        },
        transaction,
      })
    })

    expect(result.data.length).toBe(5)
    expect(result.hasMore).toBe(true)
    expect(result.nextCursor).toBeDefined()
    expect(result.total).toBe(15)
  })

  it('should return correct pagination metadata when there are no more results', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          limit: 20,
          where: {
            organizationId,
          },
        },
        transaction,
      })
    })

    expect(result.data.length).toBe(15)
    expect(result.hasMore).toBe(false)
    expect(result.nextCursor).toBeUndefined()
    expect(result.total).toBe(15)
  })

  it('should apply filters correctly', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          limit: 10,
          where: {
            livemode: true,
            organizationId,
          },
        },
        transaction,
      })
    })

    // We created 15 customers, alternating between livemode true/false
    expect(result.data.length).toBe(8) // 8 because 15/2 rounded up
    expect(result.total).toBe(8)
    expect(result.data.every((row) => row.customer.livemode)).toBe(
      true
    )
  })

  it('should paginate to next page correctly', async () => {
    // Get first page
    const firstPage = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomersCursorPaginatedWithTableRowData({
          input: {
            where: {
              organizationId,
            },
            limit: 5,
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
            limit: 5,
            cursor: firstPage.nextCursor,
            where: {
              organizationId,
            },
          },
          transaction,
        })
      }
    )

    // Verify no overlap between pages
    const firstPageIds = new Set(
      firstPage.data.map((row) => row.customer.id)
    )
    const secondPageIds = new Set(
      secondPage.data.map((row) => row.customer.id)
    )
    const intersection = new Set(
      [...firstPageIds].filter((id) => secondPageIds.has(id))
    )
    expect(intersection.size).toBe(0)

    // Verify total count remains consistent
    expect(firstPage.total).toBe(15)
    expect(secondPage.total).toBe(15)
  })

  it('should handle different page sizes correctly', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          limit: 3,
          where: {
            organizationId,
          },
        },
        transaction,
      })
    })

    expect(result.data.length).toBe(3)
    expect(result.hasMore).toBe(true)
    expect(result.total).toBe(15)
  })

  it('should return empty result set when no records match filter', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          limit: 10,
          where: {
            email: 'nonexistent@example.com',
            organizationId,
          },
        },
        transaction,
      })
    })

    expect(result.data.length).toBe(0)
    expect(result.hasMore).toBe(false)
    expect(result.nextCursor).toBeUndefined()
    expect(result.total).toBe(0)
  })

  it('should maintain correct order by creation date', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          limit: 15,
          where: {
            organizationId,
          },
        },
        transaction,
      })
    })

    // Verify records are ordered by creation date ascending
    for (let i = 0; i < result.data.length - 1; i++) {
      expect(
        result.data[i].customer.createdAt.getTime()
      ).toBeLessThanOrEqual(
        result.data[i + 1].customer.createdAt.getTime()
      )
    }
  })

  it('should handle cursor pagination with filters correctly', async () => {
    // Get first page with filter
    const firstPage = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomersCursorPaginatedWithTableRowData({
          input: {
            limit: 3,
            where: {
              livemode: true,
              organizationId,
            },
          },
          transaction,
        })
      }
    )

    // Get second page with same filter
    const secondPage = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomersCursorPaginatedWithTableRowData({
          input: {
            limit: 3,
            cursor: firstPage.nextCursor,
            where: {
              livemode: true,
              organizationId,
            },
          },
          transaction,
        })
      }
    )

    // Verify both pages maintain the filter
    expect(firstPage.data.every((c) => c.customer.livemode)).toBe(
      true
    )
    expect(secondPage.data.every((c) => c.customer.livemode)).toBe(
      true
    )

    // Verify no overlap between pages
    const firstPageIds = new Set(
      firstPage.data.map((c) => c.customer.id)
    )
    const secondPageIds = new Set(
      secondPage.data.map((c) => c.customer.id)
    )
    const intersection = new Set(
      [...firstPageIds].filter((id) => secondPageIds.has(id))
    )
    expect(intersection.size).toBe(0)
  })

  it('should handle multiple filters correctly', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          limit: 10,
          where: {
            livemode: true,
            archived: false,
            organizationId,
          },
        },
        transaction,
      })
    })

    expect(
      result.data.every(
        (row) => row.customer.livemode && !row.customer.archived
      )
    ).toBe(true)
  })

  it('should handle cursor pagination with multiple filters correctly', async () => {
    // Get first page with multiple filters
    const firstPage = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomersCursorPaginatedWithTableRowData({
          input: {
            limit: 3,
            where: {
              livemode: true,
              archived: false,
              organizationId,
            },
          },
          transaction,
        })
      }
    )

    // Get second page with same filters
    const secondPage = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomersCursorPaginatedWithTableRowData({
          input: {
            limit: 3,
            cursor: firstPage.nextCursor,
            where: {
              livemode: true,
              archived: false,
              organizationId,
            },
          },
          transaction,
        })
      }
    )

    // Verify both pages maintain the filters
    expect(
      firstPage.data.every(
        (row) => row.customer.livemode && !row.customer.archived
      )
    ).toBe(true)
    expect(
      secondPage.data.every(
        (row) => row.customer.livemode && !row.customer.archived
      )
    ).toBe(true)

    // Verify no overlap between pages
    const firstPageIds = new Set(
      firstPage.data.map((row) => row.customer.id)
    )
    const secondPageIds = new Set(
      secondPage.data.map((row) => row.customer.id)
    )
    const intersection = new Set(
      [...firstPageIds].filter((id) => secondPageIds.has(id))
    )
    expect(intersection.size).toBe(0)
  })
})
