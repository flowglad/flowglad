import { beforeEach, describe, expect, it } from 'bun:test'
import {
  CurrencyCode,
  IntervalUnit,
  PriceType,
  UsageMeterAggregationType,
} from '@db-core/enums'
import { TRPCError } from '@trpc/server'
import { Result } from 'better-result'
import { setupOrg, setupUserAndApiKey } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import * as orgSetup from '@/db/tableMethods/organizationMethods'
import {
  insertPrice,
  safelyUpdatePrice,
  selectPriceById,
} from '@/db/tableMethods/priceMethods'
import {
  insertProduct,
  selectProductById,
} from '@/db/tableMethods/productMethods'
import { insertUsageMeter } from '@/db/tableMethods/usageMeterMethods'
import { ValidationError } from '@/errors'
import type { TRPCApiContext } from '@/server/trpcContext'
import { createPricingModelBookkeeping } from '@/utils/bookkeeping'
import core from '@/utils/core'
import { validateDefaultPriceUpdate } from '@/utils/defaultProductValidation'
import { pricesRouter } from './pricesRouter'
import { productsRouter } from './productsRouter'

describe('pricesRouter - Default Price Constraints', () => {
  let organizationId: string
  let pricingModelId: string
  let defaultProductId: string
  let defaultPriceId: string
  let regularProductId: string
  let regularPriceId: string
  const livemode = false

  beforeEach(async () => {
    // Set up organization and pricing model with default product and price
    const result = (
      await adminTransaction(async (ctx) => {
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
            ...ctx,
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
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
            externalId: null,
            pricingModelId:
              bookkeepingResult.unwrap().pricingModel.id,
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
            slug: 'regular-price',
          },
          ctx
        )

        return Result.ok({
          organizationId: organization.id,
          pricingModelId: bookkeepingResult.unwrap().pricingModel.id,
          defaultProductId:
            bookkeepingResult.unwrap().defaultProduct.id,
          defaultPriceId: bookkeepingResult.unwrap().defaultPrice.id,
          regularProductId: regularProduct.id,
          regularPriceId: regularPrice.id,
        })
      })
    ).unwrap()

    organizationId = result.organizationId
    pricingModelId = result.pricingModelId
    defaultProductId = result.defaultProductId
    defaultPriceId = result.defaultPriceId
    regularProductId = result.regularProductId
    regularPriceId = result.regularPriceId
  })

  describe('editPrice - Default Price on Default Product', () => {
    it('returns Result.err with ValidationError when attempting to change unitPrice of default price on default product to non-zero', async () => {
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const existingPrice = (
            await selectPriceById(defaultPriceId, transaction)
          ).unwrap()
          const product = (
            await selectProductById(
              existingPrice.productId!,
              transaction
            )
          ).unwrap()

          const validationResult = validateDefaultPriceUpdate(
            { unitPrice: 1000, type: PriceType.Subscription },
            existingPrice,
            product
          )
          expect(Result.isError(validationResult)).toBe(true)
          if (Result.isError(validationResult)) {
            expect(validationResult.error).toBeInstanceOf(
              ValidationError
            )
            expect(validationResult.error.reason).toBe(
              'Default prices for default products must have a unitPrice of 0'
            )
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should allow unitPrice of 0 for default price on default product', async () => {
      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const existingPrice = (
            await selectPriceById(defaultPriceId, transaction)
          ).unwrap()
          const product = (
            await selectProductById(
              existingPrice.productId!,
              transaction
            )
          ).unwrap()

          // This should return ok
          const validationResult = validateDefaultPriceUpdate(
            {
              unitPrice: 0,
              type: PriceType.Subscription,
              name: 'Updated Base Plan Price',
            },
            existingPrice,
            product
          )
          expect(Result.isOk(validationResult)).toBe(true)

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
            ctx
          )

          return Result.ok(updatedPrice)
        })
      ).unwrap()

      expect(result).toMatchObject({})
      expect(result.unitPrice).toBe(0)
      expect(result.name).toBe('Updated Base Plan Price')
    })

    it('returns Result.err with ValidationError when attempting to change isDefault status of default price on default product', async () => {
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const existingPrice = (
            await selectPriceById(defaultPriceId, transaction)
          ).unwrap()
          const product = (
            await selectProductById(
              existingPrice.productId!,
              transaction
            )
          ).unwrap()

          const validationResult = validateDefaultPriceUpdate(
            { isDefault: false, type: PriceType.Subscription },
            existingPrice,
            product
          )
          expect(Result.isError(validationResult)).toBe(true)
          if (Result.isError(validationResult)) {
            expect(validationResult.error).toBeInstanceOf(
              ValidationError
            )
            expect(validationResult.error.reason).toBe(
              'Cannot change the default status of a default price on a default product'
            )
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('returns Result.err with ValidationError when attempting to change intervalUnit of default price on default product', async () => {
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const existingPrice = (
            await selectPriceById(defaultPriceId, transaction)
          ).unwrap()
          const product = (
            await selectProductById(
              existingPrice.productId!,
              transaction
            )
          ).unwrap()

          const validationResult = validateDefaultPriceUpdate(
            {
              intervalUnit: IntervalUnit.Year,
              type: PriceType.Subscription,
            },
            existingPrice,
            product
          )
          expect(Result.isError(validationResult)).toBe(true)
          if (Result.isError(validationResult)) {
            expect(validationResult.error).toBeInstanceOf(
              ValidationError
            )
            expect(validationResult.error.reason).toBe(
              'Cannot change the billing interval of the default price for a default product'
            )
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should allow updating non-financial fields on default price of default product', async () => {
      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const existingPrice = (
            await selectPriceById(defaultPriceId, transaction)
          ).unwrap()
          const product = (
            await selectProductById(
              existingPrice.productId!,
              transaction
            )
          ).unwrap()

          // This should return ok
          const validationResult = validateDefaultPriceUpdate(
            {
              name: 'Updated Default Price Name',
              active: false,
              type: PriceType.Subscription,
            },
            existingPrice,
            product
          )
          expect(Result.isOk(validationResult)).toBe(true)

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
            ctx
          )

          return Result.ok(updatedPrice)
        })
      ).unwrap()

      expect(result).toMatchObject({})
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
        pricingModelId,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        isApi: true as const,
        path: '',
        authScope: 'merchant' as const,
      }
      await expect(
        pricesRouter.createCaller(ctx as TRPCApiContext).update({
          // @ts-expect-error - Intentionally providing minimal fields to test NOT_FOUND error path
          price: {
            id: 'price_missing_' + core.nanoid(),
            type: PriceType.Subscription,
          },
        })
      ).rejects.toThrow(TRPCError)
    })

    it('productsRouter.update: enforces cross-product price guard (BAD_REQUEST)', async () => {
      const { apiKey } = await setupUserAndApiKey({
        organizationId,
        livemode,
        pricingModelId,
      })
      const apiCtx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        isApi: true as const,
        path: '',
        authScope: 'merchant' as const,
      }
      // create another product with its own price
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const otherProduct = await insertProduct(
            {
              name: 'Another Product',
              slug: 'another-product',
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
          const org = (
            await orgSetup.selectOrganizationById(
              organizationId,
              transaction
            )
          ).unwrap()
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
              usageEventsPerUnit: null,
              usageMeterId: null,
              externalId: null,
              slug: 'other-price',
            },
            ctx
          )
          await expect(
            productsRouter
              .createCaller(apiCtx as TRPCApiContext)
              .update({
                // @ts-expect-error - Intentionally providing minimal product object for cross-product price guard test
                product: { id: defaultProductId },
                // @ts-expect-error - Intentionally providing minimal price object for cross-product price guard test
                price: { id: otherPrice.id },
              })
          ).rejects.toThrow(TRPCError)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('pricesRouter.create: enforces single default per product and auto-default for first price', async () => {
      const { apiKey } = await setupUserAndApiKey({
        organizationId,
        livemode,
        pricingModelId,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        path: '',
        authScope: 'merchant' as const,
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
          },
        })
      ).rejects.toThrow(TRPCError)
    })
  })

  describe('editPrice - Regular Prices', () => {
    it('should allow updating unitPrice on regular prices', async () => {
      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const existingPrice = (
            await selectPriceById(regularPriceId, transaction)
          ).unwrap()
          const product = (
            await selectProductById(
              existingPrice.productId!,
              transaction
            )
          ).unwrap()

          // This should return ok for regular prices
          const validationResult = validateDefaultPriceUpdate(
            { unitPrice: 2000, type: PriceType.Subscription },
            existingPrice,
            product
          )
          expect(Result.isOk(validationResult)).toBe(true)

          // Actually update the price
          const updatedPrice = await safelyUpdatePrice(
            {
              id: regularPriceId,
              type: PriceType.Subscription,
              unitPrice: 2000,
            },
            ctx
          )

          return Result.ok(updatedPrice)
        })
      ).unwrap()

      expect(result).toMatchObject({})
      expect(result.unitPrice).toBe(2000)
    })

    it('should allow changing isDefault status on regular prices', async () => {
      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
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
              usageEventsPerUnit: null,
              usageMeterId: null,
              externalId: null,
              slug: 'another-price',
            },
            ctx
          )

          const existingPrice = (
            await selectPriceById(regularPriceId, transaction)
          ).unwrap()
          const product = (
            await selectProductById(
              existingPrice.productId!,
              transaction
            )
          ).unwrap()

          // This should return ok for regular prices
          const validationResult = validateDefaultPriceUpdate(
            { isDefault: false, type: PriceType.Subscription },
            existingPrice,
            product
          )
          expect(Result.isOk(validationResult)).toBe(true)

          // Actually update the price
          const updatedPrice = await safelyUpdatePrice(
            {
              id: regularPriceId,
              type: PriceType.Subscription,
              isDefault: false,
            },
            ctx
          )

          return Result.ok(updatedPrice)
        })
      ).unwrap()

      expect(result).toMatchObject({})
      expect(result.isDefault).toBe(false)
    })
  })

  describe('createPrice', () => {
    it('should forbid creating additional prices for default products', async () => {
      const { apiKey } = await setupUserAndApiKey({
        organizationId,
        livemode,
        pricingModelId,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        isApi: true as const,
        path: '',
        authScope: 'merchant' as const,
      }

      await expect(
        pricesRouter.createCaller(ctx as TRPCApiContext).create({
          price: {
            productId: defaultProductId,
            unitPrice: 500, // Non-zero price for a non-default price on default product
            isDefault: false,
            type: PriceType.Subscription,
            intervalUnit: IntervalUnit.Year,
            intervalCount: 1,
            name: 'Premium Plan',
            trialPeriodDays: 0,
            slug: 'premium-plan',
            active: true,
          },
        })
      ).rejects.toThrow(
        'Cannot create additional prices for the default plan'
      )
    })

    it('should allow default prices on non-default products to have non-zero unitPrice', async () => {
      const { apiKey } = await setupUserAndApiKey({
        organizationId,
        livemode,
        pricingModelId,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        isApi: true as const,
        path: '',
        authScope: 'merchant' as const,
      }

      // First, create a new product without any prices in the same pricing model
      // (use the same pricingModelId as the API key to ensure RLS access)
      const newProduct = (
        await adminTransaction(async (ctx) => {
          const product = await insertProduct(
            {
              name: 'New Product',
              slug: 'new-product',
              default: false,
              description: null,
              imageURL: null,
              singularQuantityLabel: null,
              pluralQuantityLabel: null,
              externalId: null,
              pricingModelId, // Use the describe block's PM to match API key scope
              organizationId,
              livemode,
              active: true,
            },
            ctx
          )

          return Result.ok(product)
        })
      ).unwrap()

      // This should succeed - default price on non-default product with non-zero price
      const result = await pricesRouter
        .createCaller(ctx as TRPCApiContext)
        .create({
          price: {
            productId: newProduct.id,
            unitPrice: 2500, // Non-zero price for a default price on non-default product
            isDefault: true,
            type: PriceType.Subscription,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            name: 'Premium Default Price',
            trialPeriodDays: 0,
            slug: 'premium-default',
            active: true,
          },
        })

      expect(result.price).toMatchObject({})
      expect(result.price.unitPrice).toBe(2500)
      expect(result.price.isDefault).toBe(true)
    })

    it('should enforce single default price per product constraint', async () => {
      const result = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
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
            usageEventsPerUnit: null,
            usageMeterId: null,
            externalId: null,
            slug: 'another-default',
          },
          ctx
        )
        return Result.ok(undefined)
      })
      // Database constraint will return an error
      expect(Result.isError(result)).toBe(true)
    })
  })

  describe('getPrice', () => {
    it('should return a price when a valid ID is provided', async () => {
      const { apiKey, user } = await setupUserAndApiKey({
        organizationId,
        livemode,
        pricingModelId,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        path: '',
        authScope: 'merchant' as const,
        user,
      }

      const result = await pricesRouter
        .createCaller(ctx)
        .get({ id: regularPriceId })

      expect(result).toMatchObject({})
      expect(result.price).toMatchObject({})
      expect(result.price.id).toBe(regularPriceId)
    })

    it('should throw a TRPCError when an invalid ID is provided', async () => {
      const { apiKey, user } = await setupUserAndApiKey({
        organizationId,
        livemode,
        pricingModelId,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        path: '',
        authScope: 'merchant' as const,
        user,
      }
      const invalidId = 'price_invalid_' + core.nanoid()

      await expect(
        pricesRouter.createCaller(ctx).get({ id: invalidId })
      ).rejects.toThrow(TRPCError)
    })
  })
})

