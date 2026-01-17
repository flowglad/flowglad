import type { Flowglad as FlowgladNode } from '@flowglad/node'
import { describe, expect, it } from 'vitest'
import { constructGetPrice, constructGetProduct } from './utils'

type Catalog = FlowgladNode.CustomerRetrieveBillingResponse['catalog']
type Product =
  FlowgladNode.CustomerRetrieveBillingResponse['catalog']['products'][number]
type Price = Product['prices'][number]

// Helper to create a minimal price fixture
const createPrice = (overrides: Partial<Price> = {}): Price =>
  ({
    id: 'price_default',
    slug: 'default-price',
    type: 'subscription',
    name: 'Default Price',
    livemode: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }) as Price

// Helper to create a minimal product fixture
const createProduct = (overrides: Partial<Product> = {}): Product =>
  ({
    id: 'prod_default',
    slug: 'default-product',
    name: 'Default Product',
    livemode: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    prices: [],
    ...overrides,
  }) as Product

type UsageMeter = Catalog['usageMeters'][number]

// Helper to create a minimal usage meter fixture with prices
const createUsageMeter = (
  overrides: Partial<UsageMeter> & { prices?: Price[] } = {}
): UsageMeter & { prices?: Price[] } =>
  ({
    id: 'meter_default',
    slug: 'default-meter',
    name: 'Default Meter',
    aggregationType: 'sum',
    livemode: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    organizationId: 'org_default',
    pricingModelId: 'pm_default',
    ...overrides,
  }) as UsageMeter & { prices?: Price[] }

// Helper to create a minimal catalog fixture
const createCatalog = (
  overrides: Partial<Catalog> & {
    usageMeters?: Array<UsageMeter & { prices?: Price[] }>
  } = {}
): Catalog =>
  ({
    id: 'catalog_default',
    products: [],
    usageMeters: [],
    ...overrides,
  }) as unknown as Catalog

describe('constructGetProduct', () => {
  it('returns the product when the catalog contains a product with the given slug', () => {
    const product = createProduct({
      id: 'prod_123',
      slug: 'pro-plan',
      name: 'Pro Plan',
    })
    const catalog = createCatalog({ products: [product] })
    const getProduct = constructGetProduct(catalog)

    const result = getProduct('pro-plan')

    expect(result?.id).toBe('prod_123')
    expect(result?.slug).toBe('pro-plan')
    expect(result?.name).toBe('Pro Plan')
  })

  it('returns null when the catalog does not contain a product with the given slug', () => {
    const product = createProduct({ slug: 'existing-product' })
    const catalog = createCatalog({ products: [product] })
    const getProduct = constructGetProduct(catalog)

    const result = getProduct('non-existent-product')

    expect(result).toBeNull()
  })

  it('returns null when the catalog has no products', () => {
    const catalog = createCatalog({ products: [] })
    const getProduct = constructGetProduct(catalog)

    const result = getProduct('any-slug')

    expect(result).toBeNull()
  })

  it('returns the correct product when the catalog contains multiple products', () => {
    const freeProduct = createProduct({
      id: 'prod_free',
      slug: 'free-plan',
      name: 'Free Plan',
    })
    const proProduct = createProduct({
      id: 'prod_pro',
      slug: 'pro-plan',
      name: 'Pro Plan',
    })
    const enterpriseProduct = createProduct({
      id: 'prod_ent',
      slug: 'enterprise-plan',
      name: 'Enterprise Plan',
    })
    const catalog = createCatalog({
      products: [freeProduct, proProduct, enterpriseProduct],
    })
    const getProduct = constructGetProduct(catalog)

    const freeResult = getProduct('free-plan')
    const proResult = getProduct('pro-plan')
    const enterpriseResult = getProduct('enterprise-plan')

    expect(freeResult?.id).toBe('prod_free')
    expect(proResult?.id).toBe('prod_pro')
    expect(enterpriseResult?.id).toBe('prod_ent')
  })
})

