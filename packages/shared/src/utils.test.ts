import type { Flowglad as FlowgladNode } from '@flowglad/node'
import { describe, expect, it } from 'vitest'
import { constructGetPrice, constructGetProduct } from './utils'

type PricingModel =
  FlowgladNode.CustomerRetrieveBillingResponse['pricingModel']
type Product =
  FlowgladNode.CustomerRetrieveBillingResponse['pricingModel']['products'][number]
type Price = Product['prices'][number]
type UsagePrice = FlowgladNode.UsagePriceClientSelectSchema

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

// Helper to create a minimal usage price fixture
const createUsagePrice = (
  overrides: Partial<UsagePrice> = {}
): UsagePrice =>
  ({
    id: 'price_default_usage',
    slug: 'default-usage-price',
    type: 'usage',
    name: 'Default Usage Price',
    livemode: false,
    createdAt: 1704067200000,
    updatedAt: 1704067200000,
    active: true,
    currency: 'USD',
    intervalCount: 1,
    intervalUnit: 'month',
    isDefault: false,
    pricingModelId: 'pm_default',
    productId: null,
    trialPeriodDays: null,
    unitPrice: 100,
    usageEventsPerUnit: 1,
    usageMeterId: 'meter_default',
    ...overrides,
  }) as UsagePrice

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

type UsageMeter = PricingModel['usageMeters'][number]

// Helper to create a minimal usage meter fixture (usage meters no longer have prices directly)
const createUsageMeter = (
  overrides: Partial<UsageMeter> = {}
): UsageMeter =>
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
  }) as UsageMeter

// Helper to create a minimal pricing model fixture
const createPricingModel = (
  overrides: Partial<PricingModel> = {}
): PricingModel =>
  ({
    id: 'pm_default',
    products: [],
    usageMeters: [],
    ...overrides,
  }) as unknown as PricingModel