describe('prices.getTableRows (usage-meter filters)', () => {
  let organizationId: string
  let pricingModelId: string
  let usageMeterAId: string
  let usageMeterBId: string
  let usagePriceAId: string
  let usagePriceBId: string
  let subscriptionPriceId: string
  let inactiveUsagePriceId: string
  const livemode = false

  beforeEach(async () => {
    const result = (
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const { organization } = await setupOrg()

        // Create pricing model with default product
        const bookkeepingResult = await createPricingModelBookkeeping(
          {
            pricingModel: {
              name: 'Test Pricing Model for Usage Prices',
              isDefault: false,
            },
          },
          {
            ...ctx,
            organizationId: organization.id,
            livemode,
          }
        )

        const pricingModelId =
          bookkeepingResult.unwrap().pricingModel.id

        // Create two usage meters
        const usageMeterA = await insertUsageMeter(
          {
            name: 'Fast Generations',
            slug: 'fast-generations',
            organizationId: organization.id,
            pricingModelId,
            livemode,
            aggregationType: UsageMeterAggregationType.Sum,
          },
          ctx
        )

        const usageMeterB = await insertUsageMeter(
          {
            name: 'Slow Generations',
            slug: 'slow-generations',
            organizationId: organization.id,
            pricingModelId,
            livemode,
            aggregationType: UsageMeterAggregationType.Sum,
          },
          ctx
        )

        // Create products for usage prices
        const usageProductA = await insertProduct(
          {
            name: 'Usage Product A',
            slug: 'usage-product-a',
            default: false,
            description: null,
            imageURL: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
            externalId: null,
            pricingModelId,
            organizationId: organization.id,
            livemode,
            active: true,
          },
          ctx
        )

        const usageProductB = await insertProduct(
          {
            name: 'Usage Product B',
            slug: 'usage-product-b',
            default: false,
            description: null,
            imageURL: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
            externalId: null,
            pricingModelId,
            organizationId: organization.id,
            livemode,
            active: true,
          },
          ctx
        )

        const usageProductC = await insertProduct(
          {
            name: 'Usage Product C',
            slug: 'usage-product-c',
            default: false,
            description: null,
            imageURL: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
            externalId: null,
            pricingModelId,
            organizationId: organization.id,
            livemode,
            active: true,
          },
          ctx
        )

        const subscriptionProduct = await insertProduct(
          {
            name: 'Subscription Product',
            slug: 'subscription-product',
            default: false,
            description: null,
            imageURL: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
            externalId: null,
            pricingModelId,
            organizationId: organization.id,
            livemode,
            active: true,
          },
          ctx
        )

        // Create usage price for meter A (active)
        // Usage prices don't have productId - they belong to usage meters
        const usagePriceA = await insertPrice(
          {
            productId: null,
            pricingModelId,
            unitPrice: 100,
            isDefault: true,
            type: PriceType.Usage,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            currency: organization.defaultCurrency,
            livemode,
            active: true,
            name: 'Usage Price A',
            trialPeriodDays: null,
            usageEventsPerUnit: 1,
            usageMeterId: usageMeterA.id,
            externalId: null,
            slug: 'usage-price-a',
          },
          ctx
        )

        // Create usage price for meter B (active)
        // Usage prices don't have productId - they belong to usage meters
        const usagePriceB = await insertPrice(
          {
            productId: null,
            pricingModelId,
            unitPrice: 200,
            isDefault: true,
            type: PriceType.Usage,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            currency: organization.defaultCurrency,
            livemode,
            active: true,
            name: 'Usage Price B',
            trialPeriodDays: null,
            usageEventsPerUnit: 100,
            usageMeterId: usageMeterB.id,
            externalId: null,
            slug: 'usage-price-b',
          },
          ctx
        )

        // Create inactive usage price for meter A.
        // Usage prices don't have productId (they belong to usage meters).
        const inactiveUsagePrice = await insertPrice(
          {
            productId: null,
            pricingModelId,
            unitPrice: 50,
            isDefault: false,
            type: PriceType.Usage,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            currency: organization.defaultCurrency,
            livemode,
            active: false,
            name: 'Inactive Usage Price',
            trialPeriodDays: null,
            usageEventsPerUnit: 10,
            usageMeterId: usageMeterA.id,
            externalId: null,
            slug: 'inactive-usage-price',
          },
          ctx
        )

        // Create a subscription price (not usage)
        const subscriptionPrice = await insertPrice(
          {
            productId: subscriptionProduct.id,
            unitPrice: 1000,
            isDefault: true,
            type: PriceType.Subscription,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            currency: organization.defaultCurrency,
            livemode,
            active: true,
            name: 'Subscription Price',
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            usageMeterId: null,
            externalId: null,
            slug: 'subscription-price',
          },
          ctx
        )

        return Result.ok({
          organizationId: organization.id,
          pricingModelId,
          usageMeterAId: usageMeterA.id,
          usageMeterBId: usageMeterB.id,
          usagePriceAId: usagePriceA.id,
          usagePriceBId: usagePriceB.id,
          subscriptionPriceId: subscriptionPrice.id,
          inactiveUsagePriceId: inactiveUsagePrice.id,
        })
      })
    ).unwrap()

    organizationId = result.organizationId
    pricingModelId = result.pricingModelId
    usageMeterAId = result.usageMeterAId
    usageMeterBId = result.usageMeterBId
    usagePriceAId = result.usagePriceAId
    usagePriceBId = result.usagePriceBId
    subscriptionPriceId = result.subscriptionPriceId
    inactiveUsagePriceId = result.inactiveUsagePriceId
  })

  it('returns only usage prices for a given usageMeterId', async () => {
    const { apiKey, user } = await setupUserAndApiKey({
      organizationId,
      livemode,
      pricingModelId,
    })
    const ctx = {
      organizationId,
      apiKey: apiKey.token!,
      livemode,
      environment: 'live' as const,
      path: '',
      authScope: 'merchant' as const,
      user,
    }

    // Query for meter A prices
    const resultA = await pricesRouter
      .createCaller(ctx)
      .getTableRows({
        filters: {
          usageMeterId: usageMeterAId,
          type: PriceType.Usage,
        },
      })

    // Should include both active and inactive prices for meter A
    expect(resultA.items.length).toBe(2)
    const priceIds = resultA.items.map((item) => item.price.id)
    expect(priceIds).toContain(usagePriceAId)
    expect(priceIds).toContain(inactiveUsagePriceId)
    expect(priceIds).not.toContain(usagePriceBId)
    expect(priceIds).not.toContain(subscriptionPriceId)

    // Query for meter B prices
    const resultB = await pricesRouter
      .createCaller(ctx)
      .getTableRows({
        filters: {
          usageMeterId: usageMeterBId,
          type: PriceType.Usage,
        },
      })

    expect(resultB.items.length).toBe(1)
    expect(resultB.items[0].price.id).toBe(usagePriceBId)
  })

  it('respects active filter when provided', async () => {
    const { apiKey, user } = await setupUserAndApiKey({
      organizationId,
      livemode,
      pricingModelId,
    })
    const ctx = {
      organizationId,
      apiKey: apiKey.token!,
      livemode,
      environment: 'live' as const,
      path: '',
      authScope: 'merchant' as const,
      user,
    }

    // Query for active prices only on meter A
    const activeResult = await pricesRouter
      .createCaller(ctx)
      .getTableRows({
        filters: {
          usageMeterId: usageMeterAId,
          type: PriceType.Usage,
          active: true,
        },
      })

    expect(activeResult.items.length).toBe(1)
    expect(activeResult.items[0].price.id).toBe(usagePriceAId)
    expect(activeResult.items[0].price.active).toBe(true)

    // Query for inactive prices only on meter A
    const inactiveResult = await pricesRouter
      .createCaller(ctx)
      .getTableRows({
        filters: {
          usageMeterId: usageMeterAId,
          type: PriceType.Usage,
          active: false,
        },
      })

    expect(inactiveResult.items.length).toBe(1)
    expect(inactiveResult.items[0].price.id).toBe(
      inactiveUsagePriceId
    )
    expect(inactiveResult.items[0].price.active).toBe(false)
  })

  it('combines usageMeterId and type filters correctly', async () => {
    const { apiKey, user } = await setupUserAndApiKey({
      organizationId,
      livemode,
      pricingModelId,
    })
    const ctx = {
      organizationId,
      apiKey: apiKey.token!,
      livemode,
      environment: 'live' as const,
      path: '',
      authScope: 'merchant' as const,
      user,
    }

    // Query for subscription prices (should not return usage prices even with usageMeterId)
    const subscriptionResult = await pricesRouter
      .createCaller(ctx)
      .getTableRows({
        filters: {
          type: PriceType.Subscription,
        },
      })

    // Should include the subscription price and the default pricing model price
    const hasSubscriptionPrice = subscriptionResult.items.some(
      (item) => item.price.id === subscriptionPriceId
    )
    expect(hasSubscriptionPrice).toBe(true)

    // None of the results should have a usageMeterId
    for (const item of subscriptionResult.items) {
      if (item.price.type === PriceType.Subscription) {
        expect(item.price.usageMeterId).toBeNull()
      }
    }
  })
})

