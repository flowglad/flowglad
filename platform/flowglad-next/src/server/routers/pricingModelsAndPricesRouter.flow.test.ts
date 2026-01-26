import { beforeEach, describe, expect, it } from 'bun:test'
import { TRPCError } from '@trpc/server'
import { setupOrg, setupUserAndApiKey } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  selectPrices,
  selectPricesAndProductsByProductWhere,
} from '@/db/tableMethods/priceMethods'
import { selectPricingModelById } from '@/db/tableMethods/pricingModelMethods'
import { insertProduct } from '@/db/tableMethods/productMethods'
import { pricesRouter } from '@/server/routers/pricesRouter'
import { pricingModelsRouter } from '@/server/routers/pricingModelsRouter'
import {
  DestinationEnvironment,
  IntervalUnit,
  PriceType,
} from '@/types'

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
    const { apiKey } = await setupUserAndApiKey({
      organizationId,
      livemode: true,
    })
    apiKeyToken = apiKey.token!
    context = {
      organizationId,
      apiKey: apiKeyToken,
      livemode: true,
      environment: 'live',
      isApi: true,
      path: '',
    } as any
  })

  it('sets up org and api key', () => {
    expect(typeof organizationId).toBe('string')
    expect(typeof apiKeyToken).toBe('string')
    expect(context.organizationId).toBe(organizationId)
    expect(context.apiKey).toBe(apiKeyToken)
  })
})

// pricingModelsRouter.create
describe('pricingModelsRouter.create', () => {
  it('creates pricing model, default product, and default price (subscription when interval provided)', async () => {
    const orgData = await setupOrg({ skipPricingModel: true })
    const { apiKey } = await setupUserAndApiKey({
      organizationId: orgData.organization.id,
      livemode: true,
    })
    const ctx = {
      organizationId: orgData.organization.id,
      apiKey: apiKey.token!,
      livemode: true,
      environment: 'live' as const,
      isApi: true as any,
      path: '',
    }

    const { pricingModel } = await pricingModelsRouter
      .createCaller(ctx)
      .create({
        pricingModel: { name: 'PM Subscription', isDefault: false },
        defaultPlanIntervalUnit: IntervalUnit.Month,
      })

    expect(pricingModel).toMatchObject({})
    expect(pricingModel.name).toBe('PM Subscription')

    const productAndPrices = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
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
    const orgData = await setupOrg({ skipPricingModel: true })
    const { apiKey } = await setupUserAndApiKey({
      organizationId: orgData.organization.id,
      livemode: true,
    })
    const ctx = {
      organizationId: orgData.organization.id,
      apiKey: apiKey.token!,
      livemode: true,
      environment: 'live' as const,
      isApi: true as any,
      path: '',
    }
    const { pricingModel } = await pricingModelsRouter
      .createCaller(ctx)
      .create({
        pricingModel: { name: 'PM One-Time', isDefault: false },
      } as any)
    const productAndPrices = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
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
    // Use testmode to allow creating multiple pricing models
    // (livemode only allows ONE pricing model per organization)
    const orgData = await setupOrg({ skipPricingModel: true })
    const { apiKey } = await setupUserAndApiKey({
      organizationId: orgData.organization.id,
      livemode: false,
    })
    const ctx = {
      organizationId: orgData.organization.id,
      apiKey: apiKey.token!,
      livemode: false,
      environment: 'test' as const,
      isApi: true as any,
      path: '',
    }
    const first = await pricingModelsRouter.createCaller(ctx).create({
      pricingModel: { name: 'Default A', isDefault: true },
    } as any)
    expect(first.pricingModel.isDefault).toBe(true)
    const second = await pricingModelsRouter
      .createCaller(ctx)
      .create({
        pricingModel: { name: 'Default B', isDefault: true },
      } as any)
    expect(second.pricingModel.isDefault).toBe(true)
    // Verify the first was unset
    const { pricingModel: firstFetched } = await pricingModelsRouter
      .createCaller(ctx)
      .get({ id: first.pricingModel.id })
    expect(firstFetched.isDefault).toBe(false)
  })
})

