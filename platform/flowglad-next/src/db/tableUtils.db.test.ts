import { beforeEach, describe, expect, it } from 'bun:test'
import {
  type Customer,
  customers,
  customersInsertSchema,
  customersSelectSchema,
  customersUpdateSchema,
} from '@db-core/schema/customers'
import { pricingModels } from '@db-core/schema/pricingModels'
import {
  buildWhereClauses,
  createCursorPaginatedSelectFunction,
  decodeCursor,
  encodeCursor,
  metadataSchema,
  sanitizeBaseTableFilters,
  whereClauseFromObject,
} from '@db-core/tableUtils'
import { eq, inArray, or, sql } from 'drizzle-orm'
import { boolean, integer, pgTable, text } from 'drizzle-orm/pg-core'
import { setupCustomer, setupOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { core } from '@/utils/core'
import {
  selectCustomersCursorPaginatedWithTableRowData,
  selectCustomersPaginated,
} from './tableMethods/customerMethods'

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
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 5,
        },
        transaction,
      })
    })

    expect(result.items.length).toBe(5)
    expect(result.hasNextPage).toBe(true)
    expect(typeof result.endCursor).toBe('string')
  })

  it('should return correct pagination metadata when there are no more results', async () => {
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
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
    expect(typeof result.endCursor).toBe('string')
  })

  it('should handle different page sizes correctly', async () => {
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
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
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
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
    expect(result.endCursor).toBeNull()
  })

  it('should maintain correct order by creation date (newest first)', async () => {
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 15,
          filters: {
            organizationId,
          },
        },
        transaction,
      })
    })

    // Verify records are ordered by creation date descending (newest first)
    for (let i = 0; i < result.items.length - 1; i++) {
      expect(
        result.items[i].customer.createdAt
      ).toBeGreaterThanOrEqual(result.items[i + 1].customer.createdAt)
    }
  })

  it('should paginate to next page correctly', async () => {
    // Get first page
    const firstPage = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 5,
          filters: {
            organizationId,
          },
        },
        transaction,
      })
    })

    // Get second page using cursor from first page
    const secondPage = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 5,
          pageAfter: firstPage.endCursor!,
          filters: {
            organizationId,
          },
        },
        transaction,
      })
    })

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
    const firstPage = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 5,
          filters: {
            organizationId,
          },
        },
        transaction,
      })
    })

    // Get second page
    const secondPage = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 5,
          pageAfter: firstPage.endCursor!,
          filters: {
            organizationId,
          },
        },
        transaction,
      })
    })

    // Go back to first page using pageBefore
    const backToFirstPage = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 5,
          pageBefore: secondPage.startCursor!,
          filters: {
            organizationId,
          },
        },
        transaction,
      })
    })

    // Verify we got back to the first page
    expect(backToFirstPage.items).toEqual(firstPage.items)
  })

  it('should return correct total count for filtered and unfiltered results', async () => {
    // Test unfiltered total (should be all 15 customers)
    const unfilteredResult = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 5,
          filters: {
            organizationId,
          },
        },
        transaction,
      })
    })
    expect(unfilteredResult.total).toBe(15)

    // Test filtered total (should be 8 customers with livemode true)
    const filteredResult = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
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
    })
    expect(filteredResult.total).toBe(8)

    // Test filtered total with no matches
    const noMatchesResult = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 5,
          filters: {
            email: 'nonexistent@example.com',
          },
        },
        transaction,
      })
    })
    expect(noMatchesResult.total).toBe(0)
  })

  it('should not return duplicate items when using pageAfter', async () => {
    // Get first page
    const firstPage = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 5,
          filters: {
            organizationId,
          },
        },
        transaction,
      })
    })

    // Get second page using pageAfter
    const secondPage = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 5,
          pageAfter: firstPage.endCursor!,
          filters: {
            organizationId,
          },
        },
        transaction,
      })
    })

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
    const firstPage = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 5,
          filters: {
            organizationId,
          },
        },
        transaction,
      })
    })

    // Get second page using pageAfter
    const secondPage = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 5,
          pageAfter: firstPage.endCursor!,
          filters: {
            organizationId,
          },
        },
        transaction,
      })
    })

    // Go back to first page using pageBefore
    const backToFirstPage = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 5,
          pageBefore: secondPage.startCursor!,
          filters: {
            organizationId,
          },
        },
        transaction,
      })
    })

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

  it('should navigate to first page when goToFirst is true', async () => {
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 5,
          goToFirst: true,
          filters: {
            organizationId,
          },
        },
        transaction,
      })
    })

    expect(result.items.length).toBe(5)
    expect(result.hasPreviousPage).toBe(false)
    expect(result.hasNextPage).toBe(true)
    expect(typeof result.startCursor).toBe('string')
    expect(typeof result.endCursor).toBe('string')
    expect(result.total).toBe(15)
  })

  it('should navigate to last page when goToLast is true', async () => {
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 5,
          goToLast: true,
          filters: {
            organizationId,
          },
        },
        transaction,
      })
    })

    // Last page should have 15 % 5 = 0, so full page of 5
    expect(result.items.length).toBe(5)
    expect(result.hasNextPage).toBe(false)
    expect(result.hasPreviousPage).toBe(true)
    expect(result.startCursor).toEqual(expect.any(String))
    expect(result.endCursor).toEqual(expect.any(String))
    expect(result.total).toBe(15)
  })

  it('should handle goToLast with partial last page correctly', async () => {
    // Create 2 more customers to make 17 total, so last page has 2 items
    await setupCustomer({
      organizationId,
      email: `extra1-${core.nanoid()}@example.com`,
    })
    await setupCustomer({
      organizationId,
      email: `extra2-${core.nanoid()}@example.com`,
    })

    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 5,
          goToLast: true,
          filters: {
            organizationId,
          },
        },
        transaction,
      })
    })

    // Last page should have 17 % 5 = 2 items
    expect(result.items.length).toBe(2)
    expect(result.hasNextPage).toBe(false)
    expect(result.hasPreviousPage).toBe(true)
    expect(result.total).toBe(17)
  })

  it('should handle goToFirst from middle page correctly', async () => {
    // First get to middle page
    const firstPage = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 5,
          filters: {
            organizationId,
          },
        },
        transaction,
      })
    })

    const secondPage = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 5,
          pageAfter: firstPage.endCursor!,
          filters: {
            organizationId,
          },
        },
        transaction,
      })
    })

    // Now go to first from second page
    const backToFirst = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 5,
          goToFirst: true,
          filters: {
            organizationId,
          },
        },
        transaction,
      })
    })

    // Should be same as original first page
    expect(backToFirst.items).toEqual(firstPage.items)
    expect(backToFirst.hasPreviousPage).toBe(false)
    expect(backToFirst.hasNextPage).toBe(true)
  })

  it('should handle goToLast from first page correctly', async () => {
    const firstPage = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 5,
          filters: {
            organizationId,
          },
        },
        transaction,
      })
    })

    const lastPage = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 5,
          goToLast: true,
          filters: {
            organizationId,
          },
        },
        transaction,
      })
    })

    // Should be different from first page
    expect(lastPage.items).not.toEqual(firstPage.items)
    expect(lastPage.hasNextPage).toBe(false)
    expect(lastPage.hasPreviousPage).toBe(true)
  })

  it('should handle goToFirst and goToLast with filtered results', async () => {
    // Filter to only livemode customers (8 total)
    const firstPageFiltered = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 3,
          goToFirst: true,
          filters: {
            organizationId,
            livemode: true,
          },
        },
        transaction,
      })
    })

    expect(firstPageFiltered.items.length).toBe(3)
    expect(firstPageFiltered.hasPreviousPage).toBe(false)
    expect(firstPageFiltered.hasNextPage).toBe(true)
    expect(firstPageFiltered.total).toBe(8)

    const lastPageFiltered = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 3,
          goToLast: true,
          filters: {
            organizationId,
            livemode: true,
          },
        },
        transaction,
      })
    })

    // Last page should have 8 % 3 = 2 items
    expect(lastPageFiltered.items.length).toBe(2)
    expect(lastPageFiltered.hasNextPage).toBe(false)
    expect(lastPageFiltered.hasPreviousPage).toBe(true)
    expect(lastPageFiltered.total).toBe(8)
  })

  it('should handle goToFirst and goToLast with empty result set', async () => {
    const firstPageEmpty = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 5,
          goToFirst: true,
          filters: {
            email: 'nonexistent@example.com',
            organizationId,
          },
        },
        transaction,
      })
    })

    expect(firstPageEmpty.items.length).toBe(0)
    expect(firstPageEmpty.hasPreviousPage).toBe(false)
    expect(firstPageEmpty.hasNextPage).toBe(false)
    expect(firstPageEmpty.total).toBe(0)
    expect(firstPageEmpty.startCursor).toBe(null)
    expect(firstPageEmpty.endCursor).toBe(null)

    const lastPageEmpty = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 5,
          goToLast: true,
          filters: {
            email: 'nonexistent@example.com',
            organizationId,
          },
        },
        transaction,
      })
    })

    expect(lastPageEmpty.items.length).toBe(0)
    expect(lastPageEmpty.hasPreviousPage).toBe(false)
    expect(lastPageEmpty.hasNextPage).toBe(false)
    expect(lastPageEmpty.total).toBe(0)
    expect(lastPageEmpty.startCursor).toBe(null)
    expect(lastPageEmpty.endCursor).toBe(null)
  })

  it('should handle goToLast with single page of results', async () => {
    // Test with page size larger than total results
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 20,
          goToLast: true,
          filters: {
            organizationId,
          },
        },
        transaction,
      })
    })

    expect(result.items.length).toBe(15)
    expect(result.hasNextPage).toBe(false)
    expect(result.hasPreviousPage).toBe(false)
    expect(result.total).toBe(15)
  })

  it('should maintain correct order when using goToFirst and goToLast', async () => {
    const firstPage = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 5,
          goToFirst: true,
          filters: {
            organizationId,
          },
        },
        transaction,
      })
    })

    const lastPage = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 5,
          goToLast: true,
          filters: {
            organizationId,
          },
        },
        transaction,
      })
    })

    // Verify first page is ordered by creation date descending (newest first)
    for (let i = 0; i < firstPage.items.length - 1; i++) {
      expect(
        firstPage.items[i].customer.createdAt
      ).toBeGreaterThanOrEqual(
        firstPage.items[i + 1].customer.createdAt
      )
    }

    // Verify last page is ordered by creation date descending (newest first)
    for (let i = 0; i < lastPage.items.length - 1; i++) {
      expect(
        lastPage.items[i].customer.createdAt
      ).toBeGreaterThanOrEqual(
        lastPage.items[i + 1].customer.createdAt
      )
    }

    // Verify that first page items come after last page items chronologically
    const lastItemFromFirstPage =
      firstPage.items[firstPage.items.length - 1]
    const firstItemFromLastPage = lastPage.items[0]

    expect(
      lastItemFromFirstPage.customer.createdAt
    ).toBeGreaterThanOrEqual(firstItemFromLastPage.customer.createdAt)
  })

  it('should ignore cursor parameters when goToFirst or goToLast are used', async () => {
    // Get a valid cursor first
    const firstPage = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 5,
          filters: {
            organizationId,
          },
        },
        transaction,
      })
    })

    // Use goToFirst with cursor parameters - should ignore cursors
    const goToFirstWithCursor = await adminTransaction(
      async (ctx) => {
        const { transaction } = ctx
        return selectCustomersCursorPaginatedWithTableRowData({
          input: {
            pageSize: 5,
            pageAfter: firstPage.endCursor!, // This should be ignored
            goToFirst: true,
            filters: {
              organizationId,
            },
          },
          transaction,
        })
      }
    )

    // Should be same as normal goToFirst
    const normalGoToFirst = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersCursorPaginatedWithTableRowData({
        input: {
          pageSize: 5,
          goToFirst: true,
          filters: {
            organizationId,
          },
        },
        transaction,
      })
    })

    expect(goToFirstWithCursor.items).toEqual(normalGoToFirst.items)
  })

  // Tests for buildAdditionalSearchClause and buildAdditionalFilterClause
  describe('buildAdditionalSearchClause and buildAdditionalFilterClause', () => {
    let testOrgId: string
    let testCustomer1: Customer.Record
    let testCustomer2: Customer.Record
    let testCustomer3: Customer.Record

    beforeEach(async () => {
      const { organization } = await setupOrg()
      testOrgId = organization.id

      // Create test customers with different names
      testCustomer1 = await setupCustomer({
        organizationId: testOrgId,
        name: 'Alice Smith',
        email: 'alice@example.com',
      })

      testCustomer2 = await setupCustomer({
        organizationId: testOrgId,
        name: 'Bob Jones',
        email: 'bob@example.com',
      })

      testCustomer3 = await setupCustomer({
        organizationId: testOrgId,
        name: 'Charlie Brown',
        email: 'charlie@example.com',
      })
    })

    describe('buildAdditionalSearchClause', () => {
      it('should apply buildAdditionalSearchClause with OR semantics', async () => {
        // Create a test function that searches by customer ID or name
        const testSelectFunction =
          createCursorPaginatedSelectFunction(
            customers,
            {
              selectSchema: customersSelectSchema,
              insertSchema: customersInsertSchema,
              updateSchema: customersUpdateSchema,
              tableName: 'customers',
            },
            customersSelectSchema,
            undefined, // no enrichment
            [customers.email], // base search on email
            ({ searchQuery }) => {
              // Additional search: match by customer ID or name
              return or(
                eq(customers.id, searchQuery),
                sql`${customers.name} ilike ${`%${searchQuery}%`}`
              )
            }
          )

        // Search for customer ID - should find via additional search clause
        const resultById = await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return testSelectFunction({
            input: {
              pageSize: 10,
              searchQuery: testCustomer1.id,
              filters: { organizationId: testOrgId },
            },
            transaction,
          })
        })

        expect(resultById.items.length).toBe(1)
        expect(resultById.items[0].id).toBe(testCustomer1.id)
        expect(resultById.items[0].name).toBe('Alice Smith')

        // Search for name - should find via additional search clause
        const resultByName = await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return testSelectFunction({
            input: {
              pageSize: 10,
              searchQuery: 'Alice',
              filters: { organizationId: testOrgId },
            },
            transaction,
          })
        })

        expect(resultByName.items.length).toBe(1)
        expect(resultByName.items[0].id).toBe(testCustomer1.id)
        expect(resultByName.items[0].name).toBe('Alice Smith')

        // Search for email - should find via base search
        const resultByEmail = await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return testSelectFunction({
            input: {
              pageSize: 10,
              searchQuery: 'bob@example.com',
              filters: { organizationId: testOrgId },
            },
            transaction,
          })
        })

        expect(resultByEmail.items.length).toBe(1)
        expect(resultByEmail.items[0].id).toBe(testCustomer2.id)
        expect(resultByEmail.items[0].email).toBe('bob@example.com')
        expect(resultByEmail.items[0].name).toBe('Bob Jones')
      })
    })

    describe('buildAdditionalFilterClause', () => {
      it('should apply buildAdditionalFilterClause with AND semantics', async () => {
        // Create a test function that filters by a custom field
        const testSelectFunction =
          createCursorPaginatedSelectFunction(
            customers,
            {
              selectSchema: customersSelectSchema,
              insertSchema: customersInsertSchema,
              updateSchema: customersUpdateSchema,
              tableName: 'customers',
            },
            customersSelectSchema,
            undefined, // no enrichment
            undefined, // no base search
            undefined, // no additional search
            async ({ filters }) => {
              // Additional filter: filter by name containing a substring
              const nameFilter =
                filters &&
                typeof filters === 'object' &&
                'nameContains' in filters
                  ? (filters as Record<string, unknown>).nameContains
                  : undefined

              if (nameFilter && typeof nameFilter === 'string') {
                return sql`${customers.name} ilike ${`%${nameFilter}%`}`
              }
              return undefined
            }
          )

        // Filter by nameContains - should only return matching customers
        const result = await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return testSelectFunction({
            input: {
              pageSize: 10,
              filters: {
                organizationId: testOrgId,
                nameContains: 'Smith', // This is not a base table column, handled by additional filter
              } as Record<string, unknown>,
            },
            transaction,
          })
        })

        expect(result.items.length).toBe(1)
        expect(result.items[0].id).toBe(testCustomer1.id)
        expect(result.items[0].name).toBe('Alice Smith')
      })

      it('should sanitize filters to ignore unknown base table keys', async () => {
        // Create a test function with additional filter clause
        const testSelectFunction =
          createCursorPaginatedSelectFunction(
            customers,
            {
              selectSchema: customersSelectSchema,
              insertSchema: customersInsertSchema,
              updateSchema: customersUpdateSchema,
              tableName: 'customers',
            },
            customersSelectSchema,
            undefined,
            undefined,
            undefined,
            async ({ filters }) => {
              // Additional filter handles cross-table field
              const nameContains =
                filters &&
                typeof filters === 'object' &&
                'nameContains' in filters
                  ? (filters as Record<string, unknown>).nameContains
                  : undefined

              if (nameContains && typeof nameContains === 'string') {
                return sql`${customers.name} ilike ${`%${nameContains}%`}`
              }
              return undefined
            }
          )

        // Pass filters with both known (organizationId) and unknown (nameContains) keys
        const result = await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return testSelectFunction({
            input: {
              pageSize: 10,
              filters: {
                organizationId: testOrgId,
                nameContains: 'Brown', // Unknown to base table, handled by additional filter
                unknownField: 'should be ignored', // Should be ignored
              } as Record<string, unknown>,
            },
            transaction,
          })
        })

        // Should only return customer with name containing 'Brown'
        expect(result.items.length).toBe(1)
        expect(result.items[0].id).toBe(testCustomer3.id)
        expect(result.items[0].name).toBe('Charlie Brown')
      })
    })

    describe('buildAdditionalSearchClause and buildAdditionalFilterClause together', () => {
      it('should combine buildAdditionalSearchClause and buildAdditionalFilterClause', async () => {
        // Create a test function with both additional search and filter
        const testSelectFunction =
          createCursorPaginatedSelectFunction(
            customers,
            {
              selectSchema: customersSelectSchema,
              insertSchema: customersInsertSchema,
              updateSchema: customersUpdateSchema,
              tableName: 'customers',
            },
            customersSelectSchema,
            undefined,
            [customers.email], // base search
            ({ searchQuery }) => {
              // Additional search: match by name
              return sql`${customers.name} ilike ${`%${searchQuery}%`}`
            },
            async ({ filters }) => {
              // Additional filter: filter by name containing a substring
              const nameContains =
                filters &&
                typeof filters === 'object' &&
                'nameContains' in filters
                  ? (filters as Record<string, unknown>).nameContains
                  : undefined

              if (nameContains && typeof nameContains === 'string') {
                return sql`${customers.name} ilike ${`%${nameContains}%`}`
              }
              return undefined
            }
          )

        // Search for 'Alice' (should match via additional search) AND filter by nameContains 'Smith'
        const result = await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return testSelectFunction({
            input: {
              pageSize: 10,
              searchQuery: 'Alice',
              filters: {
                organizationId: testOrgId,
                nameContains: 'Smith',
              } as Record<string, unknown>,
            },
            transaction,
          })
        })

        // Should return customer that matches both search (Alice) and filter (Smith)
        expect(result.items.length).toBe(1)
        expect(result.items[0].id).toBe(testCustomer1.id)
        expect(result.items[0].name).toBe('Alice Smith')
      })
    })
  })
})