describe('pricesRouter - API Contract Updates', () => {
  let organizationId: string
  let pricingModelId: string
  let usageMeterId: string
  let regularProductId: string
  const livemode = false

  beforeEach(async () => {
    const result = (
      await adminTransaction(async (ctx) => {
        const { organization } = await setupOrg()

        // Create pricing model with default product
        const bookkeepingResult = await createPricingModelBookkeeping(
          {
            pricingModel: {
              name: 'Test Pricing Model for PR4',
              isDefault: false,
            },
          },
          {
            ...ctx,
            organizationId: organization.id,
            livemode,
          }
        )

        const pricingModelId =
          bookkeepingResult.unwrap().pricingModel.id

        // Create a usage meter
        const usageMeter = await insertUsageMeter(
          {
            name: 'API Calls',
            slug: 'api-calls',
            organizationId: organization.id,
            pricingModelId,
            livemode,
            aggregationType: UsageMeterAggregationType.Sum,
          },
          ctx
        )

        // Create a regular product (for testing subscription prices)
        const regularProduct = await insertProduct(
          {
            name: 'Regular Product',
            slug: 'regular-product-pr4',
            default: false,
            description: null,
            imageURL: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
            externalId: null,
            pricingModelId,
            organizationId: organization.id,
            livemode,
            active: true,
          },
          ctx
        )

        return Result.ok({
          organizationId: organization.id,
          pricingModelId,
          usageMeterId: usageMeter.id,
          regularProductId: regularProduct.id,
        })
      })
    ).unwrap()

    organizationId = result.organizationId
    pricingModelId = result.pricingModelId
    usageMeterId = result.usageMeterId
    regularProductId = result.regularProductId
  })

  describe('createPrice - price type and productId validation', () => {
    it('rejects usage price when productId is explicitly provided as a non-null string via schema validation', async () => {
      const { apiKey } = await setupUserAndApiKey({
        organizationId,
        livemode,
        pricingModelId,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        isApi: true as const,
        path: '',
        authScope: 'merchant' as const,
      }

      // Attempt to create a usage price with a productId (should fail)
      // The zod schema enforces usage prices must have productId: null
      await expect(
        pricesRouter.createCaller(ctx as TRPCApiContext).create({
          // @ts-expect-error - Intentionally passing productId (should be null for usage prices)
          // to test that the schema rejects usage prices with a productId.
          price: {
            type: PriceType.Usage,
            usageMeterId,
            productId: regularProductId,
            unitPrice: 100,
            isDefault: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            name: 'Usage Price With Product',
            usageEventsPerUnit: 1,
          },
        })
      ).rejects.toThrow(TRPCError)
    })

    it('creates usage price with null productId successfully (pricingModelId derived from usageMeterId)', async () => {
      const { apiKey } = await setupUserAndApiKey({
        organizationId,
        livemode,
        pricingModelId,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        isApi: true as const,
        path: '',
        authScope: 'merchant' as const,
      }

      // Create a usage price with productId: null (pricingModelId derived automatically from usageMeterId)
      const result = await pricesRouter
        .createCaller(ctx as TRPCApiContext)
        .create({
          price: {
            type: PriceType.Usage,
            usageMeterId,
            productId: null,
            unitPrice: 100,
            isDefault: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            name: 'Usage Price No Product',
            slug: 'usage_price_no_product',
            usageEventsPerUnit: 1,
          },
        })

      expect(result.price.id).toMatch(/^price_/)
      expect(result.price.type).toBe(PriceType.Usage)
      expect(result.price.productId).toBeNull()
      expect(result.price.usageMeterId).toBe(usageMeterId)
      expect(result.price.pricingModelId).toBe(pricingModelId)
    })

    it('creates usage price when productId is omitted (pricingModelId derived from usageMeterId)', async () => {
      const { apiKey } = await setupUserAndApiKey({
        organizationId,
        livemode,
        pricingModelId,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        isApi: true as const,
        path: '',
        authScope: 'merchant' as const,
      }

      // Create a usage price without productId field (should succeed, defaulting to null)
      // pricingModelId is derived automatically from usageMeterId
      const result = await pricesRouter
        .createCaller(ctx as TRPCApiContext)
        .create({
          price: {
            type: PriceType.Usage,
            usageMeterId,
            // productId intentionally omitted
            unitPrice: 200,
            isDefault: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            name: 'Usage Price Omitted Product',
            slug: 'usage_price_omitted_product',
            usageEventsPerUnit: 10,
          },
        })

      expect(result.price.type).toBe(PriceType.Usage)
      expect(result.price.productId).toBeNull()
      expect(result.price.unitPrice).toBe(200)
      expect(result.price.pricingModelId).toBe(pricingModelId)
    })

    it('creates subscription price with productId successfully', async () => {
      const { apiKey } = await setupUserAndApiKey({
        organizationId,
        livemode,
        pricingModelId,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        isApi: true as const,
        path: '',
        authScope: 'merchant' as const,
      }

      // Create a subscription price with productId (should succeed)
      const result = await pricesRouter
        .createCaller(ctx as TRPCApiContext)
        .create({
          price: {
            type: PriceType.Subscription,
            productId: regularProductId,
            unitPrice: 1000,
            isDefault: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            name: 'Subscription Price',
            slug: 'subscription_price_with_product',
            trialPeriodDays: 0,
          },
        })

      expect(result.price.type).toBe(PriceType.Subscription)
      expect(result.price.productId).toBe(regularProductId)
    })
  })
})

describe('pricesRouter.replaceUsagePrice', () => {
  let organizationId: string
  let pricingModelId: string
  let usageMeterId: string
  let usagePriceId: string
  let subscriptionPriceId: string
  const livemode = false

  beforeEach(async () => {
    const result = (
      await adminTransaction(async (ctx) => {
        const { organization } = await setupOrg()

        // Create pricing model with default product
        const bookkeepingResult = await createPricingModelBookkeeping(
          {
            pricingModel: {
              name: 'Test Pricing Model for replaceUsagePrice',
              isDefault: false,
            },
          },
          {
            ...ctx,
            organizationId: organization.id,
            livemode,
          }
        )

        const pricingModelId =
          bookkeepingResult.unwrap().pricingModel.id

        // Create a usage meter
        const usageMeter = await insertUsageMeter(
          {
            name: 'API Calls for Replace Test',
            slug: 'api-calls-replace-test',
            organizationId: organization.id,
            pricingModelId,
            livemode,
            aggregationType: UsageMeterAggregationType.Sum,
          },
          ctx
        )

        // Create a usage price
        const usagePrice = await insertPrice(
          {
            productId: null,
            pricingModelId,
            unitPrice: 100,
            isDefault: true,
            type: PriceType.Usage,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            currency: organization.defaultCurrency,
            livemode,
            active: true,
            name: 'Original Usage Price',
            trialPeriodDays: null,
            usageEventsPerUnit: 10,
            usageMeterId: usageMeter.id,
            externalId: null,
            slug: 'original-usage-price',
          },
          ctx
        )

        // Create a regular product with subscription price (for negative test)
        const regularProduct = await insertProduct(
          {
            name: 'Regular Product for Replace Test',
            slug: 'regular-product-replace-test',
            default: false,
            description: null,
            imageURL: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
            externalId: null,
            pricingModelId,
            organizationId: organization.id,
            livemode,
            active: true,
          },
          ctx
        )

        const subscriptionPrice = await insertPrice(
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
            name: 'Subscription Price',
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            usageMeterId: null,
            externalId: null,
            slug: 'subscription-price-replace-test',
          },
          ctx
        )

        return Result.ok({
          organizationId: organization.id,
          pricingModelId,
          usageMeterId: usageMeter.id,
          usagePriceId: usagePrice.id,
          subscriptionPriceId: subscriptionPrice.id,
        })
      })
    ).unwrap()

    organizationId = result.organizationId
    pricingModelId = result.pricingModelId
    usageMeterId = result.usageMeterId
    usagePriceId = result.usagePriceId
    subscriptionPriceId = result.subscriptionPriceId
  })

  it('atomically creates new price and archives old price when immutable fields change', async () => {
    const { apiKey, user } = await setupUserAndApiKey({
      organizationId,
      livemode,
      pricingModelId,
    })
    const ctx = {
      organizationId,
      apiKey: apiKey.token!,
      livemode,
      environment: 'live' as const,
      path: '',
      authScope: 'merchant' as const,
      user,
    }

    // Replace the usage price with new immutable field values
    const result = await pricesRouter
      .createCaller(ctx)
      .replaceUsagePrice({
        newPrice: {
          type: PriceType.Usage,
          productId: null,
          usageMeterId,
          unitPrice: 200, // Changed from 100
          usageEventsPerUnit: 20, // Changed from 10
          isDefault: true,
          name: 'Updated Usage Price',
          slug: 'updated-usage-price',
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          trialPeriodDays: null,
        },
        oldPriceId: usagePriceId,
      })

    // Verify new price was created with correct values
    expect(result.newPrice.id).not.toBe(usagePriceId)
    expect(result.newPrice.type).toBe(PriceType.Usage)
    expect(result.newPrice.unitPrice).toBe(200)
    expect(result.newPrice.usageEventsPerUnit).toBe(20)
    expect(result.newPrice.name).toBe('Updated Usage Price')
    expect(result.newPrice.active).toBe(true)
    expect(result.newPrice.productId).toBeNull()
    expect(result.newPrice.usageMeterId).toBe(usageMeterId)

    // Verify old price was archived
    expect(result.archivedPrice.id).toBe(usagePriceId)
    expect(result.archivedPrice.active).toBe(false)
    expect(result.archivedPrice.unitPrice).toBe(100) // Original value preserved
    expect(result.archivedPrice.usageEventsPerUnit).toBe(10) // Original value preserved
  })

  it('throws BAD_REQUEST when attempting to replace a non-usage price', async () => {
    const { apiKey, user } = await setupUserAndApiKey({
      organizationId,
      livemode,
      pricingModelId,
    })
    const ctx = {
      organizationId,
      apiKey: apiKey.token!,
      livemode,
      environment: 'live' as const,
      path: '',
      authScope: 'merchant' as const,
      user,
    }

    // Attempt to replace a subscription price (should fail)
    await expect(
      pricesRouter.createCaller(ctx).replaceUsagePrice({
        newPrice: {
          type: PriceType.Usage,
          productId: null,
          usageMeterId,
          unitPrice: 200,
          usageEventsPerUnit: 20,
          isDefault: true,
          name: 'New Usage Price',
          slug: 'new-usage-price',
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          trialPeriodDays: null,
        },
        oldPriceId: subscriptionPriceId, // Subscription price, not usage
      })
    ).rejects.toThrow(
      'replaceUsagePrice can only be used with usage prices'
    )
  })

  it('throws NOT_FOUND when old price ID does not exist', async () => {
    const { apiKey, user } = await setupUserAndApiKey({
      organizationId,
      livemode,
      pricingModelId,
    })
    const ctx = {
      organizationId,
      apiKey: apiKey.token!,
      livemode,
      environment: 'live' as const,
      path: '',
      authScope: 'merchant' as const,
      user,
    }

    // Attempt to replace with invalid old price ID
    await expect(
      pricesRouter.createCaller(ctx).replaceUsagePrice({
        newPrice: {
          type: PriceType.Usage,
          productId: null,
          usageMeterId,
          unitPrice: 200,
          usageEventsPerUnit: 20,
          isDefault: true,
          name: 'New Usage Price',
          slug: 'new-usage-price-not-found',
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          trialPeriodDays: null,
        },
        oldPriceId: 'prc_' + core.nanoid(), // Non-existent price
      })
    ).rejects.toThrow()
  })

  it('throws BAD_REQUEST when new price usageMeterId does not match old price', async () => {
    const { apiKey, user } = await setupUserAndApiKey({
      organizationId,
      livemode,
      pricingModelId,
    })
    const ctx = {
      organizationId,
      apiKey: apiKey.token!,
      livemode,
      environment: 'live' as const,
      path: '',
      authScope: 'merchant' as const,
      user,
    }

    // Attempt to replace with a different usageMeterId
    await expect(
      pricesRouter.createCaller(ctx).replaceUsagePrice({
        newPrice: {
          type: PriceType.Usage,
          productId: null,
          usageMeterId: 'meter_' + core.nanoid(), // Different meter ID
          unitPrice: 200,
          usageEventsPerUnit: 20,
          isDefault: true,
          name: 'New Usage Price',
          slug: 'new-usage-price-different-meter',
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          trialPeriodDays: null,
        },
        oldPriceId: usagePriceId,
      })
    ).rejects.toThrow(
      'New price must belong to the same usage meter as the old price'
    )
  })

  it('preserves other usage prices for the same meter when replacing one', async () => {
    const { apiKey, user } = await setupUserAndApiKey({
      organizationId,
      livemode,
      pricingModelId,
    })
    const ctx = {
      organizationId,
      apiKey: apiKey.token!,
      livemode,
      environment: 'live' as const,
      path: '',
      authScope: 'merchant' as const,
      user,
    }

    // Create a second usage price for the same meter
    const secondPrice = (
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const org = (
          await orgSetup.selectOrganizationById(
            organizationId,
            transaction
          )
        ).unwrap()
        return Result.ok(
          await insertPrice(
            {
              productId: null,
              pricingModelId,
              unitPrice: 500,
              isDefault: false,
              type: PriceType.Usage,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              currency: org.defaultCurrency,
              livemode,
              active: true,
              name: 'Second Usage Price',
              trialPeriodDays: null,
              usageEventsPerUnit: 50,
              usageMeterId,
              externalId: null,
              slug: 'second-usage-price',
            },
            ctx
          )
        )
      })
    ).unwrap()

    // Replace the first usage price
    const result = await pricesRouter
      .createCaller(ctx)
      .replaceUsagePrice({
        newPrice: {
          type: PriceType.Usage,
          productId: null,
          usageMeterId,
          unitPrice: 200,
          usageEventsPerUnit: 20,
          isDefault: true,
          name: 'Replaced First Price',
          slug: 'replaced-first-price',
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          trialPeriodDays: null,
        },
        oldPriceId: usagePriceId,
      })

    // Verify the replacement worked
    expect(result.archivedPrice.id).toBe(usagePriceId)
    expect(result.archivedPrice.active).toBe(false)
    expect(result.newPrice.active).toBe(true)

    // Verify second price is still active (not affected by the replacement)
    const secondPriceAfter = (
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          (
            await selectPriceById(secondPrice.id, transaction)
          ).unwrap()
        )
      })
    ).unwrap()

    expect(secondPriceAfter.active).toBe(true)
    expect(secondPriceAfter.unitPrice).toBe(500)
    expect(secondPriceAfter.usageEventsPerUnit).toBe(50)
  })
})

