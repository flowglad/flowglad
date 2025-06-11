import * as R from 'ramda'
import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomersCursorPaginatedWithTableRowData } from './tableMethods/customerMethods'
import {
  setupOrg,
  setupCustomer,
  setupUserAndApiKey,
} from '../../seedDatabase'
import { core } from '@/utils/core'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { nulledPriceColumns, Price, prices } from '@/db/schema/prices'
import { PriceType, CurrencyCode, FlowgladApiKeyType } from '@/types'
import { eq, and as drizzleAnd } from 'drizzle-orm'
import { apiKeys } from '@/db/schema/apiKeys'
import { users } from '@/db/schema/users'
import { memberships } from '@/db/schema/memberships'
import { Catalog, catalogs } from './schema/catalogs'
import { Product } from './schema/products'
import {
  insertProduct,
  updateProduct,
} from './tableMethods/productMethods'
import { insertPrice, updatePrice } from './tableMethods/priceMethods'

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
          filters: {
            organizationId,
          },
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

// Start of new RLS integration tests
describe('RLS Integration Tests: organizationId integrity on catalogs', () => {
  let org1Data: Awaited<ReturnType<typeof setupOrg>>
  let org1ApiKeyToken: string

  let org2Data: Awaited<ReturnType<typeof setupOrg>>

  beforeEach(async () => {
    org1Data = await setupOrg() // Sets up org, product, price in livemode (presumably true)
    const userApiKeyOrg1 = await setupUserAndApiKey({
      organizationId: org1Data.organization.id,
      livemode: true, // API key for org1 is livemode: true
    })
    if (!userApiKeyOrg1.apiKey.token) {
      throw new Error('API key token not found after setup for org1')
    }
    org1ApiKeyToken = userApiKeyOrg1.apiKey.token

    org2Data = await setupOrg() // Sets up another org
  })

  it('should ALLOW a user to manage catalogs, products, and prices within their organization', async () => {
    await authenticatedTransaction(
      async ({ transaction, userId, livemode }) => {
        expect(livemode).toBe(false) // Session livemode should be false based on API key

        const newCatalogInput: Catalog.Insert = {
          name: 'Test Allowed RLS Catalog',
          organizationId: org1Data.organization.id,
          livemode: false, // Catalog livemode matches session
        }

        // INSERT
        const createdCatalogResult = await transaction
          .insert(catalogs)
          .values(newCatalogInput)
          .returning()
        expect(createdCatalogResult.length).toBe(1)
        const createdCatalog =
          createdCatalogResult[0] as typeof catalogs.$inferSelect
        expect(createdCatalog.name).toBe('Test Allowed RLS Catalog')
        expect(createdCatalog.organizationId).toBe(
          org1Data.organization.id
        )
        const catalogId = createdCatalog.id
        // SELECT
        const selectedCatalogs = await transaction
          .select()
          .from(catalogs)
          .where(eq(catalogs.id, catalogId))
        expect(selectedCatalogs.length).toBe(1)
        expect(selectedCatalogs[0].id).toBe(catalogId)

        // UPDATE
        const updatedCatalogResult = await transaction
          .update(catalogs)
          .set({ name: 'Updated Allowed RLS Catalog' })
          .where(eq(catalogs.id, catalogId))
          .returning()
        expect(updatedCatalogResult.length).toBe(1)
        expect(updatedCatalogResult[0].name).toBe(
          'Updated Allowed RLS Catalog'
        )

        const productInsert: Product.Insert = {
          name: 'Test Product',
          organizationId: org1Data.organization.id,
          livemode: false,
          description: 'Test product description',
          imageURL: 'https://example.com/test-product.jpg',
          singularQuantityLabel:
            'Test product singular quantity label',
          pluralQuantityLabel: 'Test product plural quantity label',
          displayFeatures: null,
          active: true,
          externalId: null,
          catalogId,
        }
        const createdProduct = await insertProduct(
          productInsert,
          transaction
        )

        // Create a price to test RLS
        const priceInput: Price.Insert = {
          ...nulledPriceColumns,
          name: 'Test Price',
          livemode: false,
          productId: createdProduct.id,
          unitPrice: 1000,
          currency: CurrencyCode.USD,
          type: PriceType.SinglePayment,
          active: true,
          externalId: null,
          isDefault: false,
        }

        const createdPrice = await insertPrice(
          priceInput,
          transaction
        )
        expect(createdPrice.name).toBe('Test Price')

        // Test price update
        const updatedPrice = await updatePrice(
          {
            id: createdPrice.id,
            name: 'Updated Test Price',
            unitPrice: 2000,
            type: PriceType.SinglePayment,
            intervalUnit: null,
            intervalCount: null,
            active: true,
            externalId: null,
            usageMeterId: null,
            isDefault: false,
          },
          transaction
        )
        expect(updatedPrice.name).toBe('Updated Test Price')
        expect(updatedPrice.unitPrice).toBe(2000)

        // Test product update
        const updatedProduct = await updateProduct(
          {
            id: createdProduct.id,
            name: 'Updated Test Product',
            description: 'Updated test product description',
          },
          transaction
        )
        expect(updatedProduct.name).toBe('Updated Test Product')
        expect(updatedProduct.description).toBe(
          'Updated test product description'
        )
      },
      { apiKey: org1ApiKeyToken }
    )
  })

  it('should DENY a user from creating a catalog for another organization due to RLS', async () => {
    const catalogNameAttempt = 'Test Denied RLS Catalog - Other Org'
    try {
      await authenticatedTransaction(
        async ({ transaction, livemode }) => {
          expect(livemode).toBe(false) // Session livemode is true
          const newCatalogInput: Catalog.Insert = {
            name: catalogNameAttempt,
            organizationId: org2Data.organization.id, // Attempting to use other org's ID
            livemode: false, // Catalog livemode matches session, but orgId is wrong
          }
          await transaction
            .insert(catalogs)
            .values(newCatalogInput)
            .returning()
          // Should not reach here
          throw new Error(
            'Catalog insert was unexpectedly allowed for another organization'
          )
        },
        { apiKey: org1ApiKeyToken }
      )
    } catch (error: any) {
      expect(error.message).toContain(
        'violates row-level security policy'
      )
    }

    // Verify (using admin) that the catalog was not actually created
    const checkCatalog = await adminTransaction(
      async ({ transaction }) => {
        return transaction
          .select()
          .from(catalogs)
          .where(
            drizzleAnd(
              eq(catalogs.organizationId, org2Data.organization.id),
              eq(catalogs.name, catalogNameAttempt)
            )
          )
      }
    )
    expect(checkCatalog.length).toBe(0)
  })
})