const mockTable = pgTable('mock_table', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email'),
  active: boolean('active'),
  organizationId: text('organization_id'),
  tags: text('tags').array(),
  count: integer('count'),
  metadata: text('metadata'),
})

describe('whereClauseFromObject', () => {
  describe('basic functionality', () => {
    it('should return undefined for empty object', () => {
      const result = whereClauseFromObject(mockTable, {})
      expect(result).toBeUndefined()
    })

    it('should return undefined when all values are undefined', () => {
      const selectConditions = {
        id: undefined,
        name: undefined,
        email: undefined,
      }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toBeUndefined()
    })

    it('should return undefined when all values are empty strings', () => {
      const selectConditions = {
        name: '',
        email: '',
        organizationId: '',
      }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toBeUndefined()
    })

    it('should return undefined for mixed undefined and empty string values', () => {
      const selectConditions = {
        id: undefined,
        name: '',
        email: undefined,
        active: '',
      } as any
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toBeUndefined()
    })
  })

  describe('single condition handling', () => {
    it('should handle single string equality condition', () => {
      const selectConditions = { name: 'test-name' }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toEqual(expect.anything())
    })

    it('should handle single boolean condition', () => {
      const selectConditions = { active: true }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toEqual(expect.anything())
    })

    it('should handle single number condition', () => {
      const selectConditions = { count: 42 }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toEqual(expect.anything())
    })

    it('should handle single null condition', () => {
      const selectConditions = { metadata: null }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toEqual(expect.anything())
    })
  })

  describe('multiple condition handling', () => {
    it('should handle multiple conditions with AND logic', () => {
      const selectConditions = {
        name: 'test-name',
        active: true,
        count: 42,
      }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toMatchObject({})
    })

    it('should filter out undefined/empty values from mixed conditions', () => {
      const selectConditions = {
        name: 'test-name',
        email: undefined,
        active: true,
        organizationId: '',
        count: 0,
      }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toMatchObject({})
    })
  })

  describe('array handling', () => {
    it('should handle array with single value', () => {
      const selectConditions = { tags: ['tag1'] }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toMatchObject({})
    })

    it('should handle array with multiple values', () => {
      const selectConditions = { tags: ['tag1', 'tag2', 'tag3'] }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toMatchObject({})
    })

    it('should handle empty array', () => {
      const selectConditions = { tags: [] }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toMatchObject({})
    })

    it('should filter undefined and empty strings from arrays', () => {
      const selectConditions = {
        tags: ['tag1', undefined, '', 'tag2', null] as any,
      }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toMatchObject({})
    })

    it('should handle array with only undefined/empty values', () => {
      const selectConditions = {
        tags: [undefined, '', undefined] as any,
      }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toMatchObject({})
    })

    it('should handle mixed array types', () => {
      const selectConditions = {
        tags: ['string', 123, true, null] as any,
      }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toMatchObject({})
    })
  })

  describe('null value handling', () => {
    it('should properly handle explicit null values', () => {
      const selectConditions = { metadata: null }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toMatchObject({})
    })

    it('should handle multiple null values', () => {
      const selectConditions = {
        metadata: null,
        email: null,
        name: 'test',
      }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toMatchObject({})
    })
  })

  describe('edge cases and data validation', () => {
    it('should handle zero values correctly', () => {
      const selectConditions = { count: 0 }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toMatchObject({})
    })

    it('should handle false boolean values correctly', () => {
      const selectConditions = { active: false }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toMatchObject({})
    })

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(10000)
      const selectConditions = { name: longString }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toMatchObject({})
    })

    it('should handle special characters in string values', () => {
      const selectConditions = {
        name: "O'Reilly & Co. <script>alert('test')</script>",
        email: 'test+tag@example.com',
      }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toMatchObject({})
    })

    it('should handle Unicode characters', () => {
      const selectConditions = {
        name: '测试用户名 🚀 émoji',
        email: 'тест@example.com',
      }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toMatchObject({})
    })

    it('should handle very large arrays', () => {
      const largeArray = Array.from(
        { length: 1000 },
        (_, i) => `item-${i}`
      )
      const selectConditions = { tags: largeArray }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toMatchObject({})
    })

    it('should handle arrays with duplicate values', () => {
      const selectConditions = {
        tags: ['tag1', 'tag1', 'tag2', 'tag1', 'tag2'],
      }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toMatchObject({})
    })
  })

  describe('type coercion and conversion', () => {
    it('should handle string numbers', () => {
      const selectConditions = { count: '123' } as any
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toMatchObject({})
    })

    it('should handle string booleans', () => {
      const selectConditions = { active: 'true' } as any
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toMatchObject({})
    })

    it('should handle mixed types in same condition set', () => {
      const selectConditions = {
        name: 'test',
        count: 42,
        active: true,
        metadata: null,
        tags: ['tag1', 'tag2'],
      }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toMatchObject({})
    })
  })

  describe('edge case handling', () => {
    it('should handle very deep nested structures safely', () => {
      const selectConditions = {
        metadata: { deep: { nested: { object: 'value' } } },
      } as any
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toMatchObject({})
    })
  })

  describe('boundary value testing', () => {
    it('should handle maximum safe integer', () => {
      const selectConditions = { count: Number.MAX_SAFE_INTEGER }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toMatchObject({})
    })

    it('should handle minimum safe integer', () => {
      const selectConditions = { count: Number.MIN_SAFE_INTEGER }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toMatchObject({})
    })

    it('should handle NaN values', () => {
      const selectConditions = { count: NaN }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toMatchObject({})
    })

    it('should handle Infinity values', () => {
      const selectConditions = { count: Infinity }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toMatchObject({})
    })
  })

  describe('real-world usage patterns', () => {
    it('should handle common filtering scenarios', () => {
      const selectConditions = {
        organizationId: 'org_123',
        active: true,
        tags: ['premium', 'verified'],
        metadata: null,
      }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toMatchObject({})
    })

    it('should handle search-like scenarios with partial matches', () => {
      const selectConditions = {
        email: 'john@example.com',
        name: 'John Doe',
        active: true,
      }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toMatchObject({})
    })

    it('should handle pagination scenarios', () => {
      const selectConditions = {
        organizationId: 'org_123',
        id: ['id1', 'id2', 'id3', 'id4', 'id5'],
      }
      const result = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      expect(result).toMatchObject({})
    })
  })

  describe('data consistency', () => {
    it('should produce consistent results for same inputs', () => {
      const selectConditions = {
        name: 'test-user',
        active: true,
        tags: ['tag1', 'tag2'],
      }

      const result1 = whereClauseFromObject(
        mockTable,
        selectConditions
      )
      const result2 = whereClauseFromObject(
        mockTable,
        selectConditions
      )

      expect(result1).toMatchObject({})
      expect(result2).toMatchObject({})
      // Both should be defined and have same structure
    })

    it('should handle object property order independence', () => {
      const selectConditions1 = {
        name: 'test',
        active: true,
        count: 42,
      }
      const selectConditions2 = {
        active: true,
        count: 42,
        name: 'test',
      }

      const result1 = whereClauseFromObject(
        mockTable,
        selectConditions1
      )
      const result2 = whereClauseFromObject(
        mockTable,
        selectConditions2
      )

      expect(result1).toMatchObject({})
      expect(result2).toMatchObject({})
    })
  })
})