describe('constructGetProduct', () => {
  it('returns the product when the pricing model contains a product with the given slug', () => {
    const product = createProduct({
      id: 'prod_123',
      slug: 'pro-plan',
      name: 'Pro Plan',
    })
    const pricingModel = createPricingModel({ products: [product] })
    const getProduct = constructGetProduct(pricingModel)

    const result = getProduct('pro-plan')

    expect(result?.id).toBe('prod_123')
    expect(result?.slug).toBe('pro-plan')
    expect(result?.name).toBe('Pro Plan')
  })

  it('returns null when the pricing model does not contain a product with the given slug', () => {
    const product = createProduct({ slug: 'existing-product' })
    const pricingModel = createPricingModel({ products: [product] })
    const getProduct = constructGetProduct(pricingModel)

    const result = getProduct('non-existent-product')

    expect(result).toBeNull()
  })

  it('returns null when the pricing model has no products', () => {
    const pricingModel = createPricingModel({ products: [] })
    const getProduct = constructGetProduct(pricingModel)

    const result = getProduct('any-slug')

    expect(result).toBeNull()
  })

  it('returns the correct product when the pricing model contains multiple products', () => {
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
    const pricingModel = createPricingModel({
      products: [freeProduct, proProduct, enterpriseProduct],
    })
    const getProduct = constructGetProduct(pricingModel)

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
    it('returns the price when the pricing model contains a product with a price matching the given slug', () => {
      const price = createPrice({
        id: 'price_pro_monthly',
        slug: 'pro-monthly',
        type: 'subscription',
      })
      const product = createProduct({
        slug: 'pro-plan',
        prices: [price],
      })
      const pricingModel = createPricingModel({ products: [product] })
      const getPrice = constructGetPrice(pricingModel)

      const result = getPrice('pro-monthly')

      expect(result?.id).toBe('price_pro_monthly')
      expect(result?.slug).toBe('pro-monthly')
      expect(result?.type).toBe('subscription')
    })

    it('returns null when no product price matches the given slug', () => {
      const price = createPrice({ slug: 'existing-price' })
      const product = createProduct({ prices: [price] })
      const pricingModel = createPricingModel({ products: [product] })
      const getPrice = constructGetPrice(pricingModel)

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
      const pricingModel = createPricingModel({
        products: [freeProduct, proProduct],
      })
      const getPrice = constructGetPrice(pricingModel)

      expect(getPrice('free-monthly')?.id).toBe('price_free')
      expect(getPrice('pro-monthly')?.id).toBe('price_pro_monthly')
      expect(getPrice('pro-yearly')?.id).toBe('price_pro_yearly')
    })
  })

  describe('usage prices', () => {
    it('returns the usage price when a product contains a usage price matching the given slug', () => {
      const usagePrice = createUsagePrice({
        id: 'price_api_calls',
        slug: 'api-calls-price',
        usageMeterId: 'meter_api_calls',
      })
      const product = createProduct({
        slug: 'usage-product',
        prices: [usagePrice as unknown as Price],
      })
      const usageMeter = createUsageMeter({
        id: 'meter_api_calls',
        slug: 'api-calls',
      })
      const pricingModel = createPricingModel({
        products: [product],
        usageMeters: [usageMeter],
      })
      const getPrice = constructGetPrice(pricingModel)

      const result = getPrice('api-calls-price')

      expect(result?.id).toBe('price_api_calls')
      expect(result?.slug).toBe('api-calls-price')
      expect(result?.type).toBe('usage')
    })

    it('returns null when no usage price matches the given slug', () => {
      const usagePrice = createUsagePrice({
        slug: 'existing-usage-price',
        usageMeterId: 'meter_1',
      })
      const product = createProduct({
        slug: 'usage-product',
        prices: [usagePrice as unknown as Price],
      })
      const usageMeter = createUsageMeter({
        id: 'meter_1',
        slug: 'some-meter',
      })
      const pricingModel = createPricingModel({
        products: [product],
        usageMeters: [usageMeter],
      })
      const getPrice = constructGetPrice(pricingModel)

      const result = getPrice('non-existent-usage-price')

      expect(result).toBeNull()
    })

    it('returns the correct price when multiple products have usage prices', () => {
      const apiCallsPrice = createUsagePrice({
        id: 'price_api_calls',
        slug: 'api-calls-per-request',
        usageMeterId: 'meter_api',
      })
      const storagePrice = createUsagePrice({
        id: 'price_storage',
        slug: 'storage-per-gb',
        usageMeterId: 'meter_storage',
      })
      const apiProduct = createProduct({
        slug: 'api-product',
        prices: [apiCallsPrice as unknown as Price],
      })
      const storageProduct = createProduct({
        slug: 'storage-product',
        prices: [storagePrice as unknown as Price],
      })
      const apiMeter = createUsageMeter({
        id: 'meter_api',
        slug: 'api-calls',
      })
      const storageMeter = createUsageMeter({
        id: 'meter_storage',
        slug: 'storage',
      })
      const pricingModel = createPricingModel({
        products: [apiProduct, storageProduct],
        usageMeters: [apiMeter, storageMeter],
      })
      const getPrice = constructGetPrice(pricingModel)

      expect(getPrice('api-calls-per-request')?.id).toBe(
        'price_api_calls'
      )
      expect(getPrice('storage-per-gb')?.id).toBe('price_storage')
    })
  })

  describe('combined subscription and usage prices', () => {
    it('returns both subscription and usage prices from products', () => {
      const subscriptionPrice = createPrice({
        id: 'price_sub',
        slug: 'pro-monthly',
        type: 'subscription',
      })
      const usagePrice = createUsagePrice({
        id: 'price_usage',
        slug: 'api-calls-price',
        usageMeterId: 'meter_api',
      })
      const subscriptionProduct = createProduct({
        slug: 'pro-plan',
        prices: [subscriptionPrice],
      })
      const usageProduct = createProduct({
        slug: 'usage-plan',
        prices: [usagePrice as unknown as Price],
      })
      const usageMeter = createUsageMeter({
        id: 'meter_api',
        slug: 'api-calls',
      })
      const pricingModel = createPricingModel({
        products: [subscriptionProduct, usageProduct],
        usageMeters: [usageMeter],
      })
      const getPrice = constructGetPrice(pricingModel)

      const subResult = getPrice('pro-monthly')
      const usageResult = getPrice('api-calls-price')

      expect(subResult?.id).toBe('price_sub')
      expect(subResult?.type).toBe('subscription')
      expect(usageResult?.id).toBe('price_usage')
      expect(usageResult?.type).toBe('usage')
    })

    it('returns null when the pricing model has no products', () => {
      const pricingModel = createPricingModel({
        products: [],
        usageMeters: [],
      })
      const getPrice = constructGetPrice(pricingModel)

      const result = getPrice('any-slug')

      expect(result).toBeNull()
    })

    it('handles a pricing model with products but empty usage meters', () => {
      const price = createPrice({
        id: 'price_only_product',
        slug: 'product-price',
      })
      const product = createProduct({ prices: [price] })
      const pricingModel = createPricingModel({
        products: [product],
        usageMeters: [],
      })
      const getPrice = constructGetPrice(pricingModel)

      expect(getPrice('product-price')?.id).toBe('price_only_product')
      expect(getPrice('non-existent')).toBeNull()
    })

    it('handles a pricing model with usage product and usage meters', () => {
      const usagePrice = createUsagePrice({
        id: 'price_only_usage',
        slug: 'usage-price',
        usageMeterId: 'meter_1',
      })
      const usageProduct = createProduct({
        slug: 'usage-plan',
        prices: [usagePrice as unknown as Price],
      })
      const usageMeter = createUsageMeter({
        id: 'meter_1',
        slug: 'meter',
      })
      const pricingModel = createPricingModel({
        products: [usageProduct],
        usageMeters: [usageMeter],
      })
      const getPrice = constructGetPrice(pricingModel)

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
      const pricingModel = createPricingModel({ products: [product] })
      const getPrice = constructGetPrice(pricingModel)

      // Cannot retrieve a price with null slug using any string
      expect(getPrice('')).toBeNull()
      expect(getPrice('null')).toBeNull()
    })

    it('returns the last price when duplicate slugs exist across multiple products', () => {
      // This tests the Map behavior where later entries override earlier ones
      const productPrice = createPrice({
        id: 'price_from_first_product',
        slug: 'duplicate-slug',
        type: 'subscription',
      })
      const usagePrice = createUsagePrice({
        id: 'price_from_second_product',
        slug: 'duplicate-slug',
        usageMeterId: 'meter_1',
      })
      const firstProduct = createProduct({
        slug: 'first-product',
        prices: [productPrice],
      })
      const secondProduct = createProduct({
        slug: 'second-product',
        prices: [usagePrice as unknown as Price],
      })
      const usageMeter = createUsageMeter({
        id: 'meter_1',
        slug: 'meter',
      })
      const pricingModel = createPricingModel({
        products: [firstProduct, secondProduct],
        usageMeters: [usageMeter],
      })
      const getPrice = constructGetPrice(pricingModel)

      // Second product's price overrides first product's price with same slug
      const result = getPrice('duplicate-slug')
      expect(result?.id).toBe('price_from_second_product')
    })
  })
})
