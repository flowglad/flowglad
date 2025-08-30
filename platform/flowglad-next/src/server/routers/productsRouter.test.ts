import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupOrg,
  setupPricingModel,
  setupProduct,
  setupPrice,
} from '@/../seedDatabase'
import { PriceType, IntervalUnit, CurrencyCode } from '@/types'
import { insertProduct, selectProductById, updateProduct } from '@/db/tableMethods/productMethods'
import { insertPrice } from '@/db/tableMethods/priceMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import core from '@/utils/core'
import { createPricingModelBookkeeping } from '@/utils/bookkeeping'
import { validateProductCreation, validateDefaultProductUpdate } from '@/utils/defaultProductValidation'
import { TRPCError } from '@trpc/server'

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
            isDefault: false, // Can't have multiple defaults per org
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
          description: null,
          imageURL: null,
          displayFeatures: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
          externalId: null,
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
          trialPeriodDays: null,
          setupFeeAmount: null,
          usageEventsPerUnit: null,
          usageMeterId: null,
          externalId: null,
          slug: null,
          startsWithCreditTrial: false,
          overagePriceId: null,
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
      expect(() => {
        validateProductCreation({
          name: 'Another Default Product',
          slug: 'another-default',
          default: true, // This should cause an error
          pricingModelId,
          active: true,
          description: '',
          imageURL: '',
          displayFeatures: [],
          singularQuantityLabel: '',
          pluralQuantityLabel: '',
        })
      }).toThrow('Default products cannot be created manually')
    })
    
    it('should allow creating regular products with default: false', async () => {
      const result = await adminTransaction(async ({ transaction }) => {
        // Validate this should not throw
        validateProductCreation({
          name: 'Regular Product 2',
          slug: 'regular-product-2',
          default: false, // This should be allowed
          pricingModelId,
          active: true,
          description: '',
          imageURL: '',
          displayFeatures: [],
          singularQuantityLabel: '',
          pluralQuantityLabel: '',
        })
        
        // Create the product
        const product = await insertProduct(
          {
            name: 'Regular Product 2',
            slug: 'regular-product-2',
            default: false,
            description: null,
            imageURL: null,
            displayFeatures: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
            externalId: null,
            pricingModelId,
            organizationId,
            livemode,
            active: true,
          },
          transaction
        )
        
        // Create a price for the product
        const org = await selectOrganizationById(organizationId, transaction)
        await insertPrice(
          {
            productId: product.id,
            unitPrice: 2000,
            isDefault: true,
            type: PriceType.Subscription,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            currency: org.defaultCurrency,
            livemode,
            active: true,
            name: 'Regular Price',
            trialPeriodDays: null,
            setupFeeAmount: null,
            usageEventsPerUnit: null,
            usageMeterId: null,
            externalId: null,
            slug: null,
            startsWithCreditTrial: false,
            overagePriceId: null,
          },
          transaction
        )
        
        return product
      })
      
      expect(result).toBeDefined()
      expect(result.default).toBe(false)
    })
  })

  describe('editProduct', () => {
    it('should throw error when attempting to change default field on any product', async () => {
      // Test changing a regular product to default
      const { regularProduct, defaultProduct } = await adminTransaction(async ({ transaction }) => {
        const regular = await selectProductById(regularProductId, transaction)
        const defaultProd = await selectProductById(defaultProductId, transaction)
        return { regularProduct: regular, defaultProduct: defaultProd }
      })
      
      // Try to change a regular product to default
      expect(() => {
        validateDefaultProductUpdate(
          { default: true }, // Trying to change to default
          regularProduct
        )
      }).toThrow('Cannot change the default status of a product')
      
      // Try to change a default product to non-default
      expect(() => {
        validateDefaultProductUpdate(
          { default: false }, // Trying to remove default status
          defaultProduct
        )
      }).toThrow('Cannot change the default status of a product')
    })
    
    it('should allow updating allowed fields on default products', async () => {
      const result = await adminTransaction(async ({ transaction }) => {
        const existingProduct = await selectProductById(defaultProductId, transaction)
        
        // This should not throw
        validateDefaultProductUpdate(
          {
            name: 'Updated Base Plan Name',
            slug: 'updated-base-plan',
            description: 'Updated description',
          },
          existingProduct
        )
        
        // Actually update the product
        const updatedProduct = await updateProduct(
          {
            id: defaultProductId,
            name: 'Updated Base Plan Name',
            slug: 'updated-base-plan',
            description: 'Updated description',
          },
          transaction
        )
        
        return updatedProduct
      })
      
      expect(result).toBeDefined()
      expect(result.name).toBe('Updated Base Plan Name')
      expect(result.slug).toBe('updated-base-plan')
      expect(result.description).toBe('Updated description')
      expect(result.default).toBe(true) // Should remain default
    })
    
    it('should throw error when attempting to update restricted fields on default products', async () => {
      await adminTransaction(async ({ transaction }) => {
        const existingProduct = await selectProductById(defaultProductId, transaction)
        
        // Try to change pricingModelId
        expect(() => {
          validateDefaultProductUpdate(
            {
              pricingModelId: core.nanoid(), // Not allowed on default products
            },
            existingProduct
          )
        }).toThrow('Cannot update the following fields on default products')
      })
    })
    
    it('should allow updating any field on non-default products', async () => {
      const result = await adminTransaction(async ({ transaction }) => {
        const existingProduct = await selectProductById(regularProductId, transaction)
        
        // This should not throw for regular products
        validateDefaultProductUpdate(
          {
            name: 'Updated Regular Product',
            active: false,
          },
          existingProduct
        )
        
        // Actually update the product
        const updatedProduct = await updateProduct(
          {
            id: regularProductId,
            name: 'Updated Regular Product',
            active: false,
          },
          transaction
        )
        
        return updatedProduct
      })
      
      expect(result).toBeDefined()
      expect(result.name).toBe('Updated Regular Product')
      expect(result.active).toBe(false)
    })
  })
})