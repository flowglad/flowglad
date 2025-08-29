import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupOrg,
  setupPricingModel,
  setupProduct,
  setupPrice,
} from '@/../seedDatabase'
import { PriceType, IntervalUnit, CurrencyCode } from '@/types'
import { createCallerFactory } from '@/server/trpc'
import { appRouter } from '@/server'
import { insertProduct } from '@/db/tableMethods/productMethods'
import { insertPrice } from '@/db/tableMethods/priceMethods'
import core from '@/utils/core'
import { createPricingModelBookkeeping } from '@/utils/bookkeeping'

describe('productsRouter - Default Product Constraints', () => {
  let organizationId: string
  let pricingModelId: string
  let defaultProductId: string
  let defaultPriceId: string
  let regularProductId: string
  const livemode = true

  beforeEach(async () => {
    // Set up organization and pricing model with default product
    const result = await adminTransaction(async ({ transaction }) => {
      const { organization } = await setupOrg()
      
      // Create pricing model with default product using the new bookkeeping function
      const bookkeepingResult = await createPricingModelBookkeeping(
        {
          pricingModel: {
            name: 'Test Pricing Model',
            isDefault: true,
          },
        },
        {
          transaction,
          organizationId: organization.id,
          livemode,
        }
      )
      
      // Also create a regular product for comparison
      const regularProduct = await insertProduct(
        {
          name: 'Regular Product',
          slug: 'regular-product',
          default: false,
          pricingModelId: bookkeepingResult.result.pricingModel.id,
          organizationId: organization.id,
          livemode,
          active: true,
        },
        transaction
      )
      
      const regularPrice = await insertPrice(
        {
          productId: regularProduct.id,
          unitPrice: 1000,
          isDefault: true,
          type: PriceType.Subscription,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          currency: organization.defaultCurrency,
          livemode,
          active: true,
          name: 'Regular Price',
        },
        transaction
      )
      
      return {
        organizationId: organization.id,
        pricingModelId: bookkeepingResult.result.pricingModel.id,
        defaultProductId: bookkeepingResult.result.defaultProduct.id,
        defaultPriceId: bookkeepingResult.result.defaultPrice.id,
        regularProductId: regularProduct.id,
      }
    })
    
    organizationId = result.organizationId
    pricingModelId = result.pricingModelId
    defaultProductId = result.defaultProductId
    defaultPriceId = result.defaultPriceId
    regularProductId = result.regularProductId
  })

  describe('createProduct', () => {
    it('should throw error when attempting to create a product with default: true', async () => {
      const createCaller = createCallerFactory(appRouter)
      const caller = createCaller({
        organizationId,
        livemode,
        apiKey: undefined,
      })
      
      await expect(
        caller.products.create({
          product: {
            name: 'Another Default Product',
            slug: 'another-default',
            default: true, // This should cause an error
            pricingModelId,
            active: true,
          },
          price: {
            unitPrice: 0,
            type: PriceType.Subscription,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            name: 'Test Price',
            active: true,
          },
        })
      ).rejects.toThrow('Default products cannot be created manually')
    })
    
    it('should allow creating regular products with default: false', async () => {
      const createCaller = createCallerFactory(appRouter)
      const caller = createCaller({
        organizationId,
        livemode,
        apiKey: undefined,
      })
      
      const result = await caller.products.create({
        product: {
          name: 'Regular Product 2',
          slug: 'regular-product-2',
          default: false, // This should be allowed
          pricingModelId,
          active: true,
        },
        price: {
          unitPrice: 2000,
          type: PriceType.Subscription,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          name: 'Regular Price',
          active: true,
        },
      })
      
      expect(result.product).toBeDefined()
      expect(result.product.default).toBe(false)
    })
  })

  describe('editProduct', () => {
    it('should throw error when attempting to change default field on any product', async () => {
      const createCaller = createCallerFactory(appRouter)
      const caller = createCaller({
        organizationId,
        livemode,
        apiKey: undefined,
      })
      
      // Try to change a regular product to default
      await expect(
        caller.products.edit({
          product: {
            id: regularProductId,
            default: true, // Trying to change to default
          },
        })
      ).rejects.toThrow('Cannot change the default status of a product')
      
      // Try to change a default product to non-default
      await expect(
        caller.products.edit({
          product: {
            id: defaultProductId,
            default: false, // Trying to remove default status
          },
        })
      ).rejects.toThrow('Cannot change the default status of a product')
    })
    
    it('should allow updating allowed fields on default products', async () => {
      const createCaller = createCallerFactory(appRouter)
      const caller = createCaller({
        organizationId,
        livemode,
        apiKey: undefined,
      })
      
      const result = await caller.products.edit({
        product: {
          id: defaultProductId,
          name: 'Updated Base Plan Name', // Allowed field
          slug: 'updated-base-plan', // Allowed field
          description: 'Updated description', // Allowed field
        },
      })
      
      expect(result.product).toBeDefined()
      expect(result.product.name).toBe('Updated Base Plan Name')
      expect(result.product.slug).toBe('updated-base-plan')
      expect(result.product.description).toBe('Updated description')
      expect(result.product.default).toBe(true) // Should remain default
    })
    
    it('should throw error when attempting to update restricted fields on default products', async () => {
      const createCaller = createCallerFactory(appRouter)
      const caller = createCaller({
        organizationId,
        livemode,
        apiKey: undefined,
      })
      
      // Try to change pricingModelId
      await expect(
        caller.products.edit({
          product: {
            id: defaultProductId,
            pricingModelId: core.nanoid(), // Not allowed on default products
          },
        })
      ).rejects.toThrow('Cannot update the following fields on default products')
    })
    
    it('should allow updating any field on non-default products', async () => {
      const createCaller = createCallerFactory(appRouter)
      const caller = createCaller({
        organizationId,
        livemode,
        apiKey: undefined,
      })
      
      const result = await caller.products.edit({
        product: {
          id: regularProductId,
          name: 'Updated Regular Product',
          active: false, // This should be allowed on regular products
        },
      })
      
      expect(result.product).toBeDefined()
      expect(result.product.name).toBe('Updated Regular Product')
      expect(result.product.active).toBe(false)
    })
  })
})