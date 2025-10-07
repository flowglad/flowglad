import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import { setupOrg, setupUserAndApiKey } from '@/../seedDatabase'
import { PriceType, IntervalUnit, CurrencyCode } from '@/types'
import { insertProduct } from '@/db/tableMethods/productMethods'
import {
  insertPrice,
  selectPriceById,
  safelyUpdatePrice,
} from '@/db/tableMethods/priceMethods'
import { selectProductById } from '@/db/tableMethods/productMethods'
import core from '@/utils/core'
import { createPricingModelBookkeeping } from '@/utils/bookkeeping'
import { validateDefaultPriceUpdate } from '@/utils/defaultProductValidation'
import { TRPCError } from '@trpc/server'
import { pricesRouter } from './pricesRouter'
import { productsRouter } from './productsRouter'
import * as orgSetup from '@/db/tableMethods/organizationMethods'

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
            isDefault: false, // Can't have multiple defaults per org
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
      await expect(
        adminTransaction(async ({ transaction }) => {
          const existingPrice = await selectPriceById(
            defaultPriceId,
            transaction
          )
          const product = await selectProductById(
            existingPrice.productId,
            transaction
          )

          // This should throw an error
          validateDefaultPriceUpdate(
            { unitPrice: 1000, type: PriceType.Subscription },
            existingPrice,
            product
          )
        })
      ).rejects.toThrow(
        'Default prices for default products must have a unitPrice of 0'
      )
    })

    it('should allow unitPrice of 0 for default price on default product', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          const existingPrice = await selectPriceById(
            defaultPriceId,
            transaction
          )
          const product = await selectProductById(
            existingPrice.productId,
            transaction
          )

          // This should not throw
          validateDefaultPriceUpdate(
            {
              unitPrice: 0,
              type: PriceType.Subscription,
              name: 'Updated Base Plan Price',
            },
            existingPrice,
            product
          )

          // Actually update the price
          const updatedPrice = await safelyUpdatePrice(
            {
              id: defaultPriceId,
              type: PriceType.Subscription,
              unitPrice: 0,
              name: 'Updated Base Plan Price',
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
            },
            transaction
          )

          return updatedPrice
        }
      )

      expect(result).toBeDefined()
      expect(result.unitPrice).toBe(0)
      expect(result.name).toBe('Updated Base Plan Price')
    })

    it('should throw error when attempting to change isDefault status of default price on default product', async () => {
      await expect(
        adminTransaction(async ({ transaction }) => {
          const existingPrice = await selectPriceById(
            defaultPriceId,
            transaction
          )
          const product = await selectProductById(
            existingPrice.productId,
            transaction
          )

          // This should throw an error
          validateDefaultPriceUpdate(
            { isDefault: false, type: PriceType.Subscription },
            existingPrice,
            product
          )
        })
      ).rejects.toThrow(
        'Cannot change the default status of a default price on a default product'
      )
    })

    it('should throw error when attempting to change intervalUnit of default price on default product', async () => {
      await expect(
        adminTransaction(async ({ transaction }) => {
          const existingPrice = await selectPriceById(
            defaultPriceId,
            transaction
          )
          const product = await selectProductById(
            existingPrice.productId,
            transaction
          )

          // This should throw an error
          validateDefaultPriceUpdate(
            {
              intervalUnit: IntervalUnit.Year,
              type: PriceType.Subscription,
            },
            existingPrice,
            product
          )
        })
      ).rejects.toThrow(
        'Cannot change the billing interval of the default price for a default product'
      )
    })

    it('should allow updating non-financial fields on default price of default product', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          const existingPrice = await selectPriceById(
            defaultPriceId,
            transaction
          )
          const product = await selectProductById(
            existingPrice.productId,
            transaction
          )

          // This should not throw
          validateDefaultPriceUpdate(
            {
              name: 'Updated Default Price Name',
              active: false,
              type: PriceType.Subscription,
            },
            existingPrice,
            product
          )

          // Actually update the price
          const updatedPrice = await safelyUpdatePrice(
            {
              id: existingPrice.id,
              type: PriceType.Subscription,
              name: 'Updated Default Price Name',
              active: false,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
            },
            transaction
          )

          return updatedPrice
        }
      )

      expect(result).toBeDefined()
      expect(result.name).toBe('Updated Default Price Name')
      expect(result.active).toBe(false)
      expect(result.unitPrice).toBe(0) // Should remain 0
      expect(result.isDefault).toBe(true) // Should remain default
    })
  })

  describe('router-level behaviors', () => {
    it('pricesRouter.update: throws NOT_FOUND for missing price id', async () => {
      const { apiKey } = await setupUserAndApiKey({
        organizationId,
        livemode,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        path: '',
      }
      await expect(
        pricesRouter.createCaller(ctx).update({
          price: {
            id: 'price_missing_' + core.nanoid(),
            type: PriceType.Subscription,
          } as any,
        } as any)
      ).rejects.toThrow(TRPCError)
    })

    it('productsRouter.update: enforces cross-product price guard (BAD_REQUEST)', async () => {
      const { apiKey } = await setupUserAndApiKey({
        organizationId,
        livemode,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        path: '',
      }
      // create another product with its own price
      await adminTransaction(async ({ transaction }) => {
        const otherProduct = await insertProduct(
          {
            name: 'Another Product',
            slug: 'another-product',
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
        const org = await orgSetup.selectOrganizationById(
          organizationId,
          transaction
        )
        const otherPrice = await insertPrice(
          {
            productId: otherProduct.id,
            unitPrice: 4000,
            isDefault: true,
            type: PriceType.Subscription,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            currency: org.defaultCurrency,
            livemode,
            active: true,
            name: 'Other Price',
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
        await expect(
          productsRouter.createCaller(ctx).update({
            product: { id: defaultProductId },
            price: { id: otherPrice.id } as any,
          } as any)
        ).rejects.toThrow(TRPCError)
      })
    })

    it('pricesRouter.create: enforces single default per product and auto-default for first price', async () => {
      const { apiKey } = await setupUserAndApiKey({
        organizationId,
        livemode,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        path: '',
      }
      // attempt to create another default price for default product should fail
      await expect(
        pricesRouter.createCaller(ctx).create({
          price: {
            productId: defaultProductId,
            unitPrice: 0,
            isDefault: true,
            type: PriceType.Subscription,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            name: 'Duplicate Default',
            trialPeriodDays: 0,
            setupFeeAmount: 0,
          },
        })
      ).rejects.toThrow(TRPCError)
    })
  })

  describe('editPrice - Regular Prices', () => {
    it('should allow updating unitPrice on regular prices', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          const existingPrice = await selectPriceById(
            regularPriceId,
            transaction
          )
          const product = await selectProductById(
            existingPrice.productId,
            transaction
          )

          // This should not throw for regular prices
          validateDefaultPriceUpdate(
            { unitPrice: 2000, type: PriceType.Subscription },
            existingPrice,
            product
          )

          // Actually update the price
          const updatedPrice = await safelyUpdatePrice(
            {
              id: regularPriceId,
              type: PriceType.Subscription,
              unitPrice: 2000,
            },
            transaction
          )

          return updatedPrice
        }
      )

      expect(result).toBeDefined()
      expect(result.unitPrice).toBe(2000)
    })

    it('should allow changing isDefault status on regular prices', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          // First create another price to be the new default
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

          const existingPrice = await selectPriceById(
            regularPriceId,
            transaction
          )
          const product = await selectProductById(
            existingPrice.productId,
            transaction
          )

          // This should not throw for regular prices
          validateDefaultPriceUpdate(
            { isDefault: false, type: PriceType.Subscription },
            existingPrice,
            product
          )

          // Actually update the price
          const updatedPrice = await safelyUpdatePrice(
            {
              id: regularPriceId,
              type: PriceType.Subscription,
              isDefault: false,
            },
            transaction
          )

          return updatedPrice
        }
      )

      expect(result).toBeDefined()
      expect(result.isDefault).toBe(false)
    })
  })

  describe('createPrice', () => {
    it('should forbid creating additional prices for default products', async () => {
      const { apiKey } = await setupUserAndApiKey({
        organizationId,
        livemode,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        isApi: true as any,
        path: '',
      } as any

      await expect(
        pricesRouter.createCaller(ctx).create({
          price: {
            productId: defaultProductId,
            unitPrice: 500, // Non-zero price for a non-default price on default product
            isDefault: false,
            type: PriceType.Subscription,
            intervalUnit: IntervalUnit.Year,
            intervalCount: 1,
            name: 'Premium Plan',
            setupFeeAmount: 0,
            trialPeriodDays: 0,
            slug: 'premium-plan',
            active: true,
          },
        })
      ).rejects.toThrow(
        'Cannot create additional prices for the default plan'
      )
    })

    // TODO: cleanup the types here
    it('should allow default prices on non-default products to have non-zero unitPrice', async () => {
      const { apiKey } = await setupUserAndApiKey({
        organizationId,
        livemode,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        isApi: true as any,
        path: '',
      } as any

      // First, create a new product without any prices in the same organization
      const newProduct = await adminTransaction(
        async ({ transaction }) => {
          const pricingModel = await createPricingModelBookkeeping(
            {
              pricingModel: {
                name: 'Test Pricing Model 2',
                isDefault: false,
              },
            },
            {
              transaction,
              organizationId,
              livemode,
            }
          )

          const product = await insertProduct(
            {
              name: 'New Product',
              slug: 'new-product',
              default: false,
              description: null,
              imageURL: null,
              displayFeatures: null,
              singularQuantityLabel: null,
              pluralQuantityLabel: null,
              externalId: null,
              pricingModelId: pricingModel.result.pricingModel.id,
              organizationId,
              livemode,
              active: true,
            },
            transaction
          )

          return product
        }
      )

      // This should succeed - default price on non-default product with non-zero price
      const result = await pricesRouter.createCaller(ctx).create({
        price: {
          productId: newProduct.id,
          unitPrice: 2500, // Non-zero price for a default price on non-default product
          isDefault: true,
          type: PriceType.Subscription,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          name: 'Premium Default Price',
          setupFeeAmount: 0,
          trialPeriodDays: 0,
          slug: 'premium-default',
          active: true,
        } as any,
      } as any)

      expect(result.price).toBeDefined()
      expect(result.price.unitPrice).toBe(2500)
      expect(result.price.isDefault).toBe(true)
    })

    it('should forbid default prices on default products to have non-zero unitPrice', async () => {
      const { apiKey } = await setupUserAndApiKey({
        organizationId,
        livemode,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        isApi: true as any,
        path: '',
      } as any

      // Test the validation by trying to update the existing default price on default product
      await expect(
        pricesRouter.createCaller(ctx).update({
          id: defaultPriceId,
          price: {
            id: defaultPriceId,
            unitPrice: 1000, // Non-zero price for default price on default product - should fail
            type: PriceType.Subscription,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            trialPeriodDays: 0,
            setupFeeAmount: 0,
            isDefault: true,
          },
        } as any)
      ).rejects.toThrow(
        'Default prices for default products must have a unitPrice of 0'
      )
    })

    it('should enforce single default price per product constraint', async () => {
      await expect(
        adminTransaction(async ({ transaction }) => {
          // Try to create another default price for the default product
          await insertPrice(
            {
              productId: defaultProductId,
              unitPrice: 0,
              isDefault: true, // Trying to create another default price
              type: PriceType.Subscription,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              currency: CurrencyCode.USD,
              livemode,
              active: true,
              name: 'Another Default',
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
        })
      ).rejects.toThrow() // Database constraint will throw an error
    })
  })
})