describe('pricesRouter - Reserved Slug Validation', () => {
  let organizationId: string
  let pricingModelId: string
  let usageMeterId: string
  let regularProductId: string
  let existingUsagePriceId: string
  const livemode = false

  beforeEach(async () => {
    const result = (
      await adminTransaction(async (ctx) => {
        const { organization } = await setupOrg()

        // Create pricing model with default product
        const bookkeepingResult = await createPricingModelBookkeeping(
          {
            pricingModel: {
              name: 'Test Pricing Model for Reserved Slug Validation',
              isDefault: false,
            },
          },
          {
            ...ctx,
            organizationId: organization.id,
            livemode,
          }
        )

        const pricingModelId =
          bookkeepingResult.unwrap().pricingModel.id

        // Create a usage meter
        const usageMeter = await insertUsageMeter(
          {
            name: 'API Calls Reserved Test',
            slug: 'api-calls-reserved-test',
            organizationId: organization.id,
            pricingModelId,
            livemode,
            aggregationType: UsageMeterAggregationType.Sum,
          },
          ctx
        )

        // Create a regular product (for testing subscription prices)
        const regularProduct = await insertProduct(
          {
            name: 'Regular Product Reserved Test',
            slug: 'regular-product-reserved-test',
            default: false,
            description: null,
            imageURL: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
            externalId: null,
            pricingModelId,
            organizationId: organization.id,
            livemode,
            active: true,
          },
          ctx
        )

        // Create an existing usage price for replacement tests
        const existingUsagePrice = await insertPrice(
          {
            productId: null,
            pricingModelId,
            unitPrice: 100,
            isDefault: true,
            type: PriceType.Usage,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            currency: organization.defaultCurrency,
            livemode,
            active: true,
            name: 'Existing Usage Price',
            trialPeriodDays: null,
            usageEventsPerUnit: 10,
            usageMeterId: usageMeter.id,
            externalId: null,
            slug: 'existing-usage-price',
          },
          ctx
        )

        return Result.ok({
          organizationId: organization.id,
          pricingModelId,
          usageMeterId: usageMeter.id,
          regularProductId: regularProduct.id,
          existingUsagePriceId: existingUsagePrice.id,
        })
      })
    ).unwrap()

    organizationId = result.organizationId
    pricingModelId = result.pricingModelId
    usageMeterId = result.usageMeterId
    regularProductId = result.regularProductId
    existingUsagePriceId = result.existingUsagePriceId
  })

  describe('createPrice - reserved slug validation', () => {
    it('rejects usage price creation with _no_charge suffix via API', async () => {
      const { apiKey } = await setupUserAndApiKey({
        organizationId,
        livemode,
        pricingModelId,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        isApi: true as const,
        path: '',
        authScope: 'merchant' as const,
      }

      await expect(
        pricesRouter.createCaller(ctx as TRPCApiContext).create({
          price: {
            type: PriceType.Usage,
            usageMeterId,
            productId: null,
            slug: 'meter_no_charge',
            unitPrice: 100,
            isDefault: false,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            name: 'Reserved Slug Price',
            usageEventsPerUnit: 1,
          },
        })
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: expect.stringContaining('_no_charge'),
      })
    })

    it('allows usage price creation with slug not ending in _no_charge', async () => {
      const { apiKey } = await setupUserAndApiKey({
        organizationId,
        livemode,
        pricingModelId,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        isApi: true as const,
        path: '',
        authScope: 'merchant' as const,
      }

      const result = await pricesRouter
        .createCaller(ctx as TRPCApiContext)
        .create({
          price: {
            type: PriceType.Usage,
            usageMeterId,
            productId: null,
            slug: 'meter_custom_price',
            unitPrice: 100,
            isDefault: false,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            name: 'Custom Usage Price',
            usageEventsPerUnit: 1,
          },
        })

      expect(result.price.slug).toBe('meter_custom_price')
    })

    it('allows subscription price creation with _no_charge suffix', async () => {
      const { apiKey } = await setupUserAndApiKey({
        organizationId,
        livemode,
        pricingModelId,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        isApi: true as const,
        path: '',
        authScope: 'merchant' as const,
      }

      const result = await pricesRouter
        .createCaller(ctx as TRPCApiContext)
        .create({
          price: {
            type: PriceType.Subscription,
            productId: regularProductId,
            slug: 'promo_no_charge',
            unitPrice: 0,
            isDefault: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            name: 'Promo Subscription',
            trialPeriodDays: 0,
          },
        })

      expect(result.price.slug).toBe('promo_no_charge')
    })

    it('allows usage price creation with slug containing _no_charge but not at the end', async () => {
      const { apiKey } = await setupUserAndApiKey({
        organizationId,
        livemode,
        pricingModelId,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        isApi: true as const,
        path: '',
        authScope: 'merchant' as const,
      }

      const result = await pricesRouter
        .createCaller(ctx as TRPCApiContext)
        .create({
          price: {
            type: PriceType.Usage,
            usageMeterId,
            productId: null,
            slug: 'no_charge_extra_meter',
            unitPrice: 100,
            isDefault: false,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            name: 'No Charge Extra Meter',
            usageEventsPerUnit: 1,
          },
        })

      expect(result.price.slug).toBe('no_charge_extra_meter')
    })
  })

  describe('replaceUsagePrice - reserved slug validation', () => {
    it('throws BAD_REQUEST when new price has reserved _no_charge slug suffix', async () => {
      const { apiKey, user } = await setupUserAndApiKey({
        organizationId,
        livemode,
        pricingModelId,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        path: '',
        authScope: 'merchant' as const,
        user,
      }

      await expect(
        pricesRouter.createCaller(ctx).replaceUsagePrice({
          newPrice: {
            type: PriceType.Usage,
            productId: null,
            usageMeterId,
            unitPrice: 200,
            usageEventsPerUnit: 20,
            isDefault: true,
            name: 'Reserved Slug Replacement',
            slug: 'meter_no_charge',
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            trialPeriodDays: null,
          },
          oldPriceId: existingUsagePriceId,
        })
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: expect.stringContaining('_no_charge'),
      })
    })

    it('allows replacement with slug not ending in _no_charge', async () => {
      const { apiKey, user } = await setupUserAndApiKey({
        organizationId,
        livemode,
        pricingModelId,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        path: '',
        authScope: 'merchant' as const,
        user,
      }

      const result = await pricesRouter
        .createCaller(ctx)
        .replaceUsagePrice({
          newPrice: {
            type: PriceType.Usage,
            productId: null,
            usageMeterId,
            unitPrice: 200,
            usageEventsPerUnit: 20,
            isDefault: true,
            name: 'Valid Replacement',
            slug: 'meter_custom_replacement',
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            trialPeriodDays: null,
          },
          oldPriceId: existingUsagePriceId,
        })

      expect(result.newPrice.slug).toBe('meter_custom_replacement')
      expect(result.archivedPrice.id).toBe(existingUsagePriceId)
      expect(result.archivedPrice.active).toBe(false)
    })
  })

  describe('updatePrice - reserved slug validation', () => {
    it('throws BAD_REQUEST when updating usage price slug to reserved _no_charge suffix', async () => {
      const { apiKey, user } = await setupUserAndApiKey({
        organizationId,
        livemode,
        pricingModelId,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        path: '',
        authScope: 'merchant' as const,
        user,
      }

      // Attempt to update existing usage price's slug to a reserved suffix
      await expect(
        pricesRouter.createCaller(ctx).update({
          price: {
            id: existingUsagePriceId,
            type: PriceType.Usage,
            isDefault: true,
            slug: 'updated_no_charge',
          },
          id: existingUsagePriceId,
        })
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: expect.stringContaining('_no_charge'),
      })
    })

    it('allows updating usage price slug to valid slug not ending in _no_charge', async () => {
      const { apiKey, user } = await setupUserAndApiKey({
        organizationId,
        livemode,
        pricingModelId,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        path: '',
        authScope: 'merchant' as const,
        user,
      }

      const result = await pricesRouter.createCaller(ctx).update({
        price: {
          id: existingUsagePriceId,
          type: PriceType.Usage,
          isDefault: true,
          slug: 'updated_valid_slug',
        },
        id: existingUsagePriceId,
      })

      expect(result.price.slug).toBe('updated_valid_slug')
    })

    it('allows updating usage price fields other than slug without triggering slug validation', async () => {
      const { apiKey, user } = await setupUserAndApiKey({
        organizationId,
        livemode,
        pricingModelId,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        path: '',
        authScope: 'merchant' as const,
        user,
      }

      // Update name without changing slug - should not trigger reserved slug validation
      const result = await pricesRouter.createCaller(ctx).update({
        price: {
          id: existingUsagePriceId,
          type: PriceType.Usage,
          isDefault: true,
          name: 'Updated Name',
        },
        id: existingUsagePriceId,
      })

      expect(result.price.name).toBe('Updated Name')
      expect(result.price.slug).toBe('existing-usage-price')
    })
  })
})

describe('pricesRouter - No Charge Price Protection', () => {
  let organizationId: string
  let pricingModelId: string
  let usageMeterId: string
  let noChargePriceId: string
  let regularUsagePriceId: string
  const livemode = false

  beforeEach(async () => {
    const result = (
      await adminTransaction(async (ctx) => {
        const { organization } = await setupOrg()

        // Create pricing model
        const bookkeepingResult = await createPricingModelBookkeeping(
          {
            pricingModel: {
              name: 'Test Pricing Model',
              isDefault: false,
            },
          },
          {
            ...ctx,
            organizationId: organization.id,
            livemode,
          }
        )

        // Create a usage meter
        const usageMeter = await insertUsageMeter(
          {
            name: 'Test Usage Meter',
            slug: 'test-usage-meter',
            organizationId: organization.id,
            pricingModelId:
              bookkeepingResult.unwrap().pricingModel.id,
            livemode,
            aggregationType: UsageMeterAggregationType.Sum,
          },
          ctx
        )

        // Create a no_charge price (system-generated fallback price)
        const noChargePrice = await insertPrice(
          {
            usageMeterId: usageMeter.id,
            unitPrice: 0,
            isDefault: true,
            type: PriceType.Usage,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            currency: organization.defaultCurrency,
            livemode,
            active: true,
            name: 'Test Usage Meter - No Charge',
            trialPeriodDays: null,
            usageEventsPerUnit: 1,
            productId: null,
            externalId: null,
            slug: 'test-usage-meter_no_charge', // Reserved suffix
          },
          ctx
        )

        // Create a regular usage price
        const regularUsagePrice = await insertPrice(
          {
            usageMeterId: usageMeter.id,
            unitPrice: 100,
            isDefault: false,
            type: PriceType.Usage,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            currency: organization.defaultCurrency,
            livemode,
            active: true,
            name: 'Regular Usage Price',
            trialPeriodDays: null,
            usageEventsPerUnit: 1,
            productId: null,
            externalId: null,
            slug: 'regular-usage-price',
          },
          ctx
        )

        return Result.ok({
          organizationId: organization.id,
          pricingModelId: bookkeepingResult.unwrap().pricingModel.id,
          usageMeterId: usageMeter.id,
          noChargePriceId: noChargePrice.id,
          regularUsagePriceId: regularUsagePrice.id,
        })
      })
    ).unwrap()

    organizationId = result.organizationId
    pricingModelId = result.pricingModelId
    usageMeterId = result.usageMeterId
    noChargePriceId = result.noChargePriceId
    regularUsagePriceId = result.regularUsagePriceId
  })

  describe('updatePrice - No Charge Protection', () => {
    it('rejects archiving (active: false) for no_charge prices', async () => {
      const { apiKey, user } = await setupUserAndApiKey({
        organizationId,
        livemode,
        pricingModelId,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        path: '',
        authScope: 'merchant' as const,
        user,
      }

      await expect(
        pricesRouter.createCaller(ctx).update({
          price: {
            id: noChargePriceId,
            type: PriceType.Usage,
            isDefault: true,
            active: false,
          },
          id: noChargePriceId,
        })
      ).rejects.toThrow(
        'No charge prices cannot be archived. They are protected as fallback prices.'
      )
    })

    it('rejects slug changes for no_charge prices', async () => {
      const { apiKey, user } = await setupUserAndApiKey({
        organizationId,
        livemode,
        pricingModelId,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        path: '',
        authScope: 'merchant' as const,
        user,
      }

      await expect(
        pricesRouter.createCaller(ctx).update({
          price: {
            id: noChargePriceId,
            type: PriceType.Usage,
            isDefault: true,
            slug: 'different-slug',
          },
          id: noChargePriceId,
        })
      ).rejects.toThrow(
        'The slug of a no charge price is immutable. Only the name can be changed.'
      )
    })

    it('allows name changes for no_charge prices', async () => {
      const { apiKey, user } = await setupUserAndApiKey({
        organizationId,
        livemode,
        pricingModelId,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        path: '',
        authScope: 'merchant' as const,
        user,
      }

      const result = await pricesRouter.createCaller(ctx).update({
        price: {
          id: noChargePriceId,
          type: PriceType.Usage,
          isDefault: true,
          name: 'New Name for No Charge Price',
        },
        id: noChargePriceId,
      })

      expect(result.price.name).toBe('New Name for No Charge Price')
    })

    it('allows setting isDefault to true on no_charge prices when slug is unchanged in payload', async () => {
      const { apiKey, user } = await setupUserAndApiKey({
        organizationId,
        livemode,
        pricingModelId,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        path: '',
        authScope: 'merchant' as const,
        user,
      }

      // First set the regular price as default (so no_charge becomes non-default)
      await pricesRouter.createCaller(ctx).update({
        price: {
          id: regularUsagePriceId,
          type: PriceType.Usage,
          isDefault: true,
        },
        id: regularUsagePriceId,
      })

      // Verify no_charge price is now non-default before we test setting it back
      const intermediateState = await pricesRouter
        .createCaller(ctx)
        .get({ id: noChargePriceId })
      expect(intermediateState.price.isDefault).toBe(false)

      // Now update the no_charge price including the unchanged slug in the payload
      // This should NOT trigger the reserved slug validation since the slug is unchanged
      const result = await pricesRouter.createCaller(ctx).update({
        price: {
          id: noChargePriceId,
          type: PriceType.Usage,
          isDefault: true,
          slug: 'test-usage-meter_no_charge', // Same slug as before - unchanged
        },
        id: noChargePriceId,
      })

      expect(result.price.isDefault).toBe(true)
      expect(result.price.slug).toBe('test-usage-meter_no_charge')
    })

    it('rejects unsetting isDefault on no_charge prices that are currently default', async () => {
      const { apiKey, user } = await setupUserAndApiKey({
        organizationId,
        livemode,
        pricingModelId,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        path: '',
        authScope: 'merchant' as const,
        user,
      }

      await expect(
        pricesRouter.createCaller(ctx).update({
          price: {
            id: noChargePriceId,
            type: PriceType.Usage,
            isDefault: false,
          },
          id: noChargePriceId,
        })
      ).rejects.toThrow(
        'Default no_charge prices cannot be unset; isDefault is immutable for fallback prices.'
      )
    })
  })

  describe('archivePrice - No Charge Protection', () => {
    it('rejects archiving no_charge prices', async () => {
      const { apiKey, user } = await setupUserAndApiKey({
        organizationId,
        livemode,
        pricingModelId,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        path: '',
        authScope: 'merchant' as const,
        user,
      }

      await expect(
        pricesRouter.createCaller(ctx).archive({
          id: noChargePriceId,
        })
      ).rejects.toThrow(
        'No charge prices cannot be archived. They are protected as fallback prices.'
      )
    })

    it('allows archiving regular usage prices', async () => {
      const { apiKey, user } = await setupUserAndApiKey({
        organizationId,
        livemode,
        pricingModelId,
      })
      const ctx = {
        organizationId,
        apiKey: apiKey.token!,
        livemode,
        environment: 'live' as const,
        path: '',
        authScope: 'merchant' as const,
        user,
      }

      const result = await pricesRouter.createCaller(ctx).archive({
        id: regularUsagePriceId,
      })

      expect(result.price.active).toBe(false)
    })
  })
})
