import { describe, expect, it } from 'vitest'
import { createTestFlowgladServer } from './test/helpers'

describe('FlowgladServer Catalog Tests', async () => {
  const flowgladServer = createTestFlowgladServer()
  const result = await flowgladServer.getPricingModel()

  it('should get the catalog', async () => {
    expect(result).toBeDefined()
    expect(result.pricingModel).toBeDefined()
    expect(result.pricingModel.products).toBeDefined()
  })

  it('should return products with valid structure', async () => {
    const { pricingModel } = await flowgladServer.getPricingModel()

    expect(pricingModel.products.length).toBeGreaterThan(0)

    // Verify each product has expected fields and valid values
    for (const product of pricingModel.products) {
      expect(product.id).toBeDefined()
      expect(typeof product.id).toBe('string')
      expect(product.name).toBeDefined()
      expect(typeof product.name).toBe('string')
      expect(product.active).toBe(true)
      expect(product.prices).toBeDefined()
      expect(Array.isArray(product.prices)).toBe(true)
      expect(product.prices.length).toBeGreaterThan(0)

      // Verify each price has expected fields
      for (const price of product.prices) {
        expect(price.id).toBeDefined()
        expect(typeof price.id).toBe('string')
        expect(price.active).toBe(true)
        expect(typeof price.unitPrice).toBe('number')
        expect(price.unitPrice).toBeGreaterThanOrEqual(0)
      }
    }
  })
})
