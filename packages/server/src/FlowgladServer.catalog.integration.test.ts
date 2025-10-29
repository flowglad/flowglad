import { describe, it, expect } from 'vitest'
import { createTestFlowgladServer } from './test/helpers'
import { setupProduct } from './test/seedServer'

describe('FlowgladServer Catalog Tests', async () => {
  const flowgladServer = createTestFlowgladServer()
  const result = await flowgladServer.getPricingModel()
  const inactiveProduct = await setupProduct({
    name: 'Inactive Product',
    description: 'Inactive Product',
    pricingModelId: result.pricingModel.id,
    active: false,
  })

  it('should get the catalog', async () => {
    expect(result).toBeDefined()
    expect(result.pricingModel).toBeDefined()
    expect(result.pricingModel.products).toBeDefined()
  })

  it('should not include any inactive products', async () => {
    const latestPricingModel = await flowgladServer.getPricingModel()
    expect(latestPricingModel.pricingModel.products).toBeDefined()
    expect(
      latestPricingModel.pricingModel.products.map((p) => p.id)
    ).not.toContain(inactiveProduct.product.id)
    expect(
      latestPricingModel.pricingModel.products.map((p) => p.id).length
    ).toBeGreaterThan(0)
  })
})