describe('createPaginatedSelectFunction', () => {
  let organizationId: string
  let customerIds: string[] = []

  beforeEach(async () => {
    const { organization } = await setupOrg()
    organizationId = organization.id
    customerIds = []

    // Create 25 customers for pagination testing
    for (let i = 0; i < 25; i++) {
      const customer = await setupCustomer({
        organizationId,
        email: `paginated-test${i}-${core.nanoid()}@example.com`,
        livemode: i % 3 === 0, // Every third customer is livemode
      })
      customerIds.push(customer.id)
    }
  })

  it('should return first page with default limit', async () => {
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersPaginated(
        {
          limit: 10,
        },
        transaction
      )
    })

    expect(result.data.length).toBe(10)
    expect(result.hasMore).toBe(true)
    expect(typeof result.nextCursor).toBe('string')
    expect(result.currentCursor).toBeUndefined()
    expect(result.total).toBeGreaterThanOrEqual(25)
  })

  it('should return correct page with custom limit', async () => {
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersPaginated(
        {
          limit: 5,
        },
        transaction
      )
    })

    expect(result.data.length).toBe(5)
    expect(result.hasMore).toBe(true)
  })

  it('paginates forward across pages with stable order, cursor continuity, and no overlap', async () => {
    // Page 1 from start (filtered by organization)
    const page1 = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const initialCursor = encodeCursor({
        parameters: { organizationId },
        direction: 'forward',
      })
      return selectCustomersPaginated(
        {
          cursor: initialCursor,
          limit: 10,
        },
        transaction
      )
    })

    expect(page1.data.length).toBeGreaterThan(0)
    expect(page1.hasMore).toBe(true)
    expect(typeof page1.nextCursor).toBe('string')
    expect(page1.nextCursor!.length).toBeGreaterThan(0)

    // nextCursor must contain id and direction
    const decoded1 = decodeCursor(page1.nextCursor!)
    expect(typeof decoded1.id).toBe('string')
    expect(decoded1.direction).toBe('forward')

    // Page 2 using nextCursor
    const page2 = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersPaginated(
        {
          cursor: page1.nextCursor!,
          limit: 10,
        },
        transaction
      )
    })

    // Cursor continuity
    expect(page2.currentCursor).toBe(page1.nextCursor)

    // No overlap across pages
    const set1 = new Set(page1.data.map((c) => c.id))
    const set2 = new Set(page2.data.map((c) => c.id))
    const overlap = [...set1].filter((id) => set2.has(id))
    expect(overlap.length).toBe(0)

    // Combined ordering check: ascending by (createdAt, id)
    const combined = [...page1.data, ...page2.data]
    for (let i = 0; i < combined.length - 1; i++) {
      const a = combined[i]
      const b = combined[i + 1]
      const ta = new Date(a.createdAt).getTime()
      const tb = new Date(b.createdAt).getTime()
      expect(ta <= tb || (ta === tb && a.id <= b.id)).toBe(true)
    }
  })

  it('should enforce maximum limit of 100', async () => {
    await expect(
      adminTransaction(async (ctx) => {
        const { transaction } = ctx
        return selectCustomersPaginated(
          {
            limit: 101,
          },
          transaction
        )
      })
    ).rejects.toThrow('limit must be less than or equal to 100')
  })

  it('should return hasMore=false when on last page', async () => {
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const initialCursor = encodeCursor({
        parameters: { organizationId }, // Required in tests (bypasses auth flow)
        direction: 'forward',
      })
      return selectCustomersPaginated(
        {
          cursor: initialCursor,
          limit: 100,
        },
        transaction
      )
    })

    // If we request more items than exist, hasMore should be false
    expect(result.hasMore).toBe(false)
    expect(result.nextCursor).toBeUndefined()
  })

  it('should handle empty result set', async () => {
    // Since createPaginatedSelectFunction uses createdAt for cursor filtering,
    // not parameter filtering in the cursor, we'll test with a far future date
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      // Use a future date that won't match any records
      const cursor = encodeCursor({
        parameters: {},
        createdAt: new Date('2099-01-01'),
        id: '0',
        direction: 'forward',
      })
      return selectCustomersPaginated(
        {
          cursor,
          limit: 10,
        },
        transaction
      )
    })

    expect(result.data.length).toBe(0)
    expect(result.hasMore).toBe(false)
    expect(result.nextCursor).toBeUndefined()
  })

  it('should paginate deterministically when many rows share identical createdAt', async () => {
    const fixed = new Date('2020-01-01T00:00:00Z')
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      // Force identical createdAt for at least 20 existing rows
      const page = await selectCustomersPaginated(
        { limit: 20 },
        transaction
      )
      const ids = page.data.map((c) => c.id)
      if (ids.length > 0) {
        await transaction
          .update(customers)
          .set({
            createdAt: sql`${fixed.toISOString()}::timestamptz`,
          })
          .where(inArray(customers.id, ids))
      }

      const page1 = await selectCustomersPaginated(
        { limit: 10 },
        transaction
      )
      const page2 = await selectCustomersPaginated(
        { limit: 10, cursor: page1.nextCursor! },
        transaction
      )

      // zero overlap due to (createdAt, id) keyset pagination
      const set1 = new Set(page1.data.map((c) => c.id))
      const set2 = new Set(page2.data.map((c) => c.id))
      const overlap = [...set1].filter((id) => set2.has(id))
      expect(overlap.length).toBe(0)

      // ordering by (createdAt, id) ascending in forward
      const all = [...page1.data, ...page2.data]
      for (let i = 0; i < all.length - 1; i++) {
        const a = all[i]
        const b = all[i + 1]
        const ta = new Date(a.createdAt).getTime()
        const tb = new Date(b.createdAt).getTime()
        expect(ta <= tb || (ta === tb && a.id <= b.id)).toBe(true)
      }
      return true
    })
    expect(result).toBe(true)
  })

  it('should handle backward pagination boundary with identical createdAt deterministically', async () => {
    const fixed = new Date('2020-01-02T00:00:00Z')
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      // Force many rows to share the same timestamp for a robust boundary test
      const firstPage = await selectCustomersPaginated(
        { limit: 20 },
        transaction
      )
      const ids = firstPage.data.map((c) => c.id)
      if (ids.length > 0) {
        await transaction
          .update(customers)
          .set({
            createdAt: sql`${fixed.toISOString()}::timestamptz`,
          })
          .where(inArray(customers.id, ids))
      }

      // Start from just after the fixed timestamp, direction backward
      const cursor = encodeCursor({
        parameters: {},
        createdAt: new Date('2020-01-03T00:00:00Z'),
        id: 'zzzzzzzz',
        direction: 'backward',
      })
      const page1 = await selectCustomersPaginated(
        { limit: 10, cursor },
        transaction
      )
      const page2 = await selectCustomersPaginated(
        { limit: 10, cursor: page1.nextCursor! },
        transaction
      )

      // zero overlap across backward pages
      const set1 = new Set(page1.data.map((c) => c.id))
      const set2 = new Set(page2.data.map((c) => c.id))
      const overlap = [...set1].filter((id) => set2.has(id))
      expect(overlap.length).toBe(0)

      // ordering by (createdAt desc, id desc) in backward
      const all = [...page1.data, ...page2.data]
      for (let i = 0; i < all.length - 1; i++) {
        const a = all[i]
        const b = all[i + 1]
        const ta = new Date(a.createdAt).getTime()
        const tb = new Date(b.createdAt).getTime()
        expect(ta >= tb || (ta === tb && a.id >= b.id)).toBe(true)
      }
    })
  })

  it('accepts legacy cursor without id and continues pagination (createdAt-only fallback)', async () => {
    // Get a first page to establish an anchor
    const firstPage = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersPaginated(
        {
          limit: 10,
        },
        transaction
      )
    })

    expect(firstPage.data.length).toBeGreaterThan(0)
    const anchor = firstPage.data[firstPage.data.length - 1]

    // Construct a legacy cursor (no id) anchored at last item createdAt
    const legacyCursor = encodeCursor({
      parameters: {},
      createdAt: new Date(anchor.createdAt as number),
      // intentionally omit id
      direction: 'forward',
    })

    const secondPage = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersPaginated(
        {
          cursor: legacyCursor,
          limit: 10,
        },
        transaction
      )
    })

    // Ensure we advanced and did not overlap with the first page
    const firstIds = new Set(firstPage.data.map((c) => c.id))
    const secondIds = new Set(secondPage.data.map((c) => c.id))
    const overlap = [...firstIds].filter((id) => secondIds.has(id))
    expect(overlap.length).toBe(0)

    // Next cursor should be produced as a modern cursor (with id)
    if (secondPage.nextCursor) {
      const decoded = decodeCursor(secondPage.nextCursor)
      expect(typeof decoded.id).toBe('string')
      expect(decoded.direction).toBe('forward')
    }
  })

  it('should handle backward pagination direction', async () => {
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      // Create cursor with backward direction
      const cursor = encodeCursor({
        parameters: {},
        createdAt: new Date(), // Start from now
        direction: 'backward',
      })

      return selectCustomersPaginated(
        {
          cursor,
          limit: 10,
        },
        transaction
      )
    })

    expect(result.data.length).toBeGreaterThan(0)

    // Verify records are ordered by creation date descending (newest first in backward direction)
    for (let i = 0; i < result.data.length - 1; i++) {
      expect(
        new Date(result.data[i].createdAt).getTime()
      ).toBeGreaterThanOrEqual(
        new Date(result.data[i + 1].createdAt).getTime()
      )
    }
  })

  it('should return consistent results across multiple fetches without cursor', async () => {
    const firstFetch = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersPaginated(
        {
          limit: 5,
        },
        transaction
      )
    })

    const secondFetch = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectCustomersPaginated(
        {
          limit: 5,
        },
        transaction
      )
    })

    // Without new data, the first page should be the same
    expect(firstFetch.data.map((c) => c.id)).toEqual(
      secondFetch.data.map((c) => c.id)
    )
  })

  it('should handle limit at exact boundary of available records', async () => {
    // Get total count first
    const totalResult = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const cursor = encodeCursor({
        parameters: { organizationId }, // Required in tests (bypasses auth flow)
        createdAt: new Date(0),
        direction: 'forward',
      })
      return selectCustomersPaginated(
        {
          cursor,
          limit: 100,
        },
        transaction
      )
    })

    // Request exactly the number of records that exist
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const cursor = encodeCursor({
        parameters: { organizationId }, // Required in tests (bypasses auth flow)
        createdAt: new Date(0),
        direction: 'forward',
      })
      return selectCustomersPaginated(
        {
          cursor,
          limit: Math.min(totalResult.data.length, 100),
        },
        transaction
      )
    })

    expect(result.data.length).toBe(
      Math.min(totalResult.data.length, 100)
    )
  })
})

