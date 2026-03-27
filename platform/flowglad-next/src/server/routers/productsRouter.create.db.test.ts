import {
  beforeEach,
  describe,
  expect,
  it,
  setDefaultTimeout,
} from 'bun:test'
import { IntervalUnit, PriceType } from '@db-core/enums'
import type { Organization } from '@db-core/schema/organizations'
import type { PricingModel } from '@db-core/schema/pricingModels'
import { Result } from 'better-result'
import { setupOrg, setupUserAndApiKey } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { selectProductById } from '@/db/tableMethods/productMethods'
import type {
  TRPCApiContext,
  TRPCContext,
} from '@/server/trpcContext'
import { core } from '@/utils/core'
import { productsRouter } from './productsRouter'

setDefaultTimeout(30000)

/**
 * Creates a caller that simulates the API key context path.
 * The pricingModelId is derived from ctx.apiKeyPricingModelId.
 */
const createApiCaller = (
  organization: Organization.Record,
  apiKeyToken: string,
  apiKeyPricingModelId: string | undefined
) => {
  const ctx = {
    organizationId: organization.id,
    organization,
    apiKey: apiKeyToken,
    livemode: true,
    environment: 'live' as const,
    isApi: true,
    path: '',
    focusedPricingModelId: undefined,
    apiKeyPricingModelId,
  } as unknown as TRPCApiContext
  return productsRouter.createCaller(ctx)
}

/**
 * Creates a caller that simulates the dashboard (non-API) context path.
 * The pricingModelId is derived from ctx.focusedPricingModelId.
 */
const createDashboardCaller = (
  organization: Organization.Record,
  focusedPricingModelId: string | undefined
) => {
  const ctx = {
    organizationId: organization.id,
    organization,
    apiKey: undefined,
    livemode: true,
    environment: 'live' as const,
    isApi: false,
    path: '',
    focusedPricingModelId,
    apiKeyPricingModelId: undefined,
  } as unknown as TRPCContext
  return productsRouter.createCaller(ctx)
}

const makeProductInput = () => ({
  product: {
    name: `Test Product ${core.nanoid()}`,
    slug: `test-product-${core.nanoid()}`,
    active: true,
    description: '',
    imageURL: '',
    singularQuantityLabel: null,
    pluralQuantityLabel: null,
    default: false,
  },
  price: {
    type: PriceType.Subscription as const,
    unitPrice: 1000,
    intervalUnit: IntervalUnit.Month,
    intervalCount: 1,
    isDefault: true,
    name: 'Monthly',
    active: true,
    trialPeriodDays: null,
    usageEventsPerUnit: null,
    usageMeterId: null,
    slug: `price-${core.nanoid()}`,
  },
})

describe('productsRouter.create - pricingModelId derivation from context', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let apiKeyToken: string

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel

    const { apiKey } = await setupUserAndApiKey({
      organizationId: organization.id,
      livemode: true,
    })
    if (!apiKey.token) {
      throw new Error('API key token not found after setup')
    }
    apiKeyToken = apiKey.token
  })

  it('assigns apiKeyPricingModelId to the created product when called from API context', async () => {
    const caller = createApiCaller(
      organization,
      apiKeyToken,
      pricingModel.id
    )
    const input = makeProductInput()
    const result = await caller.create(input)

    expect(result.product.name).toBe(input.product.name)
    expect(result.product.slug).toBe(input.product.slug)
    expect(result.product.pricingModelId).toBe(pricingModel.id)

    // Verify in the database directly
    const dbProduct = (
      await adminTransaction(async ({ transaction }) => {
        const product = (
          await selectProductById(result.product.id, transaction)
        ).unwrap()
        return Result.ok(product)
      })
    ).unwrap()
    expect(dbProduct.pricingModelId).toBe(pricingModel.id)
  })

  it('assigns focusedPricingModelId to the created product when called from dashboard context', async () => {
    const caller = createDashboardCaller(
      organization,
      pricingModel.id
    )
    const input = makeProductInput()
    const result = await caller.create(input)

    expect(result.product.name).toBe(input.product.name)
    expect(result.product.slug).toBe(input.product.slug)
    expect(result.product.pricingModelId).toBe(pricingModel.id)

    // Verify in the database directly
    const dbProduct = (
      await adminTransaction(async ({ transaction }) => {
        const product = (
          await selectProductById(result.product.id, transaction)
        ).unwrap()
        return Result.ok(product)
      })
    ).unwrap()
    expect(dbProduct.pricingModelId).toBe(pricingModel.id)
  })

  it('throws BAD_REQUEST with API-specific message when apiKeyPricingModelId is missing in API context', async () => {
    const caller = createApiCaller(
      organization,
      apiKeyToken,
      undefined
    )
    const input = makeProductInput()

    await expect(caller.create(input)).rejects.toThrow(
      'Unable to determine pricing model scope. Ensure your API key is associated with a pricing model.'
    )
  })

  it('throws BAD_REQUEST with dashboard-specific message when focusedPricingModelId is missing in dashboard context', async () => {
    const caller = createDashboardCaller(organization, undefined)
    const input = makeProductInput()

    await expect(caller.create(input)).rejects.toThrow(
      'Unable to determine pricing model scope. Ensure you have a focused pricing model selected.'
    )
  })
})
