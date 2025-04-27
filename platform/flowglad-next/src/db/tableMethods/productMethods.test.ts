import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import { DbTransaction } from '@/db/types'
import { getProductTableRows } from './productMethods'
import { insertUser } from './userMethods'
import {
  setupOrg,
  setupCatalog,
  setupMemberships,
  setupProduct,
  setupPrice,
} from '../../../seedDatabase'
import { PriceType, IntervalUnit, CurrencyCode } from '@/types'
import core from '@/utils/core'

describe('getProductTableRows', () => {
  let organizationId: string
  let userId: string
  let secondProductId: string
  let thirdProductId: string
  let secondPriceId: string
  let thirdPriceId: string
  let catalogId: string

  beforeEach(async () => {
    // Set up organization
    const { organization } = await setupOrg()
    organizationId = organization.id

    const membership = await setupMemberships({ organizationId })
    userId = membership.userId

    // Set up catalog
    const catalog = await setupCatalog({
      organizationId,
      name: 'Test Catalog',
    })
    catalogId = catalog.id

    // Set up products
    const secondProduct = await setupProduct({
      organizationId,
      name: 'Product 1',
      catalogId,
    })
    secondProductId = secondProduct.id

    const thirdProduct = await setupProduct({
      organizationId,
      name: 'Product 2',
      catalogId,
    })
    thirdProductId = thirdProduct.id

    // Set up prices
    const secondPrice = await setupPrice({
      productId: secondProductId,
      name: 'Price 1',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 1000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      setupFeeAmount: 0,
      trialPeriodDays: 0,
      externalId: undefined,
      usageMeterId: undefined,
    })
    secondPriceId = secondPrice.id

    const thirdPrice = await setupPrice({
      productId: thirdProductId,
      name: 'Price 2',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Year,
      intervalCount: 1,
      unitPrice: 10000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      setupFeeAmount: 0,
      trialPeriodDays: 0,
      externalId: undefined,
      usageMeterId: undefined,
    })
    thirdPriceId = thirdPrice.id
  })

  it("should return products with prices and catalogs for the user's organization, sorted by creation date descending", async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return getProductTableRows(
        {
          cursor: '0',
          limit: 10,
        },
        transaction,
        userId
      )
    })

    expect(result.data.length).toBe(3)
    expect(result.total).toBe(3)
    expect(result.hasMore).toBe(false)

    // Check first product
    expect(result.data[1].product.id).toBe(secondProductId)
    expect(result.data[1].product.name).toBe('Product 1')
    expect(result.data[1].product.active).toBe(true)
    expect(result.data[1].prices.length).toBe(1)
    expect(result.data[1].prices[0].id).toBe(secondPriceId)
    expect(result.data[1].catalog?.id).toBe(catalogId)

    // Check second product
    expect(result.data[0].product.id).toBe(thirdProductId)
    expect(result.data[0].product.name).toBe('Product 2')
    expect(result.data[0].product.active).toBe(true)
    expect(result.data[0].prices.length).toBe(1)
    expect(result.data[0].prices[0].id).toBe(thirdPriceId)
    expect(result.data[0].catalog?.id).toBe(catalogId)
  })

  it('should filter products by active status', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return getProductTableRows(
        {
          cursor: '0',
          limit: 10,
          filters: {
            active: true,
          },
        },
        transaction,
        userId
      )
    })

    expect(result.data.length).toBe(3)
    expect(result.total).toBe(3)
    expect(result.hasMore).toBe(false)
    expect(result.data[1].product.id).toBe(secondProductId)
    expect(result.data[0].product.active).toBe(true)
  })

  it('should filter products by organization ID', async () => {
    // Create another organization
    const { organization: otherOrg } = await setupOrg()
    const otherUser = await adminTransaction(
      async ({ transaction }) => {
        return insertUser(
          {
            id: `other-user-id-${core.nanoid()}`,
            email: 'other@example.com',
            name: 'Other User',
          },
          transaction
        )
      }
    )
    await setupMemberships({ organizationId: otherOrg.id })

    // Create a product in the other organization
    const otherCatalog = await setupCatalog({
      organizationId: otherOrg.id,
      name: 'Other Catalog',
    })
    const otherProduct = await setupProduct({
      organizationId: otherOrg.id,
      name: 'Other Product',
      catalogId: otherCatalog.id,
    })
    await setupPrice({
      productId: otherProduct.id,
      name: 'Other Price',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 2000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      setupFeeAmount: 0,
      trialPeriodDays: 0,
      externalId: undefined,
      usageMeterId: undefined,
    })

    // Get products for the original user
    const result = await adminTransaction(async ({ transaction }) => {
      return getProductTableRows(
        {
          cursor: '0',
          limit: 10,
        },
        transaction,
        userId
      )
    })

    // Should only return products from the original organization
    expect(result.data.length).toBe(3)
    expect(result.total).toBe(3)
    expect(
      result.data.every(
        (p) => p.product.organizationId === organizationId
      )
    ).toBe(true)
  })

  it('should apply pagination correctly', async () => {
    // Create additional products to test pagination
    for (let i = 3; i <= 12; i++) {
      const product = await setupProduct({
        organizationId,
        name: `Product ${i}`,
        catalogId,
      })
      await setupPrice({
        productId: product.id,
        name: `Price ${i}`,
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        unitPrice: 1000 * i,
        currency: CurrencyCode.USD,
        livemode: true,
        isDefault: true,
        setupFeeAmount: 0,
        trialPeriodDays: 0,
        externalId: undefined,
        usageMeterId: undefined,
      })
    }

    // First page
    const result1 = await adminTransaction(
      async ({ transaction }) => {
        return getProductTableRows(
          {
            cursor: '0',
            limit: 5,
          },
          transaction,
          userId
        )
      }
    )

    expect(result1.data.length).toBe(5)
    expect(result1.total).toBe(13)
    expect(result1.hasMore).toBe(true)

    // Second page
    const result2 = await adminTransaction(
      async ({ transaction }) => {
        return getProductTableRows(
          {
            cursor: '1',
            limit: 5,
          },
          transaction,
          userId
        )
      }
    )

    expect(result2.data.length).toBe(5)
    expect(result2.total).toBe(13)
    expect(result2.hasMore).toBe(true)

    // Third page
    const result3 = await adminTransaction(
      async ({ transaction }) => {
        return getProductTableRows(
          {
            cursor: '2',
            limit: 5,
          },
          transaction,
          userId
        )
      }
    )

    expect(result3.data.length).toBe(3)
    expect(result3.total).toBe(13)
    expect(result3.hasMore).toBe(false)
  })

  it('should handle products with multiple prices', async () => {
    // Add another price to the first product
    await setupPrice({
      productId: secondProductId,
      name: 'Price 1B',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Year,
      intervalCount: 1,
      unitPrice: 10000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: false,
      setupFeeAmount: 0,
      trialPeriodDays: 0,
      externalId: undefined,
      usageMeterId: undefined,
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return getProductTableRows(
        {
          cursor: '0',
          limit: 10,
        },
        transaction,
        userId
      )
    })

    expect(result.data.length).toBe(3)

    // Check that the first product has two prices
    const secondProduct = result.data.find(
      (p) => p.product.id === secondProductId
    )
    expect(secondProduct?.prices.length).toBe(2)
  })

  it('should sort products by creation date in descending order', async () => {
    // Create a new product that should appear first
    const newProduct = await setupProduct({
      organizationId,
      name: 'New Product',
      catalogId,
    })
    await setupPrice({
      productId: newProduct.id,
      name: 'New Price',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 2000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      setupFeeAmount: 0,
      trialPeriodDays: 0,
      externalId: undefined,
      usageMeterId: undefined,
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return getProductTableRows(
        {
          cursor: '0',
          limit: 10,
        },
        transaction,
        userId
      )
    })

    // The newest product should be first
    expect(result.data[0].product.id).toBe(newProduct.id)
  })
})
