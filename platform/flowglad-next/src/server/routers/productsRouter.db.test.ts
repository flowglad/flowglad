import { beforeEach, describe, expect, it } from 'bun:test'
import { IntervalUnit, PriceType } from '@db-core/enums'
import { setupOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { insertPrice } from '@/db/tableMethods/priceMethods'
import {
  insertProduct,
  selectProductById,
  updateProduct,
} from '@/db/tableMethods/productMethods'
import { ValidationError } from '@/errors'
import { createPricingModelBookkeeping } from '@/utils/bookkeeping'
import core from '@/utils/core'
import {
  validateDefaultProductUpdate,
  validateProductCreation,
} from '@/utils/defaultProductValidation'

describe('productsRouter - Default Product Constraints', () => {
  let organizationId: string
  let pricingModelId: string
  let defaultProductId: string
  let defaultPriceId: string
  let regularProductId: string
  let regularPriceId: string
  const livemode = false

  beforeEach(async () => {
    // Set up organization and pricing model with default product
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const { organization } = await setupOrg()

      // Create pricing model with default product using the new bookkeeping function
      const bookkeepingResult = await createPricingModelBookkeeping(
        {
          pricingModel: {
            name: 'Test Pricing Model',
            isDefault: false, // Can't have multiple defaults per org
          },
          defaultPlanIntervalUnit: IntervalUnit.Month, // Create a subscription price
        },
        { ...ctx, organizationId: organization.id, livemode }
      )

      // Also create a regular product for comparison
      const regularProduct = await insertProduct(
        {
          name: 'Regular Product',
          slug: 'regular-product',
          default: false,
          description: null,
          imageURL: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
          externalId: null,
          pricingModelId: bookkeepingResult.unwrap().pricingModel.id,
          organizationId: organization.id,
          livemode,
          active: true,
        },
        ctx
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
          usageEventsPerUnit: null,
          usageMeterId: null,
          externalId: null,
          slug: null,
        },
        ctx
      )

      return {
        organizationId: organization.id,
        pricingModelId: bookkeepingResult.unwrap().pricingModel.id,
        defaultProductId:
          bookkeepingResult.unwrap().defaultProduct.id,
        defaultPriceId: bookkeepingResult.unwrap().defaultPrice.id,
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

  describe('createProduct', () => {
    it('returns Result.err with ValidationError when attempting to create a product with default: true', async () => {
      const result = validateProductCreation({
        name: 'Another Default Product',
        slug: 'another-default',
        default: true, // This should cause an error
        pricingModelId,
        active: true,
        description: '',
        imageURL: '',
        singularQuantityLabel: '',
        pluralQuantityLabel: '',
      })
      expect(result.status).toBe('error')
      if (result.status === 'error') {
        expect(result.error).toBeInstanceOf(ValidationError)
        expect(result.error.reason).toBe(
          'Default products cannot be created manually. They are automatically created when pricing models are created.'
        )
      }
    })

    it('returns Result.ok when creating regular products with default: false', async () => {
      const result = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        // Validate this should return ok
        const validationResult = validateProductCreation({
          name: 'Regular Product 2',
          slug: 'regular-product-2',
          default: false, // This should be allowed
          pricingModelId,
          active: true,
          description: '',
          imageURL: '',
          singularQuantityLabel: '',
          pluralQuantityLabel: '',
        })
        expect(validationResult.status).toBe('ok')

        // Create the product
        const product = await insertProduct(
          {
            name: 'Regular Product 2',
            slug: 'regular-product-2',
            default: false,
            description: null,
            imageURL: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
            externalId: null,
            pricingModelId,
            organizationId,
            livemode,
            active: true,
          },
          ctx
        )

        // Create a price for the product
        const org = (
          await selectOrganizationById(organizationId, transaction)
        ).unwrap()
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
            usageEventsPerUnit: null,
            usageMeterId: null,
            externalId: null,
            slug: null,
          },
          ctx
        )

        return product
      })

      expect(result).toMatchObject({})
      expect(result.default).toBe(false)
    })
  })

  describe('editProduct', () => {
    it('returns Result.err with ValidationError when attempting to change default field on any product', async () => {
      // Test changing a regular product to default
      const { regularProduct, defaultProduct } =
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const regular = (
            await selectProductById(regularProductId, transaction)
          ).unwrap()
          const defaultProd = (
            await selectProductById(defaultProductId, transaction)
          ).unwrap()
          return {
            regularProduct: regular,
            defaultProduct: defaultProd,
          }
        })

      // Try to change a regular product to default
      const regularToDefaultResult = validateDefaultProductUpdate(
        { default: true }, // Trying to change to default
        regularProduct
      )
      expect(regularToDefaultResult.status).toBe('error')
      if (regularToDefaultResult.status === 'error') {
        expect(regularToDefaultResult.error).toBeInstanceOf(
          ValidationError
        )
        expect(regularToDefaultResult.error.reason).toBe(
          'Cannot change the default status of a product'
        )
      }

      // Try to change a default product to non-default
      const defaultToRegularResult = validateDefaultProductUpdate(
        { default: false }, // Trying to remove default status
        defaultProduct
      )
      expect(defaultToRegularResult.status).toBe('error')
      if (defaultToRegularResult.status === 'error') {
        expect(defaultToRegularResult.error).toBeInstanceOf(
          ValidationError
        )
        expect(defaultToRegularResult.error.reason).toBe(
          'Cannot change the default status of a product'
        )
      }
    })

    it('returns Result.ok when updating allowed fields on default products (excluding slug)', async () => {
      const result = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const existingProduct = (
          await selectProductById(defaultProductId, transaction)
        ).unwrap()

        // This should return ok
        const validationResult = validateDefaultProductUpdate(
          {
            name: 'Updated Base Plan Name',
            description: 'Updated description',
          },
          existingProduct
        )
        expect(validationResult.status).toBe('ok')

        // Actually update the product
        const updatedProduct = await updateProduct(
          {
            id: defaultProductId,
            name: 'Updated Base Plan Name',
            description: 'Updated description',
          },
          ctx
        )

        return updatedProduct
      })

      expect(result).toMatchObject({})
      expect(result.name).toBe('Updated Base Plan Name')
      expect(result.description).toBe('Updated description')
      expect(result.default).toBe(true) // Should remain default
    })

    it('returns Result.err with ValidationError when attempting to update restricted fields on default products', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const existingProduct = (
          await selectProductById(defaultProductId, transaction)
        ).unwrap()

        // Try to change pricingModelId
        const pricingModelResult = validateDefaultProductUpdate(
          {
            pricingModelId: core.nanoid(), // Not allowed on default products
          },
          existingProduct
        )
        expect(pricingModelResult.status).toBe('error')
        if (pricingModelResult.status === 'error') {
          expect(pricingModelResult.error).toBeInstanceOf(
            ValidationError
          )
          expect(pricingModelResult.error.reason).toContain(
            'Cannot update the following fields on default products'
          )
        }

        // Try to change slug (falls under generic disallowed fields validation)
        const slugResult = validateDefaultProductUpdate(
          {
            slug: 'should-not-allow-slug-changes',
          },
          existingProduct
        )
        expect(slugResult.status).toBe('error')
        if (slugResult.status === 'error') {
          expect(slugResult.error).toBeInstanceOf(ValidationError)
          expect(slugResult.error.reason).toContain(
            'Cannot update the following fields on default products: slug'
          )
        }
      })
    })

    it('returns Result.ok when updating any field on non-default products', async () => {
      const result = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const existingProduct = (
          await selectProductById(regularProductId, transaction)
        ).unwrap()

        // This should return ok for regular products
        const validationResult = validateDefaultProductUpdate(
          {
            name: 'Updated Regular Product',
            active: false,
          },
          existingProduct
        )
        expect(validationResult.status).toBe('ok')

        // Actually update the product
        const updatedProduct = await updateProduct(
          {
            id: regularProductId,
            name: 'Updated Regular Product',
            active: false,
          },
          ctx
        )

        return updatedProduct
      })

      expect(result).toMatchObject({})
      expect(result.name).toBe('Updated Regular Product')
      expect(result.active).toBe(false)
    })
  })
})