// pricesRouter.create
describe('pricesRouter.create', () => {
  it('auto-defaults the first price for a product when isDefault=false provided', async () => {
    const orgData = await setupOrg({ skipPricingModel: true })
    const { apiKey } = await setupUserAndApiKey({
      organizationId: orgData.organization.id,
      livemode: true,
    })
    const ctx = {
      organizationId: orgData.organization.id,
      apiKey: apiKey.token!,
      livemode: true,
      environment: 'live' as const,
      isApi: true as any,
      path: '',
    }
    // Create pricing model outside of adminTransaction to use the correct ctx
    const { pricingModel } = await pricingModelsRouter
      .createCaller(ctx)
      .create({
        pricingModel: { name: 'PM for Product' } as any,
      })
    const product = await adminTransaction(async (txCtx) => {
      return insertProduct(
        {
          name: 'No Price Product',
          slug: 'no-price',
          default: false,
          description: null,
          imageURL: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
          externalId: null,
          pricingModelId: pricingModel.id,
          organizationId: orgData.organization.id,
          livemode: true,
          active: true,
        },
        txCtx
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
        trialPeriodDays: 0,
        slug: 'auto-default',
        active: true,
      } as any,
    } as any)
    expect(result.price.isDefault).toBe(true)
  })

  it('allows creating a second default price and deactivates the first', async () => {
    const orgData = await setupOrg({ skipPricingModel: true })
    const { apiKey } = await setupUserAndApiKey({
      organizationId: orgData.organization.id,
      livemode: true,
    })
    const ctx = {
      organizationId: orgData.organization.id,
      apiKey: apiKey.token!,
      livemode: true,
      environment: 'live' as const,
      isApi: true as any,
      path: '',
    }
    const { pricingModel } = await pricingModelsRouter
      .createCaller(ctx)
      .create({ pricingModel: { name: 'PM constraints' } as any })

    // Create a non-default product under the pricing model
    const product = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return insertProduct(
        {
          name: 'Non-Default Product',
          slug: 'non-default-product',
          default: false,
          description: null,
          imageURL: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
          externalId: null,
          pricingModelId: pricingModel.id,
          organizationId: orgData.organization.id,
          livemode: true,
          active: true,
        },
        ctx
      )
    })

    // Create the first default price
    const firstPrice = await pricesRouter.createCaller(ctx).create({
      price: {
        productId: product.id,
        unitPrice: 0,
        isDefault: true,
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        name: 'Initial Default',
        trialPeriodDays: 0,
        slug: 'initial-default',
        active: true,
      },
    })

    // Create a second default price for the same product (should succeed)
    const secondPrice = await pricesRouter.createCaller(ctx).create({
      price: {
        productId: product.id,
        unitPrice: 1000,
        isDefault: true,
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        name: 'New Default',
        trialPeriodDays: 0,
        slug: 'new-default',
        active: true,
      },
    })

    // Verify the second price is created as default and active
    expect(secondPrice.price.isDefault).toBe(true)
    expect(secondPrice.price.active).toBe(true)

    // Verify the first price is now non-default and inactive
    const [updatedFirstPrice] = await adminTransaction(
      async (ctx) => {
        const { transaction } = ctx
        return selectPrices({ id: firstPrice.price.id }, transaction)
      }
    )
    expect(updatedFirstPrice.isDefault).toBe(false)
    expect(updatedFirstPrice.active).toBe(false)
  })

  it('allows creating the first price for a default product', async () => {
    const orgData = await setupOrg({ skipPricingModel: true })
    const { apiKey } = await setupUserAndApiKey({
      organizationId: orgData.organization.id,
      livemode: true,
    })
    const ctx = {
      organizationId: orgData.organization.id,
      apiKey: apiKey.token!,
      livemode: true,
      environment: 'live' as const,
      isApi: true as any,
      path: '',
    }
    // Create a pricing model first, which will automatically create a default product with default price
    const { pricingModel } = await pricingModelsRouter
      .createCaller(ctx)
      .create({
        pricingModel: { name: 'PM for First Price Test' } as any,
      })

    // Get the default product that was created with the pricing model
    const productAndPrices = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectPricesAndProductsByProductWhere(
        { pricingModelId: pricingModel.id, default: true },
        transaction
      )
    })
    const defaultProduct = productAndPrices[0]
    const defaultPrice = defaultProduct.defaultPrice!

    // Verify that the default price was created correctly
    expect(defaultPrice.unitPrice).toBe(0)
    expect(defaultPrice.isDefault).toBe(true)
    expect(defaultPrice.type).toBe(PriceType.SinglePayment) // No interval was provided
  })

  it('forbids additional prices for default products', async () => {
    const orgData = await setupOrg({ skipPricingModel: true })
    const { apiKey } = await setupUserAndApiKey({
      organizationId: orgData.organization.id,
      livemode: true,
    })
    const ctx = {
      organizationId: orgData.organization.id,
      apiKey: apiKey.token!,
      livemode: true,
      environment: 'live' as const,
      isApi: true as any,
      path: '',
    }
    const { pricingModel } = await pricingModelsRouter
      .createCaller(ctx)
      .create({ pricingModel: { name: 'PM with Default' } as any })
    const productAndPrices = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectPricesAndProductsByProductWhere(
        { pricingModelId: pricingModel.id, default: true },
        transaction
      )
    })
    const defaultProduct = productAndPrices[0]
    try {
      await pricesRouter.createCaller(ctx).create({
        price: {
          productId: defaultProduct.id,
          unitPrice: 500,
          isDefault: false,
          type: PriceType.Subscription,
          intervalUnit: IntervalUnit.Year,
          intervalCount: 1,
          name: 'Premium Plan',
          trialPeriodDays: 0,
          slug: 'premium-plan',
          active: true,
        } as any,
      } as any)
      throw new Error(
        'Expected TRPCError FORBIDDEN when adding price to default product'
      )
    } catch (err: any) {
      expect(err).toBeInstanceOf(TRPCError)
      expect(err.code).toBe('FORBIDDEN')
    }
  })

  it('sets currency from organization and livemode from ctx', async () => {
    const orgData = await setupOrg()
    const { apiKey } = await setupUserAndApiKey({
      organizationId: orgData.organization.id,
      livemode: false,
    })
    const ctx = {
      organizationId: orgData.organization.id,
      apiKey: apiKey.token!,
      livemode: false,
      environment: 'test' as const,
      isApi: true as any,
      path: '',
    }
    const { pricingModel } = await pricingModelsRouter
      .createCaller(ctx)
      .create({ pricingModel: { name: 'PM Currency' } as any })
    // Create a regular (non-default) product to test currency and livemode
    const product = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return insertProduct(
        {
          name: 'Regular Product for Currency Test',
          slug: 'regular-currency-test',
          default: false,
          description: null,
          imageURL: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
          externalId: null,
          pricingModelId: pricingModel.id,
          organizationId: orgData.organization.id,
          livemode: false,
          active: true,
        },
        ctx
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
        trialPeriodDays: 0,
        slug: 'currency-check',
        active: true,
      },
    })
    // Verify via direct select to see stored fields
    const [stored] = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectPrices({ id: created.price.id }, transaction)
    })
    expect(stored.currency).toBe(orgData.organization.defaultCurrency)
    expect(stored.livemode).toBe(false)
  })
})

