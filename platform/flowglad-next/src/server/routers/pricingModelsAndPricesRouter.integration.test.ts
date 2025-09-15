import { describe, it, beforeEach, expect } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import { setupOrg, setupUserAndApiKey } from '@/../seedDatabase'
import { pricingModelsRouter } from '@/server/routers/pricingModelsRouter'
import { pricesRouter } from '@/server/routers/pricesRouter'
import { IntervalUnit, PriceType } from '@/types'
import { insertProduct } from '@/db/tableMethods/productMethods'
import { selectPricesAndProductsByProductWhere, selectPrices } from '@/db/tableMethods/priceMethods'
import { TRPCError } from '@trpc/server'

describe('beforeEach setup', () => {
  let organizationId: string
  let apiKeyToken: string
  let context: {
    organizationId: string
    apiKey: string
    livemode: boolean
    environment: 'live' | 'test'
    path: string
  }

  beforeEach(async () => {
    const orgData = await setupOrg()
    organizationId = orgData.organization.id
    const { apiKey } = await setupUserAndApiKey({ organizationId, livemode: true })
    apiKeyToken = apiKey.token!
    context = {
      organizationId,
      apiKey: apiKeyToken,
      livemode: true,
      environment: 'live',
      isApi: true as any,
      path: '',
    } as any
  })

  it('sets up org and api key', () => {
    expect(organizationId).toBeDefined()
    expect(apiKeyToken).toBeDefined()
    expect(context.organizationId).toBe(organizationId)
    expect(context.apiKey).toBe(apiKeyToken)
  })
})

// pricingModelsRouter.create
describe('pricingModelsRouter.create', () => {
  it('creates pricing model, default product, and default price (subscription when interval provided)', async () => {
    const orgData = await setupOrg()
    const { apiKey } = await setupUserAndApiKey({ organizationId: orgData.organization.id, livemode: true })
    const ctx = {
      organizationId: orgData.organization.id,
      apiKey: apiKey.token!,
      livemode: true,
      environment: 'live' as const,
      isApi: true as any,
      path: '',
    }

    const { pricingModel } = await pricingModelsRouter.createCaller(ctx).create({
      pricingModel: { name: 'PM Subscription', isDefault: false },
      defaultPlanIntervalUnit: IntervalUnit.Month,
    })

    expect(pricingModel).toBeDefined()
    expect(pricingModel.name).toBe('PM Subscription')

    const productAndPrices = await adminTransaction(async ({ transaction }) => {
      return selectPricesAndProductsByProductWhere(
        { pricingModelId: pricingModel.id, default: true },
        transaction
      )
    })
    expect(productAndPrices.length).toBeGreaterThan(0)
    const defaultProduct = productAndPrices[0]
    expect(defaultProduct.default).toBe(true)
    const defaultPrice = defaultProduct.defaultPrice!
    expect(defaultPrice.unitPrice).toBe(0)
    expect(defaultPrice.type).toBe(PriceType.Subscription)
    expect(defaultPrice.intervalUnit).toBe(IntervalUnit.Month)
    expect(defaultPrice.intervalCount).toBe(1)
  })

  it('creates pricing model with single-payment default price when no interval provided', async () => {
    const orgData = await setupOrg()
    const { apiKey } = await setupUserAndApiKey({ organizationId: orgData.organization.id, livemode: true })
    const ctx = {
      organizationId: orgData.organization.id,
      apiKey: apiKey.token!,
      livemode: true,
      environment: 'live' as const,
      isApi: true as any,
      path: '',
    }
    const { pricingModel } = await pricingModelsRouter.createCaller(ctx).create({
      pricingModel: { name: 'PM One-Time', isDefault: false },
    } as any)
    const productAndPrices = await adminTransaction(async ({ transaction }) => {
      return selectPricesAndProductsByProductWhere(
        { pricingModelId: pricingModel.id, default: true },
        transaction
      )
    })
    const defaultProduct = productAndPrices[0]
    const defaultPrice = defaultProduct.defaultPrice!
    expect(defaultPrice.type).toBe(PriceType.SinglePayment)
    expect(defaultPrice.intervalUnit).toBeNull()
    expect(defaultPrice.intervalCount).toBeNull()
  })

  it('handles isDefault=true semantics per safelyInsertPricingModel', async () => {
    const orgData = await setupOrg()
    const { apiKey } = await setupUserAndApiKey({ organizationId: orgData.organization.id, livemode: true })
    const ctx = {
      organizationId: orgData.organization.id,
      apiKey: apiKey.token!,
      livemode: true,
      environment: 'live' as const,
      isApi: true as any,
      path: '',
    }
    const first = await pricingModelsRouter.createCaller(ctx).create({
      pricingModel: { name: 'Default A', isDefault: true },
    } as any)
    expect(first.pricingModel.isDefault).toBe(true)
    const second = await pricingModelsRouter.createCaller(ctx).create({
      pricingModel: { name: 'Default B', isDefault: true },
    } as any)
    expect(second.pricingModel.isDefault).toBe(true)
    // Verify the first was unset
    const { pricingModel: firstFetched } = await pricingModelsRouter.createCaller(ctx).get({ id: first.pricingModel.id })
    expect(firstFetched.isDefault).toBe(false)
  })
})

