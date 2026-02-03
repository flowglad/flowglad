import { beforeEach, describe, expect, it } from 'bun:test'
import { IntervalUnit, PriceType } from '@db-core/enums'
import { Result } from 'better-result'
import { setupOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { selectPricingModelById } from '@/db/tableMethods/pricingModelMethods'
import { getPricingModelSetupData } from '@/utils/pricingModels/setupHelpers'
import { setupPricingModelTransaction } from '@/utils/pricingModels/setupTransaction'

describe('pricingModels.export', () => {
  let organizationId: string
  let pricingModelId: string
  let pricingModelUpdatedAt: number

  beforeEach(async () => {
    const result = await adminTransaction(
      async (ctx) => {
        const { organization } = await setupOrg({
          skipPricingModel: true,
        })

        // Create a pricing model using setupPricingModelTransaction
        const setupResult = await setupPricingModelTransaction(
          {
            input: {
              name: 'Test Export PM',
              isDefault: false,
              features: [],
              products: [
                {
                  product: {
                    name: 'Test Product',
                    slug: 'test-product',
                    default: false,
                    active: true,
                  },
                  price: {
                    type: PriceType.Subscription,
                    unitPrice: 1000,
                    intervalUnit: IntervalUnit.Month,
                    intervalCount: 1,
                    isDefault: true,
                    active: true,
                    slug: 'test-price',
                  },
                  features: [],
                },
              ],
              usageMeters: [],
              resources: [],
            },
            organizationId: organization.id,
            livemode: false,
          },
          ctx
        )

        const pm = setupResult.unwrap().pricingModel

        return {
          organizationId: organization.id,
          pricingModelId: pm.id,
          pricingModelUpdatedAt: pm.updatedAt,
        }
      },
      { livemode: false }
    )

    organizationId = result.organizationId
    pricingModelId = result.pricingModelId
    pricingModelUpdatedAt = result.pricingModelUpdatedAt
  })

  it('returns pricingModel JSON structure with updatedAt timestamp', async () => {
    // Test the export logic directly using adminTransaction
    // This mirrors what the exportPricingModelProcedure does
    const result = await adminTransaction(
      async ({ transaction }) => {
        // Fetch the pricing model to get updatedAt
        const pricingModelResult = await selectPricingModelById(
          pricingModelId,
          transaction
        )
        if (Result.isError(pricingModelResult)) {
          throw new Error(`Pricing model ${pricingModelId} not found`)
        }
        const pricingModel = pricingModelResult.unwrap()

        // Get the setup data structure
        const data = await getPricingModelSetupData(
          pricingModelId,
          transaction
        )
        if (Result.isError(data)) {
          throw new Error(data.error.message)
        }

        return {
          pricingModel: data.unwrap(),
          updatedAt: new Date(pricingModel.updatedAt).toISOString(),
        }
      },
      { livemode: false }
    )

    // Verify the response structure
    expect(result).toHaveProperty('pricingModel')
    expect(result).toHaveProperty('updatedAt')

    // Verify pricingModel is a JSON object, not a string
    expect(typeof result.pricingModel).toBe('object')

    // Verify the pricingModel structure has expected fields
    expect(result.pricingModel).toHaveProperty(
      'name',
      'Test Export PM'
    )
    expect(result.pricingModel).toHaveProperty('features')
    expect(result.pricingModel).toHaveProperty('products')
    expect(result.pricingModel).toHaveProperty('usageMeters')

    // Verify products array contains our test product
    expect(Array.isArray(result.pricingModel.products)).toBe(true)
    expect(
      result.pricingModel.products.length
    ).toBeGreaterThanOrEqual(1)

    // Find our test product in the products array
    const testProduct = result.pricingModel.products.find(
      (p: { product: { slug: string } }) =>
        p.product.slug === 'test-product'
    )
    expect(testProduct).toEqual(
      expect.objectContaining({
        product: expect.objectContaining({
          name: 'Test Product',
          slug: 'test-product',
        }),
      })
    )

    // Verify updatedAt is an ISO string matching the PM's updatedAt
    expect(result.updatedAt).toBe(
      new Date(pricingModelUpdatedAt).toISOString()
    )
  })
})
