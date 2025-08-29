import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import { setupOrg } from '@/../seedDatabase'
import { PriceType, IntervalUnit, CurrencyCode } from '@/types'
import { createCallerFactory } from '@/server/trpc'
import { appRouter } from '@/server'
import { insertProduct } from '@/db/tableMethods/productMethods'
import { insertPrice } from '@/db/tableMethods/priceMethods'
import core from '@/utils/core'
import { createPricingModelBookkeeping } from '@/utils/bookkeeping'

describe('pricesRouter - Default Price Constraints', () => {
  let organizationId: string
  let pricingModelId: string
  let defaultProductId: string
  let defaultPriceId: string
  let regularProductId: string
  let regularPriceId: string
  const livemode = true

  beforeEach(async () => {
    // Set up organization and pricing model with default product and price
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
      
      // Create a regular product with a regular price for comparison
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
        regularPriceId: regularPrice.id,
      }
    })
    
    organizationId = result.organizationId
    pricingModelId = result.pricingModelId
    defaultProductId = result.defaultProductId
    defaultPriceId = result.defaultPriceId
    regularProductId = result.regularProductId
    regularPriceId = result.regularPriceId
  })

  describe('editPrice - Default Price on Default Product', () => {
    it('should throw error when attempting to change unitPrice of default price on default product to non-zero', async () => {
      const createCaller = createCallerFactory(appRouter)
      const caller = createCaller({
        organizationId,
        livemode,
        apiKey: undefined,
      })
      
      await expect(
        caller.prices.edit({
          price: {
            id: defaultPriceId,
            unitPrice: 1000, // Trying to change from 0 to 1000
          },
        })
      ).rejects.toThrow('Default prices for default products must have a unitPrice of 0')
    })
    
    it('should allow unitPrice of 0 for default price on default product', async () => {
      const createCaller = createCallerFactory(appRouter)
      const caller = createCaller({
        organizationId,
        livemode,
        apiKey: undefined,
      })
      
      const result = await caller.prices.edit({
        price: {
          id: defaultPriceId,
          unitPrice: 0, // This should be allowed
          name: 'Updated Base Plan Price', // Also update name
        },
      })
      
      expect(result.price).toBeDefined()
      expect(result.price.unitPrice).toBe(0)
      expect(result.price.name).toBe('Updated Base Plan Price')
    })
    
    it('should throw error when attempting to change isDefault status of default price on default product', async () => {
      const createCaller = createCallerFactory(appRouter)
      const caller = createCaller({
        organizationId,
        livemode,
        apiKey: undefined,
      })
      
      await expect(
        caller.prices.edit({
          price: {
            id: defaultPriceId,
            isDefault: false, // Trying to remove default status
          },
        })
      ).rejects.toThrow('Cannot change the default status of a default price on a default product')
    })
    
    it('should allow updating non-financial fields on default price of default product', async () => {
      const createCaller = createCallerFactory(appRouter)
      const caller = createCaller({
        organizationId,
        livemode,
        apiKey: undefined,
      })
      
      const result = await caller.prices.edit({
        price: {
          id: defaultPriceId,
          name: 'Updated Default Price Name',
          active: false, // This should be allowed
        },
      })
      
      expect(result.price).toBeDefined()
      expect(result.price.name).toBe('Updated Default Price Name')
      expect(result.price.active).toBe(false)
      expect(result.price.unitPrice).toBe(0) // Should remain 0
      expect(result.price.isDefault).toBe(true) // Should remain default
    })
  })

  describe('editPrice - Regular Prices', () => {
    it('should allow updating unitPrice on regular prices', async () => {
      const createCaller = createCallerFactory(appRouter)
      const caller = createCaller({
        organizationId,
        livemode,
        apiKey: undefined,
      })
      
      const result = await caller.prices.edit({
        price: {
          id: regularPriceId,
          unitPrice: 2000, // Change from 1000 to 2000
        },
      })
      
      expect(result.price).toBeDefined()
      expect(result.price.unitPrice).toBe(2000)
    })
    
    it('should allow changing isDefault status on regular prices', async () => {
      const createCaller = createCallerFactory(appRouter)
      const caller = createCaller({
        organizationId,
        livemode,
        apiKey: undefined,
      })
      
      // First create another price to be the new default
      await adminTransaction(async ({ transaction }) => {
        await insertPrice(
          {
            productId: regularProductId,
            unitPrice: 3000,
            isDefault: false,
            type: PriceType.Subscription,
            intervalUnit: IntervalUnit.Year,
            intervalCount: 1,
            currency: CurrencyCode.USD,
            livemode,
            active: true,
            name: 'Another Price',
          },
          transaction
        )
      })
      
      // Now we can change the default status
      const result = await caller.prices.edit({
        price: {
          id: regularPriceId,
          isDefault: false, // This should be allowed on regular prices
        },
      })
      
      expect(result.price).toBeDefined()
      expect(result.price.isDefault).toBe(false)
    })
  })

  describe('createPrice', () => {
    it('should allow creating additional prices for default products', async () => {
      const createCaller = createCallerFactory(appRouter)
      const caller = createCaller({
        organizationId,
        livemode,
        apiKey: undefined,
      })
      
      const result = await caller.prices.create({
        price: {
          productId: defaultProductId,
          unitPrice: 500, // Non-zero price for a non-default price on default product
          isDefault: false,
          type: PriceType.Subscription,
          intervalUnit: IntervalUnit.Year,
          intervalCount: 1,
          name: 'Premium Plan',
          active: true,
        },
      })
      
      expect(result.price).toBeDefined()
      expect(result.price.unitPrice).toBe(500)
      expect(result.price.isDefault).toBe(false)
    })
    
    it('should enforce single default price per product constraint', async () => {
      const createCaller = createCallerFactory(appRouter)
      const caller = createCaller({
        organizationId,
        livemode,
        apiKey: undefined,
      })
      
      await expect(
        caller.prices.create({
          price: {
            productId: defaultProductId,
            unitPrice: 0,
            isDefault: true, // Trying to create another default price
            type: PriceType.Subscription,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            name: 'Another Default',
            active: true,
          },
        })
      ).rejects.toThrow('There must be exactly one default price per product')
    })
  })
})