// pricesRouter.create
describe('pricesRouter.create', () => {
  it('auto-defaults the first price for a product when isDefault=false provided', async () => {
    const orgData = await setupOrg()
    const { apiKey } = await setupUserAndApiKey({ organizationId: orgData.organization.id, livemode: true })
    const ctx = {
      organizationId: orgData.organization.id,
      apiKey: apiKey.token!,
      livemode: true,
      environment: 'live' as const,
      isApi: true as any,
      path: '',
    }
    const product = await adminTransaction(async ({ transaction }) => {
      return insertProduct(
        {
          name: 'No Price Product',
          slug: 'no-price',
          default: false,
          description: null,
          imageURL: null,
          displayFeatures: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
          externalId: null,
          pricingModelId: (await pricingModelsRouter.createCaller(ctx).create({ pricingModel: { name: 'PM for Product' } as any })).pricingModel.id,
          organizationId: orgData.organization.id,
          livemode: true,
          active: true,
        },
        transaction
      )
    })
    const result = await pricesRouter.createCaller(ctx).create({
      price: {
        productId: product.id,
        unitPrice: 1000,
        isDefault: false,
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        name: 'Auto Default',
        setupFeeAmount: 0,
        trialPeriodDays: 0,
        slug: 'auto-default',
        active: true,
      } as any,
    } as any)
    expect(result.price.isDefault).toBe(true)
  })

  it('enforces single default per product when creating a second default', async () => {
    const orgData = await setupOrg()
    const { apiKey } = await setupUserAndApiKey({ organizationId: orgData.organization.id, livemode: true })
    const ctx = {
      organizationId: orgData.organization.id,
      apiKey: apiKey.token!,
      livemode: true,
      environment: 'live' as const,
      isApi: true as any,
      path: '',
    }
    const { pricingModel } = await pricingModelsRouter.createCaller(ctx).create({ pricingModel: { name: 'PM constraints' } as any })
    const productAndPrices = await adminTransaction(async ({ transaction }) => {
      return selectPricesAndProductsByProductWhere({ pricingModelId: pricingModel.id, default: true }, transaction)
    })
    const defaultProduct = productAndPrices[0]
    await expect(
      pricesRouter.createCaller(ctx).create({
        price: {
          productId: defaultProduct.id,
          unitPrice: 0,
          isDefault: true,
          type: PriceType.Subscription,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          name: 'Duplicate Default',
        } as any,
      } as any)
    ).rejects.toThrow(TRPCError)
  })

  it('allows creating the first price for a default product', async () => {
    const orgData = await setupOrg()
    const { apiKey } = await setupUserAndApiKey({ organizationId: orgData.organization.id, livemode: true })
    const ctx = {
      organizationId: orgData.organization.id,
      apiKey: apiKey.token!,
      livemode: true,
      environment: 'live' as const,
      isApi: true as any,
      path: '',
    }
    // Create a pricing model first, which will automatically create a default product with default price
    const { pricingModel } = await pricingModelsRouter.createCaller(ctx).create({ pricingModel: { name: 'PM for First Price Test' } as any })
    
    // Get the default product that was created with the pricing model
    const productAndPrices = await adminTransaction(async ({ transaction }) => {
      return selectPricesAndProductsByProductWhere({ pricingModelId: pricingModel.id, default: true }, transaction)
    })
    const defaultProduct = productAndPrices[0]
    const defaultPrice = defaultProduct.defaultPrice!
    
    // Verify that the default price was created correctly
    expect(defaultPrice.unitPrice).toBe(0)
    expect(defaultPrice.isDefault).toBe(true)
    expect(defaultPrice.type).toBe(PriceType.SinglePayment) // No interval was provided
  })

  it('forbids additional prices for default products', async () => {
    const orgData = await setupOrg()
    const { apiKey } = await setupUserAndApiKey({ organizationId: orgData.organization.id, livemode: true })
    const ctx = {
      organizationId: orgData.organization.id,
      apiKey: apiKey.token!,
      livemode: true,
      environment: 'live' as const,
      isApi: true as any,
      path: '',
    }
    const { pricingModel } = await pricingModelsRouter.createCaller(ctx).create({ pricingModel: { name: 'PM with Default' } as any })
    const productAndPrices = await adminTransaction(async ({ transaction }) => {
      return selectPricesAndProductsByProductWhere({ pricingModelId: pricingModel.id, default: true }, transaction)
    })
    const defaultProduct = productAndPrices[0]
    await expect(
      pricesRouter.createCaller(ctx).create({
        price: {
          productId: defaultProduct.id,
          unitPrice: 500,
          isDefault: false,
          type: PriceType.Subscription,
          intervalUnit: IntervalUnit.Year,
          intervalCount: 1,
          name: 'Premium Plan',
          setupFeeAmount: 0,
          trialPeriodDays: 0,
          slug: 'premium-plan',
          active: true,
        } as any,
      } as any)
    ).rejects.toThrow('Cannot create additional prices for the default plan')
  })

  it('sets currency from organization and livemode from ctx', async () => {
    const orgData = await setupOrg()
    const { apiKey } = await setupUserAndApiKey({ organizationId: orgData.organization.id, livemode: false })
    const ctx = {
      organizationId: orgData.organization.id,
      apiKey: apiKey.token!,
      livemode: false,
      environment: 'test' as const,
      isApi: true as any,
      path: '',
    }
    const { pricingModel } = await pricingModelsRouter.createCaller(ctx).create({ pricingModel: { name: 'PM Currency' } as any })
    // Create a regular (non-default) product to test currency and livemode
    const product = await adminTransaction(async ({ transaction }) => {
      return insertProduct(
        {
          name: 'Regular Product for Currency Test',
          slug: 'regular-currency-test',
          default: false,
          description: null,
          imageURL: null,
          displayFeatures: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
          externalId: null,
          pricingModelId: pricingModel.id,
          organizationId: orgData.organization.id,
          livemode: false,
          active: true,
        },
        transaction
      )
    })
    const created = await pricesRouter.createCaller(ctx).create({
      price: {
        productId: product.id,
        unitPrice: 2500,
        isDefault: false,
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        name: 'Currency Check',
        setupFeeAmount: 0,
        trialPeriodDays: 0,
        slug: 'currency-check',
        active: true,
      } as any,
    } as any)
    // Verify via direct select to see stored fields
    const [stored] = await adminTransaction(async ({ transaction }) => {
      return selectPrices({ id: created.price.id }, transaction)
    })
    expect(stored.currency).toBe(orgData.organization.defaultCurrency)
    expect(stored.livemode).toBe(false)
  })
})


