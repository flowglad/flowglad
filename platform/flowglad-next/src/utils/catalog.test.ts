import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/databaseMethods'
import { setupOrg, setupCatalog } from '../../seedDatabase'
import { cloneCatalogTransaction } from './catalog'
import { IntervalUnit, PriceType, CurrencyCode } from '@/types'
import { selectCatalogById } from '@/db/tableMethods/catalogMethods'
import {
  selectPricesAndProductsByProductWhere,
  insertPrice,
} from '@/db/tableMethods/priceMethods'
import { insertProduct } from '@/db/tableMethods/productMethods'
import { core } from '@/utils/core'
import { Product } from '@/db/schema/products'
import { Price } from '@/db/schema/prices'

describe('cloneCatalogTransaction', () => {
  let organization: any
  let sourceCatalog: any
  let product: Product.Record
  let price: Price.Record

  beforeEach(async () => {
    const orgSetup = await setupOrg()
    organization = orgSetup.organization
    product = orgSetup.product
    price = orgSetup.price
    sourceCatalog = orgSetup.catalog
  })

  describe('Basic Functionality', () => {
    it('should successfully clone a catalog with all its products and prices', async () => {
      const clonedCatalog = await adminTransaction(
        async ({ transaction }) => {
          return cloneCatalogTransaction(
            {
              id: sourceCatalog.id,
              name: 'Cloned Catalog',
            },
            transaction
          )
        }
      )

      expect(clonedCatalog).toBeDefined()
      expect(clonedCatalog.products).toHaveLength(1)
      expect(clonedCatalog.products[0].prices).toHaveLength(1)
    })

    it('should create a new catalog with the specified name', async () => {
      const newName = 'New Catalog Name'
      const clonedCatalog = await adminTransaction(
        async ({ transaction }) => {
          return cloneCatalogTransaction(
            {
              id: sourceCatalog.id,
              name: newName,
            },
            transaction
          )
        }
      )

      expect(clonedCatalog.name).toBe(newName)
    })

    it('should set isDefault to false on the cloned catalog', async () => {
      const clonedCatalog = await adminTransaction(
        async ({ transaction }) => {
          return cloneCatalogTransaction(
            {
              id: sourceCatalog.id,
              name: 'Cloned Catalog',
            },
            transaction
          )
        }
      )

      expect(clonedCatalog.isDefault).toBe(false)
    })

    it('should preserve the livemode value from the source catalog', async () => {
      const clonedCatalog = await adminTransaction(
        async ({ transaction }) => {
          return cloneCatalogTransaction(
            {
              id: sourceCatalog.id,
              name: 'Cloned Catalog',
            },
            transaction
          )
        }
      )

      expect(clonedCatalog.livemode).toBe(sourceCatalog.livemode)
    })

    it('should maintain the same organizationId as the source catalog', async () => {
      const clonedCatalog = await adminTransaction(
        async ({ transaction }) => {
          return cloneCatalogTransaction(
            {
              id: sourceCatalog.id,
              name: 'Cloned Catalog',
            },
            transaction
          )
        }
      )

      expect(clonedCatalog.organizationId).toBe(
        sourceCatalog.organizationId
      )
    })
  })

  describe('Catalog Scenarios', () => {
    it('should handle an empty catalog (no products)', async () => {
      const emptyCatalog = await setupCatalog({
        organizationId: organization.id,
        name: 'Empty Catalog',
      })

      const clonedCatalog = await adminTransaction(
        async ({ transaction }) => {
          return cloneCatalogTransaction(
            {
              id: emptyCatalog.id,
              name: 'Cloned Empty Catalog',
            },
            transaction
          )
        }
      )

      expect(clonedCatalog.products).toHaveLength(0)
    })

    it('should handle a catalog with multiple products correctly', async () => {
      // Create additional products in source catalog
      const product2 = await adminTransaction(
        async ({ transaction }) => {
          return insertProduct(
            {
              name: 'Second Product',
              organizationId: organization.id,
              livemode: true,
              description: null,
              active: true,
              displayFeatures: null,
              singularQuantityLabel: null,
              pluralQuantityLabel: null,
              catalogId: sourceCatalog.id,
              imageURL: null,
              externalId: null,
            },
            transaction
          )
        }
      )

      const price2 = await adminTransaction(
        async ({ transaction }) => {
          return insertPrice(
            {
              productId: product2.id,
              name: 'Second Product Price',
              type: PriceType.Subscription,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              livemode: true,
              active: true,
              isDefault: true,
              unitPrice: 2000,
              setupFeeAmount: 0,
              trialPeriodDays: 0,
              currency: CurrencyCode.USD,
              externalId: null,
              usageMeterId: null,
            },
            transaction
          )
        }
      )

      const clonedCatalog = await adminTransaction(
        async ({ transaction }) => {
          return cloneCatalogTransaction(
            {
              id: sourceCatalog.id,
              name: 'Cloned Multi-Product Catalog',
            },
            transaction
          )
        }
      )

      expect(clonedCatalog.products).toHaveLength(2)
      expect(clonedCatalog.products[0].prices).toHaveLength(1)
      expect(clonedCatalog.products[1].prices).toHaveLength(1)
    })
  })

  describe('Product Cloning', () => {
    it('should clone all products from the source catalog', async () => {
      const sourceProducts = await adminTransaction(
        async ({ transaction }) => {
          const productsWithPrices =
            await selectPricesAndProductsByProductWhere(
              {
                catalogId: sourceCatalog.id,
              },
              transaction
            )
          return productsWithPrices
        }
      )

      const clonedCatalog = await adminTransaction(
        async ({ transaction }) => {
          return cloneCatalogTransaction(
            {
              id: sourceCatalog.id,
              name: 'Cloned Catalog',
            },
            transaction
          )
        }
      )

      expect(clonedCatalog.products).toHaveLength(
        sourceProducts.length
      )
    })

    it('should assign new IDs to the cloned products', async () => {
      const sourceProductId = product.id
      const clonedCatalog = await adminTransaction(
        async ({ transaction }) => {
          return cloneCatalogTransaction(
            {
              id: sourceCatalog.id,
              name: 'Cloned Catalog',
            },
            transaction
          )
        }
      )

      const clonedProductId = clonedCatalog.products[0].id
      expect(clonedProductId).not.toBe(sourceProductId)
    })

    it('should preserve all product attributes except ID and catalogId', async () => {
      const clonedCatalog = await adminTransaction(
        async ({ transaction }) => {
          return cloneCatalogTransaction(
            {
              id: sourceCatalog.id,
              name: 'Cloned Catalog',
            },
            transaction
          )
        }
      )

      const sourceProduct = product
      const clonedProduct = clonedCatalog.products[0]

      expect(clonedProduct.name).toBe(sourceProduct.name)
      expect(clonedProduct.description).toBe(
        sourceProduct.description
      )
      expect(clonedProduct.active).toBe(sourceProduct.active)
      expect(clonedProduct.displayFeatures).toEqual(
        sourceProduct.displayFeatures
      )
      expect(clonedProduct.singularQuantityLabel).toBe(
        sourceProduct.singularQuantityLabel
      )
      expect(clonedProduct.pluralQuantityLabel).toBe(
        sourceProduct.pluralQuantityLabel
      )
    })

    it('should correctly set the catalogId on cloned products to the new catalog ID', async () => {
      const clonedCatalog = await adminTransaction(
        async ({ transaction }) => {
          return cloneCatalogTransaction(
            {
              id: sourceCatalog.id,
              name: 'Cloned Catalog',
            },
            transaction
          )
        }
      )

      expect(clonedCatalog.products[0].catalogId).toBe(
        clonedCatalog.id
      )
    })
  })

  describe('Price Cloning', () => {
    it('should clone all prices for each product', async () => {
      const sourcePrices = await adminTransaction(
        async ({ transaction }) => {
          const productsWithPrices =
            await selectPricesAndProductsByProductWhere(
              {
                catalogId: sourceCatalog.id,
              },
              transaction
            )
          return productsWithPrices.flatMap(({ prices }) => prices)
        }
      )

      const clonedCatalog = await adminTransaction(
        async ({ transaction }) => {
          return cloneCatalogTransaction(
            {
              id: sourceCatalog.id,
              name: 'Cloned Catalog',
            },
            transaction
          )
        }
      )

      const clonedPrices = clonedCatalog.products.flatMap(
        (product: any) => product.prices
      )
      expect(clonedPrices).toHaveLength(sourcePrices.length)
    })

    it('should assign new IDs to the cloned prices', async () => {
      const sourcePriceId = price.id
      const clonedCatalog = await adminTransaction(
        async ({ transaction }) => {
          return cloneCatalogTransaction(
            {
              id: sourceCatalog.id,
              name: 'Cloned Catalog',
            },
            transaction
          )
        }
      )

      const clonedPriceId = clonedCatalog.products[0].prices[0].id
      expect(clonedPriceId).not.toBe(sourcePriceId)
    })

    it('should preserve all price attributes except ID and productId', async () => {
      const clonedCatalog = await adminTransaction(
        async ({ transaction }) => {
          return cloneCatalogTransaction(
            {
              id: sourceCatalog.id,
              name: 'Cloned Catalog',
            },
            transaction
          )
        }
      )

      const sourcePrice = price
      const clonedPrice = clonedCatalog.products[0].prices[0]

      expect(clonedPrice.name).toBe(sourcePrice.name)
      expect(clonedPrice.type).toBe(sourcePrice.type)
      expect(clonedPrice.intervalUnit).toBe(sourcePrice.intervalUnit)
      expect(clonedPrice.intervalCount).toBe(
        sourcePrice.intervalCount
      )
      expect(clonedPrice.unitPrice).toBe(sourcePrice.unitPrice)
      expect(clonedPrice.setupFeeAmount).toBe(
        sourcePrice.setupFeeAmount
      )
      expect(clonedPrice.trialPeriodDays).toBe(
        sourcePrice.trialPeriodDays
      )
      expect(clonedPrice.currency).toBe(sourcePrice.currency)
    })

    it('should associate prices with the correct new product IDs', async () => {
      const clonedCatalog = await adminTransaction(
        async ({ transaction }) => {
          return cloneCatalogTransaction(
            {
              id: sourceCatalog.id,
              name: 'Cloned Catalog',
            },
            transaction
          )
        }
      )

      const clonedProduct = clonedCatalog.products[0]
      const clonedPrice = clonedProduct.prices[0]

      expect(clonedPrice.productId).toBe(clonedProduct.id)
    })
  })

  describe('Data Integrity', () => {
    it('should not modify the original catalog, its products, or prices', async () => {
      const originalCatalog = await adminTransaction(
        async ({ transaction }) => {
          return selectCatalogById(sourceCatalog.id, transaction)
        }
      )

      const originalProducts = await adminTransaction(
        async ({ transaction }) => {
          return selectPricesAndProductsByProductWhere(
            {
              catalogId: sourceCatalog.id,
            },
            transaction
          )
        }
      )

      await adminTransaction(async ({ transaction }) => {
        return cloneCatalogTransaction(
          {
            id: sourceCatalog.id,
            name: 'Cloned Catalog',
          },
          transaction
        )
      })

      const catalogAfterClone = await adminTransaction(
        async ({ transaction }) => {
          return selectCatalogById(sourceCatalog.id, transaction)
        }
      )

      const productsAfterClone = await adminTransaction(
        async ({ transaction }) => {
          return selectPricesAndProductsByProductWhere(
            {
              catalogId: sourceCatalog.id,
            },
            transaction
          )
        }
      )

      expect(catalogAfterClone).toEqual(originalCatalog)
      expect(productsAfterClone).toEqual(originalProducts)
    })
  })

  describe('Transaction Handling', () => {
    it('should execute all operations within the provided transaction', async () => {
      const clonedCatalog = await adminTransaction(
        async ({ transaction }) => {
          return cloneCatalogTransaction(
            {
              id: sourceCatalog.id,
              name: 'Cloned Catalog',
            },
            transaction
          )
        }
      )
      expect(clonedCatalog).toBeDefined()
      const clonedProducts = await adminTransaction(
        async ({ transaction }) => {
          return selectPricesAndProductsByProductWhere(
            { catalogId: clonedCatalog.id },
            transaction
          )
        }
      )
      expect(clonedProducts).toHaveLength(1)
      //   expect(clonedCatalog.products[0].prices).toHaveLength(1)
    })
  })
})
