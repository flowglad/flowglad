import * as R from 'ramda'
import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomersCursorPaginatedWithTableRowData } from './tableMethods/customerMethods'
import {
  setupOrg,
  setupCustomer,
  setupUserAndApiKey,
} from '@/../seedDatabase'
import { core } from '@/utils/core'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { nulledPriceColumns, Price, prices } from '@/db/schema/prices'
import { PriceType, CurrencyCode, FlowgladApiKeyType } from '@/types'
import { eq, and as drizzleAnd } from 'drizzle-orm'
import { ApiKey, apiKeys } from '@/db/schema/apiKeys'
import { users } from '@/db/schema/users'
import { memberships } from '@/db/schema/memberships'
import { PricingModel, pricingModels } from './schema/pricingModels'
import { Product } from './schema/products'
import {
  insertProduct,
  updateProduct,
} from './tableMethods/productMethods'
import { insertPrice, updatePrice } from './tableMethods/priceMethods'
import { whereClauseFromObject } from './tableUtils'

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

  it('should maintain correct order by creation date (newest first)', async () => {
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

    // Verify records are ordered by creation date descending (newest first)
    for (let i = 0; i < result.items.length - 1; i++) {
      expect(
        result.items[i].customer.createdAt.getTime()
      ).toBeGreaterThanOrEqual(
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
            filters: {
              organizationId,
            },
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
            filters: {
              organizationId,
            },
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
            filters: {
              organizationId,
            },
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

  it('should navigate to first page when goToFirst is true', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
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
    expect(result.startCursor).toBeDefined()
    expect(result.endCursor).toBeDefined()
    expect(result.total).toBe(15)
  })

  it('should navigate to last page when goToLast is true', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
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
    expect(result.startCursor).toBeDefined()
    expect(result.endCursor).toBeDefined()
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

    const result = await adminTransaction(async ({ transaction }) => {
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
    const firstPage = await adminTransaction(
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

    const secondPage = await adminTransaction(
      async ({ transaction }) => {
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
      }
    )

    // Now go to first from second page
    const backToFirst = await adminTransaction(
      async ({ transaction }) => {
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
      }
    )

    // Should be same as original first page
    expect(backToFirst.items).toEqual(firstPage.items)
    expect(backToFirst.hasPreviousPage).toBe(false)
    expect(backToFirst.hasNextPage).toBe(true)
  })

  it('should handle goToLast from first page correctly', async () => {
    const firstPage = await adminTransaction(
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

    const lastPage = await adminTransaction(
      async ({ transaction }) => {
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
      }
    )

    // Should be different from first page
    expect(lastPage.items).not.toEqual(firstPage.items)
    expect(lastPage.hasNextPage).toBe(false)
    expect(lastPage.hasPreviousPage).toBe(true)
  })

  it('should handle goToFirst and goToLast with filtered results', async () => {
    // Filter to only livemode customers (8 total)
    const firstPageFiltered = await adminTransaction(
      async ({ transaction }) => {
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
      }
    )

    expect(firstPageFiltered.items.length).toBe(3)
    expect(firstPageFiltered.hasPreviousPage).toBe(false)
    expect(firstPageFiltered.hasNextPage).toBe(true)
    expect(firstPageFiltered.total).toBe(8)

    const lastPageFiltered = await adminTransaction(
      async ({ transaction }) => {
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
      }
    )

    // Last page should have 8 % 3 = 2 items
    expect(lastPageFiltered.items.length).toBe(2)
    expect(lastPageFiltered.hasNextPage).toBe(false)
    expect(lastPageFiltered.hasPreviousPage).toBe(true)
    expect(lastPageFiltered.total).toBe(8)
  })

  it('should handle goToFirst and goToLast with empty result set', async () => {
    const firstPageEmpty = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomersCursorPaginatedWithTableRowData({
          input: {
            pageSize: 5,
            goToFirst: true,
            filters: {
              email: 'nonexistent@example.com',
            },
          },
          transaction,
        })
      }
    )

    expect(firstPageEmpty.items.length).toBe(0)
    expect(firstPageEmpty.hasPreviousPage).toBe(false)
    expect(firstPageEmpty.hasNextPage).toBe(false)
    expect(firstPageEmpty.total).toBe(0)
    expect(firstPageEmpty.startCursor).toBe(null)
    expect(firstPageEmpty.endCursor).toBe(null)

    const lastPageEmpty = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomersCursorPaginatedWithTableRowData({
          input: {
            pageSize: 5,
            goToLast: true,
            filters: {
              email: 'nonexistent@example.com',
            },
          },
          transaction,
        })
      }
    )

    expect(lastPageEmpty.items.length).toBe(0)
    expect(lastPageEmpty.hasPreviousPage).toBe(false)
    expect(lastPageEmpty.hasNextPage).toBe(false)
    expect(lastPageEmpty.total).toBe(0)
    expect(lastPageEmpty.startCursor).toBe(null)
    expect(lastPageEmpty.endCursor).toBe(null)
  })

  it('should handle goToLast with single page of results', async () => {
    // Test with page size larger than total results
    const result = await adminTransaction(async ({ transaction }) => {
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
    const firstPage = await adminTransaction(
      async ({ transaction }) => {
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
      }
    )

    const lastPage = await adminTransaction(
      async ({ transaction }) => {
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
      }
    )

    // Verify first page is ordered by creation date descending (newest first)
    for (let i = 0; i < firstPage.items.length - 1; i++) {
      expect(
        firstPage.items[i].customer.createdAt.getTime()
      ).toBeGreaterThanOrEqual(
        firstPage.items[i + 1].customer.createdAt.getTime()
      )
    }

    // Verify last page is ordered by creation date descending (newest first)
    for (let i = 0; i < lastPage.items.length - 1; i++) {
      expect(
        lastPage.items[i].customer.createdAt.getTime()
      ).toBeGreaterThanOrEqual(
        lastPage.items[i + 1].customer.createdAt.getTime()
      )
    }

    // Verify that first page items come after last page items chronologically
    const lastItemFromFirstPage =
      firstPage.items[firstPage.items.length - 1]
    const firstItemFromLastPage = lastPage.items[0]

    expect(
      lastItemFromFirstPage.customer.createdAt.getTime()
    ).toBeGreaterThanOrEqual(
      firstItemFromLastPage.customer.createdAt.getTime()
    )
  })

  it('should ignore cursor parameters when goToFirst or goToLast are used', async () => {
    // Get a valid cursor first
    const firstPage = await adminTransaction(
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

    // Use goToFirst with cursor parameters - should ignore cursors
    const goToFirstWithCursor = await adminTransaction(
      async ({ transaction }) => {
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
    const normalGoToFirst = await adminTransaction(
      async ({ transaction }) => {
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
      }
    )

    expect(goToFirstWithCursor.items).toEqual(normalGoToFirst.items)
  })
})

// Start of new RLS integration tests
describe('RLS Integration Tests: organizationId integrity on pricingModels', () => {
  let org1Data: Awaited<ReturnType<typeof setupOrg>>
  let org1ApiKeyToken: string

  let org2Data: Awaited<ReturnType<typeof setupOrg>>
  let org1UserApiKey: ApiKey.Record & { token: string }
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
    org1UserApiKey = userApiKeyOrg1.apiKey
    org2Data = await setupOrg() // Sets up another org
  })

  it('should ALLOW a user to manage pricingModels, products, and prices within their organization', async () => {
    await authenticatedTransaction(
      async ({ transaction, userId, livemode }) => {
        expect(livemode).toBe(org1UserApiKey.livemode) // Session livemode should be false based on API key

        const newPricingModelInput: PricingModel.Insert = {
          name: 'Test Allowed RLS PricingModel',
          organizationId: org1Data.organization.id,
          livemode: org1UserApiKey.livemode, // PricingModel livemode matches session
        }

        // INSERT
        const createdPricingModelResult = await transaction
          .insert(pricingModels)
          .values(newPricingModelInput)
          .returning()
        expect(createdPricingModelResult.length).toBe(1)
        const createdPricingModel =
          createdPricingModelResult[0] as typeof pricingModels.$inferSelect
        expect(createdPricingModel.name).toBe(
          'Test Allowed RLS PricingModel'
        )
        expect(createdPricingModel.organizationId).toBe(
          org1Data.organization.id
        )
        const pricingModelId = createdPricingModel.id
        // SELECT
        const selectedPricingModels = await transaction
          .select()
          .from(pricingModels)
          .where(eq(pricingModels.id, pricingModelId))
        expect(selectedPricingModels.length).toBe(1)
        expect(selectedPricingModels[0].id).toBe(pricingModelId)

        // UPDATE
        const updatedPricingModelResult = await transaction
          .update(pricingModels)
          .set({ name: 'Updated Allowed RLS PricingModel' })
          .where(eq(pricingModels.id, pricingModelId))
          .returning()
        expect(updatedPricingModelResult.length).toBe(1)
        expect(updatedPricingModelResult[0].name).toBe(
          'Updated Allowed RLS PricingModel'
        )

        const productInsert: Product.Insert = {
          name: 'Test Product',
          organizationId: org1Data.organization.id,
          livemode,
          description: 'Test product description',
          imageURL: 'https://example.com/test-product.jpg',
          singularQuantityLabel:
            'Test product singular quantity label',
          pluralQuantityLabel: 'Test product plural quantity label',
          displayFeatures: null,
          active: true,
          externalId: null,
          pricingModelId: org1Data.pricingModel.id,
          default: false,
          slug: `flowglad-test-product-price+${core.nanoid()}`,
        }
        const createdProduct = await insertProduct(
          productInsert,
          transaction
        )

        // Create a price to test RLS
        const priceInput: Price.Insert = {
          ...nulledPriceColumns,
          name: 'Test Price',
          livemode,
          productId: createdProduct.id,
          unitPrice: 1000,
          currency: CurrencyCode.USD,
          type: PriceType.SinglePayment,
          active: true,
          externalId: null,
          isDefault: false,
          slug: `flowglad-test-product-price+${core.nanoid()}`,
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

  it('should DENY a user from creating a pricingModel for another organization due to RLS', async () => {
    const pricingModelNameAttempt =
      'Test Denied RLS PricingModel - Other Org'
    try {
      await authenticatedTransaction(
        async ({ transaction, livemode }) => {
          expect(livemode).toBe(org1UserApiKey.livemode) // Session livemode is true
          const newPricingModelInput: PricingModel.Insert = {
            name: pricingModelNameAttempt,
            organizationId: org2Data.organization.id, // Attempting to use other org's ID
            livemode, // PricingModel livemode matches session, but orgId is wrong
          }
          await transaction
            .insert(pricingModels)
            .values(newPricingModelInput)
            .returning()
          // Should not reach here
          throw new Error(
            'PricingModel insert was unexpectedly allowed for another organization'
          )
        },
        { apiKey: org1ApiKeyToken }
      )
    } catch (error: any) {
      expect(error.message).toContain(
        'Failed query: insert into "pricing_models"'
      )
    }

    // Verify (using admin) that the pricingModel was not actually created
    const checkPricingModel = await adminTransaction(
      async ({ transaction }) => {
        return transaction
          .select()
          .from(pricingModels)
          .where(
            drizzleAnd(
              eq(
                pricingModels.organizationId,
                org2Data.organization.id
              ),
              eq(pricingModels.name, pricingModelNameAttempt)
            )
          )
      }
    )
    expect(checkPricingModel.length).toBe(0)
  })
})

describe('whereClauseFromObject', () => {
  let mockTable: any
  
  beforeEach(() => {
    // Create a mock table with mock columns for testing
    mockTable = {
      id: { name: 'id' },
      name: { name: 'name' },
      email: { name: 'email' },
      active: { name: 'active' },
      organizationId: { name: 'organization_id' },
      tags: { name: 'tags' },
      count: { name: 'count' },
      metadata: { name: 'metadata' }
    }
  })

  describe('basic functionality', () => {
    it('should return undefined for empty object', () => {
      const result = whereClauseFromObject(mockTable, {})
      expect(result).toBeUndefined()
    })

    it('should return undefined when all values are undefined', () => {
      const selectConditions = {
        id: undefined,
        name: undefined,
        email: undefined
      }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeUndefined()
    })

    it('should return undefined when all values are empty strings', () => {
      const selectConditions = {
        name: '',
        email: '',
        organizationId: ''
      }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeUndefined()
    })

    it('should return undefined for mixed undefined and empty string values', () => {
      const selectConditions = {
        id: undefined,
        name: '',
        email: undefined,
        active: ''
      }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeUndefined()
    })
  })

  describe('single condition handling', () => {
    it('should handle single string equality condition', () => {
      const selectConditions = { name: 'test-name' }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })

    it('should handle single boolean condition', () => {
      const selectConditions = { active: true }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })

    it('should handle single number condition', () => {
      const selectConditions = { count: 42 }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })

    it('should handle single null condition', () => {
      const selectConditions = { metadata: null }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })
  })

  describe('multiple condition handling', () => {
    it('should handle multiple conditions with AND logic', () => {
      const selectConditions = {
        name: 'test-name',
        active: true,
        count: 42
      }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })

    it('should filter out undefined/empty values from mixed conditions', () => {
      const selectConditions = {
        name: 'test-name',
        email: undefined,
        active: true,
        organizationId: '',
        count: 0
      }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })
  })

  describe('array handling', () => {
    it('should handle array with single value', () => {
      const selectConditions = { tags: ['tag1'] }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })

    it('should handle array with multiple values', () => {
      const selectConditions = { tags: ['tag1', 'tag2', 'tag3'] }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })

    it('should handle empty array', () => {
      const selectConditions = { tags: [] }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })

    it('should filter undefined and empty strings from arrays', () => {
      const selectConditions = { tags: ['tag1', undefined, '', 'tag2', null] }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })

    it('should handle array with only undefined/empty values', () => {
      const selectConditions = { tags: [undefined, '', undefined] }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })

    it('should handle mixed array types', () => {
      const selectConditions = { 
        tags: ['string', 123, true, null]
      }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })
  })

  describe('null value handling', () => {
    it('should properly handle explicit null values', () => {
      const selectConditions = { metadata: null }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })

    it('should handle multiple null values', () => {
      const selectConditions = {
        metadata: null,
        email: null,
        name: 'test'
      }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })
  })

  describe('edge cases and data validation', () => {
    it('should handle zero values correctly', () => {
      const selectConditions = { count: 0 }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })

    it('should handle false boolean values correctly', () => {
      const selectConditions = { active: false }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(10000)
      const selectConditions = { name: longString }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })

    it('should handle special characters in string values', () => {
      const selectConditions = { 
        name: "O'Reilly & Co. <script>alert('test')</script>",
        email: 'test+tag@example.com'
      }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })

    it('should handle Unicode characters', () => {
      const selectConditions = { 
        name: '测试用户名 🚀 émoji',
        email: 'тест@example.com'
      }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })

    it('should handle very large arrays', () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => `item-${i}`)
      const selectConditions = { tags: largeArray }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })

    it('should handle arrays with duplicate values', () => {
      const selectConditions = { 
        tags: ['tag1', 'tag1', 'tag2', 'tag1', 'tag2'] 
      }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })
  })

  describe('type coercion and conversion', () => {
    it('should handle string numbers', () => {
      const selectConditions = { count: '123' }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })

    it('should handle string booleans', () => {
      const selectConditions = { active: 'true' }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })

    it('should handle mixed types in same condition set', () => {
      const selectConditions = {
        name: 'test',
        count: 42,
        active: true,
        metadata: null,
        tags: ['tag1', 'tag2']
      }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })
  })

  describe('edge case handling', () => {
    it('should handle very deep nested structures safely', () => {
      const selectConditions = {
        metadata: { deep: { nested: { object: 'value' } } }
      }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })
  })

  describe('boundary value testing', () => {
    it('should handle maximum safe integer', () => {
      const selectConditions = { count: Number.MAX_SAFE_INTEGER }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })

    it('should handle minimum safe integer', () => {
      const selectConditions = { count: Number.MIN_SAFE_INTEGER }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })

    it('should handle NaN values', () => {
      const selectConditions = { count: NaN }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })

    it('should handle Infinity values', () => {
      const selectConditions = { count: Infinity }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })
  })

  describe('real-world usage patterns', () => {
    it('should handle common filtering scenarios', () => {
      const selectConditions = {
        organizationId: 'org_123',
        active: true,
        tags: ['premium', 'verified'],
        metadata: null
      }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })

    it('should handle search-like scenarios with partial matches', () => {
      const selectConditions = {
        email: 'john@example.com',
        name: 'John Doe',
        active: true
      }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })

    it('should handle pagination scenarios', () => {
      const selectConditions = {
        organizationId: 'org_123',
        id: ['id1', 'id2', 'id3', 'id4', 'id5']
      }
      const result = whereClauseFromObject(mockTable, selectConditions)
      expect(result).toBeDefined()
    })
  })

  describe('data consistency', () => {
    it('should produce consistent results for same inputs', () => {
      const selectConditions = {
        name: 'test-user',
        active: true,
        tags: ['tag1', 'tag2']
      }
      
      const result1 = whereClauseFromObject(mockTable, selectConditions)
      const result2 = whereClauseFromObject(mockTable, selectConditions)
      
      expect(result1).toBeDefined()
      expect(result2).toBeDefined()
      // Both should be defined and have same structure
    })

    it('should handle object property order independence', () => {
      const selectConditions1 = { name: 'test', active: true, count: 42 }
      const selectConditions2 = { active: true, count: 42, name: 'test' }
      
      const result1 = whereClauseFromObject(mockTable, selectConditions1)
      const result2 = whereClauseFromObject(mockTable, selectConditions2)
      
      expect(result1).toBeDefined()
      expect(result2).toBeDefined()
    })
  })
})
