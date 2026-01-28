import { beforeEach, describe, expect, it } from 'bun:test'
import type { Metadata } from 'next'
import { setupOrg } from '@/../seedDatabase'
import { generateMetadata as generateMetadataForPrice } from '@/app/price/[priceId]/purchase/page'
import { generateMetadata as generateMetadataForProduct } from '@/app/product/[productId]/purchase/page'
import type { Organization } from '@/db/schema/organizations'
import type { Price } from '@/db/schema/prices'
import type { Product } from '@/db/schema/products'

describe('generateMetadata for checkout pages', () => {
  let organization: Organization.Record
  let product: Product.Record
  let price: Price.Record

  beforeEach(async () => {
    // Set up organization, product, and price using real database
    const orgData = (await setupOrg()).unwrap()
    organization = orgData.organization
    product = orgData.product
    price = orgData.price
  })

  describe('generateMetadata for price-based checkout', () => {
    it('should return organization and product name as title', async () => {
      // Test with real database data
      const metadata: Metadata = await generateMetadataForPrice({
        params: Promise.resolve({ priceId: price.id }),
      })

      expect(metadata.title).toBe(
        `${organization.name} | ${product.name}`
      )
    })

    it('should return fallback "Checkout" title for non-existent price', async () => {
      // Test with invalid price ID
      const metadata: Metadata = await generateMetadataForPrice({
        params: Promise.resolve({ priceId: 'non_existent_price_id' }),
      })

      // Should fall back to generic title when price not found
      expect(metadata.title).toBe('Checkout')
    })
  })

  describe('generateMetadata for product-based checkout', () => {
    it('should return organization and product name as title', async () => {
      const metadata: Metadata = await generateMetadataForProduct({
        params: Promise.resolve({ productId: product.id }),
      })

      expect(metadata.title).toBe(
        `${organization.name} | ${product.name}`
      )
    })

    it('should return fallback "Checkout" title for non-existent product', async () => {
      const metadata: Metadata = await generateMetadataForProduct({
        params: Promise.resolve({
          productId: 'non_existent_product_id',
        }),
      })

      expect(metadata.title).toBe('Checkout')
    })
  })
})
