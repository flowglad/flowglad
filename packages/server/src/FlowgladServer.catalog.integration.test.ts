import { describe, it, expect } from 'vitest'
import { createTestFlowgladServer } from './test/helpers'
import { setupProduct } from './test/seedServer'

describe('FlowgladServer Catalog Tests', async () => {
  const flowgladServer = createTestFlowgladServer()
  const result = await flowgladServer.getCatalog()
  const inactiveProduct = await setupProduct({
    name: 'Inactive Product',
    description: 'Inactive Product',
    catalogId: result.catalog.id,
    active: false,
  })

  it('should get the catalog', async () => {
    expect(result).toBeDefined()
    expect(result.catalog).toBeDefined()
    expect(result.catalog.products).toBeDefined()
  })

  it('should not include any inactive products', async () => {
    const latestCatalog = await flowgladServer.getCatalog()
    expect(latestCatalog.catalog.products).toBeDefined()
    expect(
      latestCatalog.catalog.products.map((p) => p.id)
    ).not.toContain(inactiveProduct.product.id)
    expect(
      latestCatalog.catalog.products.map((p) => p.id).length
    ).toBeGreaterThan(0)
  })
})