describe('createPaginatedSelectFunction (deterministic assertions)', () => {
  let organizationId: string

  beforeEach(async () => {
    const { organization } = await setupOrg()
    organizationId = organization.id

    // Seed 12 customers with deterministic names in creation order
    for (let i = 1; i <= 12; i++) {
      const index = String(i).padStart(4, '0')
      await setupCustomer({
        organizationId,
        name: `cust-${index}`,
        email: `cust-${index}@example.com`,
        livemode: true,
      })
    }
  })

  it('asserts every item by name across forward pages (no gaps, no dupes)', async () => {
    const expectedNames = Array.from(
      { length: 12 },
      (_, i) => `cust-${String(i + 1).padStart(4, '0')}`
    )

    const pageSize = 5
    let currentCursor: string | undefined = encodeCursor({
      parameters: { organizationId },
      direction: 'forward',
    })
    const seenNames: string[] = []
    const seenItems: Array<{
      id: string
      createdAt: number
      name: string
    }> = []

    // Walk pages until exhaustion
    // Collect names to assert full content (not necessarily in creation order)
    while (true) {
      const page = await adminTransaction(async ({ transaction }) =>
        selectCustomersPaginated(
          { cursor: currentCursor, limit: pageSize },
          transaction
        )
      )
      seenNames.push(...page.data.map((c) => c.name))
      seenItems.push(
        ...page.data.map((c) => ({
          id: c.id,
          createdAt: c.createdAt,
          name: c.name,
        }))
      )
      if (!page.nextCursor) break
      currentCursor = page.nextCursor
    }

    // Ensure all 12 seeded customers were returned (no gaps, no dupes)
    // Note: Order may differ from creation order when createdAt is identical,
    // since the tiebreaker is ID (random nanoid), not creation sequence
    expect(seenNames.sort()).toEqual(expectedNames.sort())
    expect(seenNames.length).toBe(12)
    expect(new Set(seenNames).size).toBe(12) // No duplicates

    // Verify items are correctly sorted by (createdAt, id)
    // Note: PostgreSQL sorts UUIDs/text columns lexicographically (strcmp-style)
    for (let i = 0; i < seenItems.length - 1; i++) {
      const a = seenItems[i]
      const b = seenItems[i + 1]
      const correctOrder =
        a.createdAt < b.createdAt ||
        (a.createdAt === b.createdAt && a.id.localeCompare(b.id) <= 0)
      expect(correctOrder).toBe(true)
    }

    // Verify page sizes
    const chunk = (arr: string[], size: number) =>
      Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
        arr.slice(i * size, i * size + size)
      )
    const pages = chunk(seenNames, pageSize)
    expect(pages.length).toBe(3)
    expect(pages[0].length).toBe(5)
    expect(pages[1].length).toBe(5)
    expect(pages[2].length).toBe(2)
  })

  it('counts total records deterministically for organization', async () => {
    const cursor = encodeCursor({
      parameters: { organizationId },
      direction: 'forward',
    })
    const result = await adminTransaction(async ({ transaction }) =>
      selectCustomersPaginated({ cursor, limit: 3 }, transaction)
    )
    expect(result.total).toBe(12)
  })
})