describe('constructGetPrice', () => {
  describe('product prices', () => {
    it('returns the price when the catalog contains a product with a price matching the given slug', () => {
      const price = createPrice({
        id: 'price_pro_monthly',
        slug: 'pro-monthly',
        type: 'subscription',
      })
      const product = createProduct({
        slug: 'pro-plan',
        prices: [price],
      })
      const catalog = createCatalog({ products: [product] })
      const getPrice = constructGetPrice(catalog)

      const result = getPrice('pro-monthly')

      expect(result?.id).toBe('price_pro_monthly')
      expect(result?.slug).toBe('pro-monthly')
      expect(result?.type).toBe('subscription')
    })

    it('returns null when no product price matches the given slug', () => {
      const price = createPrice({ slug: 'existing-price' })
      const product = createProduct({ prices: [price] })
      const catalog = createCatalog({ products: [product] })
      const getPrice = constructGetPrice(catalog)

      const result = getPrice('non-existent-price')

      expect(result).toBeNull()
    })

    it('returns the correct price when multiple products have multiple prices', () => {
      const freePrice = createPrice({
        id: 'price_free',
        slug: 'free-monthly',
      })
      const proMonthlyPrice = createPrice({
        id: 'price_pro_monthly',
        slug: 'pro-monthly',
      })
      const proYearlyPrice = createPrice({
        id: 'price_pro_yearly',
        slug: 'pro-yearly',
      })
      const freeProduct = createProduct({
        slug: 'free-plan',
        prices: [freePrice],
      })
      const proProduct = createProduct({
        slug: 'pro-plan',
        prices: [proMonthlyPrice, proYearlyPrice],
      })
      const catalog = createCatalog({
        products: [freeProduct, proProduct],
      })
      const getPrice = constructGetPrice(catalog)

      expect(getPrice('free-monthly')?.id).toBe('price_free')
      expect(getPrice('pro-monthly')?.id).toBe('price_pro_monthly')
      expect(getPrice('pro-yearly')?.id).toBe('price_pro_yearly')
    })
  })

  describe('usage meter prices', () => {
    it('returns the price when a usage meter contains a price matching the given slug', () => {
      const usagePrice = createPrice({
        id: 'price_api_calls',
        slug: 'api-calls-price',
        type: 'usage',
      })
      const usageMeter = createUsageMeter({
        id: 'meter_api_calls',
        slug: 'api-calls',
        prices: [usagePrice],
      })
      const catalog = createCatalog({
        products: [],
        usageMeters: [usageMeter],
      })
      const getPrice = constructGetPrice(catalog)

      const result = getPrice('api-calls-price')

      expect(result?.id).toBe('price_api_calls')
      expect(result?.slug).toBe('api-calls-price')
      expect(result?.type).toBe('usage')
    })

    it('returns null when no usage meter price matches the given slug', () => {
      const usagePrice = createPrice({
        slug: 'existing-usage-price',
        type: 'usage',
      })
      const usageMeter = createUsageMeter({
        id: 'meter_1',
        slug: 'some-meter',
        prices: [usagePrice],
      })
      const catalog = createCatalog({
        usageMeters: [usageMeter],
      })
      const getPrice = constructGetPrice(catalog)

      const result = getPrice('non-existent-usage-price')

      expect(result).toBeNull()
    })

    it('handles usage meters without prices array gracefully', () => {
      const usageMeterWithoutPrices = createUsageMeter({
        id: 'meter_no_prices',
        slug: 'meter-no-prices',
        // No prices property - using createUsageMeter defaults
      })
      // Remove the prices property to test the graceful handling
      delete (usageMeterWithoutPrices as { prices?: Price[] }).prices
      const catalog = createCatalog({
        usageMeters: [usageMeterWithoutPrices],
      })
      const getPrice = constructGetPrice(catalog)

      const result = getPrice('any-slug')

      expect(result).toBeNull()
    })

    it('returns the correct price when multiple usage meters have prices', () => {
      const apiCallsPrice = createPrice({
        id: 'price_api_calls',
        slug: 'api-calls-per-request',
        type: 'usage',
      })
      const storagePrice = createPrice({
        id: 'price_storage',
        slug: 'storage-per-gb',
        type: 'usage',
      })
      const apiMeter = createUsageMeter({
        id: 'meter_api',
        slug: 'api-calls',
        prices: [apiCallsPrice],
      })
      const storageMeter = createUsageMeter({
        id: 'meter_storage',
        slug: 'storage',
        prices: [storagePrice],
      })
      const catalog = createCatalog({
        usageMeters: [apiMeter, storageMeter],
      })
      const getPrice = constructGetPrice(catalog)

      expect(getPrice('api-calls-per-request')?.id).toBe(
        'price_api_calls'
      )
      expect(getPrice('storage-per-gb')?.id).toBe('price_storage')
    })
  })

  describe('combined product and usage meter prices', () => {
    it('returns prices from both products and usage meters', () => {
      const subscriptionPrice = createPrice({
        id: 'price_sub',
        slug: 'pro-monthly',
        type: 'subscription',
      })
      const usagePrice = createPrice({
        id: 'price_usage',
        slug: 'api-calls-price',
        type: 'usage',
      })
      const product = createProduct({
        slug: 'pro-plan',
        prices: [subscriptionPrice],
      })
      const usageMeter = createUsageMeter({
        id: 'meter_api',
        slug: 'api-calls',
        prices: [usagePrice],
      })
      const catalog = createCatalog({
        products: [product],
        usageMeters: [usageMeter],
      })
      const getPrice = constructGetPrice(catalog)

      const subResult = getPrice('pro-monthly')
      const usageResult = getPrice('api-calls-price')

      expect(subResult?.id).toBe('price_sub')
      expect(subResult?.type).toBe('subscription')
      expect(usageResult?.id).toBe('price_usage')
      expect(usageResult?.type).toBe('usage')
    })

    it('returns null when the catalog has no products and no usage meter prices', () => {
      const catalog = createCatalog({
        products: [],
        usageMeters: [],
      })
      const getPrice = constructGetPrice(catalog)

      const result = getPrice('any-slug')

      expect(result).toBeNull()
    })

    it('handles a catalog with products but empty usage meters', () => {
      const price = createPrice({
        id: 'price_only_product',
        slug: 'product-price',
      })
      const product = createProduct({ prices: [price] })
      const catalog = createCatalog({
        products: [product],
        usageMeters: [],
      })
      const getPrice = constructGetPrice(catalog)

      expect(getPrice('product-price')?.id).toBe('price_only_product')
      expect(getPrice('non-existent')).toBeNull()
    })

    it('handles a catalog with usage meters but no products', () => {
      const usagePrice = createPrice({
        id: 'price_only_usage',
        slug: 'usage-price',
        type: 'usage',
      })
      const usageMeter = createUsageMeter({
        id: 'meter_1',
        slug: 'meter',
        prices: [usagePrice],
      })
      const catalog = createCatalog({
        products: [],
        usageMeters: [usageMeter],
      })
      const getPrice = constructGetPrice(catalog)

      expect(getPrice('usage-price')?.id).toBe('price_only_usage')
      expect(getPrice('non-existent')).toBeNull()
    })
  })

  describe('edge cases', () => {
    it('handles prices with null slugs by not making them retrievable', () => {
      const priceWithNullSlug = createPrice({
        id: 'price_null_slug',
        slug: null as unknown as string,
      })
      const product = createProduct({ prices: [priceWithNullSlug] })
      const catalog = createCatalog({ products: [product] })
      const getPrice = constructGetPrice(catalog)

      // Cannot retrieve a price with null slug using any string
      expect(getPrice('')).toBeNull()
      expect(getPrice('null')).toBeNull()
    })

    it('returns the last price when duplicate slugs exist across products and usage meters', () => {
      // This tests the Map behavior where later entries override earlier ones
      const productPrice = createPrice({
        id: 'price_from_product',
        slug: 'duplicate-slug',
        type: 'subscription',
      })
      const usagePrice = createPrice({
        id: 'price_from_usage_meter',
        slug: 'duplicate-slug',
        type: 'usage',
      })
      const product = createProduct({ prices: [productPrice] })
      const usageMeter = createUsageMeter({
        id: 'meter_1',
        slug: 'meter',
        prices: [usagePrice],
      })
      const catalog = createCatalog({
        products: [product],
        usageMeters: [usageMeter],
      })
      const getPrice = constructGetPrice(catalog)

      // Usage meter prices are added after product prices, so they override
      const result = getPrice('duplicate-slug')
      expect(result?.id).toBe('price_from_usage_meter')
    })
  })
})