// pricingModelsRouter.clone
describe('pricingModelsRouter.clone', () => {
  it('returns NOT_FOUND when cloning a pricing model from another organization', async () => {
    // Use testmode to avoid livemode pricing model uniqueness constraint
    const org1 = await setupOrg({ skipPricingModel: true })
    const org2 = await setupOrg({ skipPricingModel: true })

    const { apiKey: org1ApiKey } = await setupUserAndApiKey({
      organizationId: org1.organization.id,
      livemode: false,
    })
    const { apiKey: org2ApiKey } = await setupUserAndApiKey({
      organizationId: org2.organization.id,
      livemode: false,
    })

    const org1Ctx = {
      organizationId: org1.organization.id,
      apiKey: org1ApiKey.token!,
      livemode: false,
      environment: 'test' as const,
      isApi: true as const,
      path: '',
    }

    const org2Ctx = {
      organizationId: org2.organization.id,
      apiKey: org2ApiKey.token!,
      livemode: false,
      environment: 'test' as const,
      isApi: true as const,
      path: '',
    }

    // Create a pricing model in org1
    const { pricingModel: org1PricingModel } =
      await pricingModelsRouter.createCaller(org1Ctx).create({
        pricingModel: { name: 'Org1 PM', isDefault: false },
      })

    // Attempt to clone org1's pricing model using org2's API key - should fail
    try {
      await pricingModelsRouter.createCaller(org2Ctx).clone({
        id: org1PricingModel.id,
        name: 'Stolen Clone',
      })
      throw new Error(
        'Expected TRPCError NOT_FOUND when cloning another org pricing model'
      )
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError)
      expect((err as TRPCError).code).toBe('NOT_FOUND')
    }
  })

  it('clones a pricing model within the same environment when no destinationEnvironment is specified', async () => {
    // Use testmode because livemode only allows ONE pricing model per org
    const orgData = await setupOrg({ skipPricingModel: true })
    const { apiKey } = await setupUserAndApiKey({
      organizationId: orgData.organization.id,
      livemode: false,
    })
    const ctx = {
      organizationId: orgData.organization.id,
      apiKey: apiKey.token!,
      livemode: false,
      environment: 'test' as const,
      isApi: true as const,
      path: '',
    }

    const { pricingModel: sourcePM } = await pricingModelsRouter
      .createCaller(ctx)
      .create({
        pricingModel: { name: 'Source PM', isDefault: false },
      })

    const { pricingModel: clonedPM } = await pricingModelsRouter
      .createCaller(ctx)
      .clone({
        id: sourcePM.id,
        name: 'Cloned PM',
      })

    expect(clonedPM.name).toBe('Cloned PM')
    expect(clonedPM.livemode).toBe(false)
    expect(clonedPM.isDefault).toBe(false)
    expect(clonedPM.id).not.toBe(sourcePM.id)
  })

  it('clones a pricing model from test mode to live mode when destinationEnvironment is livemode', async () => {
    const orgData = await setupOrg({ skipPricingModel: true })

    // Create test mode API key and pricing model
    const { apiKey: testApiKey } = await setupUserAndApiKey({
      organizationId: orgData.organization.id,
      livemode: false,
    })
    const testCtx = {
      organizationId: orgData.organization.id,
      apiKey: testApiKey.token!,
      livemode: false,
      environment: 'test' as const,
      isApi: true as const,
      path: '',
    }

    const { pricingModel: testPM } = await pricingModelsRouter
      .createCaller(testCtx)
      .create({
        pricingModel: { name: 'Test Mode PM', isDefault: false },
      })

    expect(testPM.livemode).toBe(false)

    // Clone to livemode using the test mode API key
    const { pricingModel: clonedPM } = await pricingModelsRouter
      .createCaller(testCtx)
      .clone({
        id: testPM.id,
        name: 'Promoted to Live',
        destinationEnvironment: DestinationEnvironment.Livemode,
      })

    expect(clonedPM.name).toBe('Promoted to Live')
    expect(clonedPM.livemode).toBe(true)
    expect(clonedPM.isDefault).toBe(false)

    // Verify in database that the cloned model is actually livemode
    const dbClonedPM = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return (
        await selectPricingModelById(clonedPM.id, transaction)
      ).unwrap()
    })
    expect(dbClonedPM.livemode).toBe(true)
  })

  it('clones a pricing model from live mode to test mode when destinationEnvironment is testmode', async () => {
    const orgData = await setupOrg({ skipPricingModel: true })

    // Create live mode API key and pricing model
    const { apiKey: liveApiKey } = await setupUserAndApiKey({
      organizationId: orgData.organization.id,
      livemode: true,
    })
    const liveCtx = {
      organizationId: orgData.organization.id,
      apiKey: liveApiKey.token!,
      livemode: true,
      environment: 'live' as const,
      isApi: true as const,
      path: '',
    }

    const { pricingModel: livePM } = await pricingModelsRouter
      .createCaller(liveCtx)
      .create({
        pricingModel: { name: 'Live Mode PM', isDefault: false },
      })

    expect(livePM.livemode).toBe(true)

    // Clone to testmode using the live mode API key
    const { pricingModel: clonedPM } = await pricingModelsRouter
      .createCaller(liveCtx)
      .clone({
        id: livePM.id,
        name: 'Demoted to Test',
        destinationEnvironment: DestinationEnvironment.Testmode,
      })

    expect(clonedPM.name).toBe('Demoted to Test')
    expect(clonedPM.livemode).toBe(false)
    expect(clonedPM.isDefault).toBe(false)

    // Verify in database
    const dbClonedPM = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return (
        await selectPricingModelById(clonedPM.id, transaction)
      ).unwrap()
    })
    expect(dbClonedPM.livemode).toBe(false)
  })
})