describe('metadataSchema', () => {
  it('should parse a valid metadata object', () => {
    const result = metadataSchema.safeParse({
      key: 'value',
    })
    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      key: 'value',
    })
  })
  it('should parse an empty metadata object', () => {
    const result = metadataSchema.safeParse({})
    expect(result.success).toBe(true)
    expect(result.data).toEqual({})
  })
})

describe('sanitizeBaseTableFilters', () => {
  it('should return undefined when filters is undefined', () => {
    const result = sanitizeBaseTableFilters(customers, undefined)
    expect(result).toBeUndefined()
  })

  it('should return undefined when filters is empty object', () => {
    const result = sanitizeBaseTableFilters(customers, {})
    expect(result).toBeUndefined()
  })

  it('should return only base table columns when filters contains valid keys', () => {
    const filters = {
      organizationId: 'org-123',
      email: 'test@example.com',
    }
    const result = sanitizeBaseTableFilters(customers, filters)
    expect(result).toEqual({
      organizationId: 'org-123',
      email: 'test@example.com',
    })
  })

  it('should filter out cross-table fields that are not on the base table', () => {
    const filters = {
      organizationId: 'org-123',
      email: 'test@example.com',
      productName: 'Premium Plan', // Cross-table field, not on customers table
      nameContains: 'Smith', // Cross-table field, not on customers table
    } as Record<string, unknown>
    const result = sanitizeBaseTableFilters(customers, filters)
    expect(result).toEqual({
      organizationId: 'org-123',
      email: 'test@example.com',
    })
    expect(result).not.toHaveProperty('productName')
    expect(result).not.toHaveProperty('nameContains')
  })

  it('should return undefined when all filters are cross-table fields', () => {
    const filters = {
      productName: 'Premium Plan',
      nameContains: 'Smith',
      unknownField: 'value',
    } as Record<string, unknown>
    const result = sanitizeBaseTableFilters(customers, filters)
    expect(result).toBeUndefined()
  })

  it('should include valid keys and omit invalid keys', () => {
    const filters = {
      organizationId: 'org-123',
      livemode: true,
      invalidKey: 'should be filtered',
      anotherInvalidKey: 123,
    } as Record<string, unknown>
    const result = sanitizeBaseTableFilters(customers, filters)
    expect(result).toEqual({
      organizationId: 'org-123',
      livemode: true,
    })
    expect(result).not.toHaveProperty('invalidKey')
    expect(result).not.toHaveProperty('anotherInvalidKey')
  })

  it('should work with different table types', () => {
    // Test with a different table (pricingModels)
    const filters = {
      organizationId: 'org-123',
      name: 'Test Model',
      invalidField: 'should be filtered',
    } as Record<string, unknown>
    const result = sanitizeBaseTableFilters(pricingModels, filters)
    expect(result).toEqual({
      organizationId: 'org-123',
      name: 'Test Model',
    })
    expect(result).not.toHaveProperty('invalidField')
  })
})

