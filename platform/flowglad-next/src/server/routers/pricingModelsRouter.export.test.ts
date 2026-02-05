import { beforeEach, describe, expect, it } from 'bun:test'
import { IntervalUnit, PriceType } from '@db-core/enums'
import { Result } from 'better-result'
import { setupOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { selectPricingModelById } from '@/db/tableMethods/pricingModelMethods'
import { getPricingModelSetupData } from '@/utils/pricingModels/setupHelpers'
import { setupPricingModelTransaction } from '@/utils/pricingModels/setupTransaction'

describe('pricingModels.export', () => {
  let pricingModelId: string
  let pricingModelUpdatedAt: number

  beforeEach(async () => {
    const {
      pricingModelId: pmId,
      pricingModelUpdatedAt: pmUpdatedAt,
    } = (
      await adminTransaction(
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
                      usageMeterId: null,
                      usageEventsPerUnit: null,
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

          return Result.ok({
            pricingModelId: pm.id,
            pricingModelUpdatedAt: pm.updatedAt,
          })
        },
        { livemode: false }
      )
    ).unwrap()

    pricingModelId = pmId
    pricingModelUpdatedAt = pmUpdatedAt
  })

  it('returns pricingModel JSON structure with updatedAt timestamp', async () => {
    // Test the export logic directly using adminTransaction
    // This mirrors what the exportPricingModelProcedure does
    const result = (
      await adminTransaction(
        async ({ transaction }) => {
          // Fetch the pricing model to get updatedAt
          const pricingModelResult = await selectPricingModelById(
            pricingModelId,
            transaction
          )
          if (Result.isError(pricingModelResult)) {
            throw new Error(
              `Pricing model ${pricingModelId} not found`
            )
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

          return Result.ok({
            pricingModel: data.unwrap(),
            updatedAt: pricingModel.updatedAt,
          })
        },
        { livemode: false }
      )
    ).unwrap()

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

    // Verify updatedAt is an epoch milliseconds number matching the PM's updatedAt
    expect(typeof result.updatedAt).toBe('number')
    expect(result.updatedAt).toBe(pricingModelUpdatedAt)
  })
})