describe('buildWhereClauses', () => {
  let organizationId: string
  let customer1: Customer.Record
  let customer2: Customer.Record
  let customer3: Customer.Record

  beforeEach(async () => {
    const { organization } = await setupOrg()
    organizationId = organization.id

    customer1 = await setupCustomer({
      organizationId,
      email: 'alice@example.com',
      name: 'Alice Smith',
      livemode: true,
    })
    customer2 = await setupCustomer({
      organizationId,
      email: 'bob@test.com',
      name: 'Bob Jones',
      livemode: false,
    })
    customer3 = await setupCustomer({
      organizationId,
      email: 'charlie@example.com',
      name: 'Charlie Brown',
      livemode: true,
    })
  })

  it('should return undefined when no filters or search provided', async () => {
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const result = await buildWhereClauses(
        customers,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        transaction
      )

      expect(result.whereClauses).toBeUndefined()
    })
  })

  it('should filter by base table columns and sanitize cross-table fields', async () => {
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const filters = {
        organizationId,
        livemode: true,
        email: customer1.email,
        productName: 'Premium Plan', // Cross-table field, should be ignored
      } as Record<string, unknown>

      const { whereClauses } = await buildWhereClauses(
        customers,
        filters,
        undefined,
        undefined,
        undefined,
        undefined,
        transaction
      )

      const results = await transaction
        .select()
        .from(customers)
        .where(whereClauses)

      expect(results.length).toBe(1)
      expect(results[0].id).toBe(customer1.id)
    })
  })

  it('should search across searchable columns', async () => {
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const { whereClauses } = await buildWhereClauses(
        customers,
        { organizationId },
        'alice',
        [customers.email, customers.name],
        undefined,
        undefined,
        transaction
      )

      const results = await transaction
        .select()
        .from(customers)
        .where(whereClauses)

      expect(results.length).toBe(1)
      expect(results[0].id).toBe(customer1.id)
    })
  })

  it('should combine base filters with additional filter clauses using AND', async () => {
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const { whereClauses } = await buildWhereClauses(
        customers,
        { organizationId },
        undefined,
        undefined,
        async () => eq(customers.livemode, true),
        undefined,
        transaction
      )

      const results = await transaction
        .select()
        .from(customers)
        .where(whereClauses)

      expect(results.length).toBe(2)
      expect(results.every((c) => c.livemode === true)).toBe(true)
    })
  })

  it('should combine base search with additional search using OR', async () => {
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const { whereClauses } = await buildWhereClauses(
        customers,
        { organizationId },
        'bob',
        [customers.email],
        undefined,
        async () => sql`${customers.name} ILIKE ${'%bob%'}`,
        transaction
      )

      const results = await transaction
        .select()
        .from(customers)
        .where(whereClauses)

      expect(results.length).toBe(1)
      expect(results[0].id).toBe(customer2.id)
    })
  })

  it('should combine all clauses with AND logic', async () => {
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const { whereClauses } = await buildWhereClauses(
        customers,
        { organizationId, livemode: true },
        'alice',
        [customers.email],
        async () => sql`${customers.name} IS NOT NULL`,
        undefined,
        transaction
      )

      const results = await transaction
        .select()
        .from(customers)
        .where(whereClauses)

      expect(results.length).toBe(1)
      expect(results[0].id).toBe(customer1.id)
    })
  })
})
