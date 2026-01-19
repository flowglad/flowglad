import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupCustomer,
  setupOrg,
  setupPrice,
  setupPricingModel,
  setupProduct,
  setupProductFeature,
  setupResource,
  setupResourceFeature,
  setupUsageMeter,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { CurrencyCode, IntervalUnit, PriceType } from '@/types'
import { core } from '@/utils/core'
import type { Organization } from '../schema/organizations'
import {
  nulledPriceColumns,
  type Price,
  usagePriceDefaultColumns,
} from '../schema/prices'
import type { PricingModel } from '../schema/pricingModels'
import type { Product } from '../schema/products'
import type { UsageMeter } from '../schema/usageMeters'
import { updateCustomer } from './customerMethods'
import {
  bulkInsertPrices,
  dangerouslyInsertPrice,
  derivePricingModelIdForPrice,
  insertPrice,
  pricingModelIdsForPrices,
  safelyInsertPrice,
  safelyUpdatePrice,
  selectPriceById,
  selectPriceBySlugAndCustomerId,
  selectPriceBySlugForDefaultPricingModel,
  selectPricesAndProductByProductId,
  selectPricesAndProductsForOrganization,
  selectResourceFeaturesForPrice,
  selectResourceFeaturesForPrices,
  updatePrice,
} from './priceMethods'
import { updatePricingModel } from './pricingModelMethods'

describe('priceMethods.ts', () => {
  let organization: Organization.Record
  let product: Product.Record
  let price: Price.Record

  beforeEach(async () => {
    const setup = await setupOrg()
    organization = setup.organization

    // Setup product
    product = await setupProduct({
      organizationId: organization.id,
      name: 'Test Product',
      livemode: true,
      pricingModelId: setup.pricingModel.id,
    })

    // Setup price
    price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      type: PriceType.Subscription,
      unitPrice: 1000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: true,
      trialPeriodDays: 0,
      currency: CurrencyCode.USD,
    })
  })

  describe('safelyInsertPrice', () => {
    it('successfully inserts a price', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          const newPrice = await safelyInsertPrice(
            {
              ...nulledPriceColumns,
              productId: product.id,
              name: 'New Price',
              type: PriceType.Subscription,
              unitPrice: 2000,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              livemode: true,
              trialPeriodDays: 0,
              currency: CurrencyCode.USD,
              externalId: null,
              slug: `new-price+${core.nanoid()}`,
            },
            transaction
          )

          expect(newPrice.name).toBe('New Price')
          expect(newPrice.unitPrice).toBe(2000)
          expect(newPrice.active).toBe(true)
          expect(newPrice.isDefault).toBe(true)
          // Verify pricingModelId is correctly derived from product
          expect(newPrice.pricingModelId).toBe(product.pricingModelId)
        })
      ).unwrap()
    })

    it('sets all other prices to non-default when inserting a default price', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          // First, create another price for the same product
          const secondPrice = await setupPrice({
            productId: product.id,
            name: 'Second Price',
            type: PriceType.Subscription,
            unitPrice: 1500,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            livemode: true,
            isDefault: false,
            trialPeriodDays: 0,
            currency: CurrencyCode.USD,
          })

          // Now insert a new default price
          const newDefaultPrice = await safelyInsertPrice(
            {
              ...nulledPriceColumns,
              productId: product.id,
              name: 'New Default Price',
              type: PriceType.Subscription,
              unitPrice: 3000,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              livemode: true,
              trialPeriodDays: 0,
              currency: CurrencyCode.USD,
              externalId: null,
              slug: `new-default-price+${core.nanoid()}`,
            },
            transaction
          )

          // Verify the new price is default
          expect(newDefaultPrice.active).toBe(true)
          expect(newDefaultPrice.isDefault).toBe(true)
          // Verify pricingModelId is correctly derived from product
          expect(newDefaultPrice.pricingModelId).toBe(
            product.pricingModelId
          )

          // Verify the previous default price is no longer default
          const updatedSecondPrice = await selectPriceById(
            secondPrice.id,
            transaction
          )
          expect(updatedSecondPrice.isDefault).toBe(false)

          // Verify the original price is no longer default
          const updatedOriginalPrice = await selectPriceById(
            price.id,
            transaction
          )
          expect(updatedOriginalPrice.isDefault).toBe(false)
        })
      ).unwrap()
    })
  })

  describe('safelyUpdatePrice', () => {
    it('successfully updates a price', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          const updatedPrice = await safelyUpdatePrice(
            {
              id: price.id,
              name: 'Updated Price',
              unitPrice: 2500,
              type: PriceType.Subscription,
            },
            transaction
          )

          expect(updatedPrice.name).toBe('Updated Price')
          expect(updatedPrice.unitPrice).toBe(2500)
          expect(updatedPrice.isDefault).toBe(true) // Should remain default
        })
      ).unwrap()
    })

    it('sets all other prices to non-default when updating a price to default', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          // First, create another price for the same product
          const secondPrice = await setupPrice({
            productId: product.id,
            name: 'Second Price',
            type: PriceType.Subscription,
            unitPrice: 1500,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            livemode: true,
            isDefault: false,
            trialPeriodDays: 0,
            currency: CurrencyCode.USD,
          })

          // Now update the second price to be default
          const updatedSecondPrice = await safelyUpdatePrice(
            {
              id: secondPrice.id,
              isDefault: true,
              type: PriceType.Subscription,
            },
            transaction
          )

          // Verify the second price is now default
          expect(updatedSecondPrice.isDefault).toBe(true)

          // Verify the original price is no longer default
          const updatedOriginalPrice = await selectPriceById(
            price.id,
            transaction
          )
          expect(updatedOriginalPrice.isDefault).toBe(false)
        })
      ).unwrap()
    })

    it('sets other prices to non-default and not active when addin and updating a new price', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          // First, create another price for the same product
          const secondPrice = await setupPrice({
            productId: product.id,
            name: 'Second Price',
            type: PriceType.Subscription,
            unitPrice: 1500,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            livemode: true,
            isDefault: false,
            trialPeriodDays: 0,
            currency: CurrencyCode.USD,
          })
          // Verify the second price is active & default
          expect(secondPrice.active).toBe(true)
          expect(secondPrice.isDefault).toBe(true)

          // Update the second price without changing its default status
          const updatedSecondPrice = await safelyUpdatePrice(
            {
              id: secondPrice.id,
              name: 'Updated Second Price',
              unitPrice: 2000,
              type: PriceType.Subscription,
            },
            transaction
          )

          // Verify the second price is still active & default
          expect(updatedSecondPrice.active).toBe(true)
          expect(updatedSecondPrice.isDefault).toBe(true)
          expect(updatedSecondPrice.name).toBe('Updated Second Price')
          expect(updatedSecondPrice.unitPrice).toBe(2000)

          // Verify the original price is no longer active & default
          const updatedOriginalPrice = await selectPriceById(
            price.id,
            transaction
          )
          expect(updatedOriginalPrice.active).toBe(false)
          expect(updatedOriginalPrice.isDefault).toBe(false)
        })
      ).unwrap()
    })

    it('retrieves the correct product with prices after updates', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          // Create another price for the same product
          const secondPrice = await setupPrice({
            productId: product.id,
            name: 'Second Price',
            type: PriceType.Subscription,
            unitPrice: 1500,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            livemode: true,
            isDefault: false,
            trialPeriodDays: 0,
            currency: CurrencyCode.USD,
          })

          // Update the second price to be default
          await safelyUpdatePrice(
            {
              id: secondPrice.id,
              isDefault: true,
              type: PriceType.Subscription,
            },
            transaction
          )

          // Get the product with its prices
          const productWithPrices =
            await selectPricesAndProductByProductId(
              product.id,
              transaction
            )

          // Verify the product has both prices
          expect(productWithPrices.prices.length).toBe(2)

          // Verify the default price is the second price
          expect(productWithPrices.defaultPrice.id).toBe(
            secondPrice.id
          )
          expect(productWithPrices.defaultPrice.isDefault).toBe(true)
        })
      ).unwrap()
    })
  })

  describe('Database Constraints', () => {
    it('throws an error when inserting a second default price for the same product', async () => {
      // The first default price is created in beforeEach
      const newPriceInsert: Price.SubscriptionInsert = {
        productId: product.id,
        name: 'Another Default Price',
        type: PriceType.Subscription,
        unitPrice: 5000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
        trialPeriodDays: 0,
        currency: CurrencyCode.USD,
        externalId: null,
        active: true,
        usageEventsPerUnit: null,
        usageMeterId: null,
        slug: `another-default-price+${core.nanoid()}`,
      }

      // Expect the entire transaction to fail due to the unique constraint violation
      await expect(
        adminTransaction(async ({ transaction }) => {
          await insertPrice(newPriceInsert, transaction)
        })
      ).rejects.toThrow(/Failed query:/)
    })

    it('does not throw an error when adding and updating a price to be default when another default price exists', async () => {
      // First, create another non-default price for the same product
      const secondPrice = await setupPrice({
        productId: product.id,
        name: 'Second Price',
        type: PriceType.Subscription,
        unitPrice: 1500,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        trialPeriodDays: 0,
        currency: CurrencyCode.USD,
      })

      // Attempt to update the second price to be default
      // This should fail because 'price' is already the default for this product
      await expect(
        adminTransaction(async ({ transaction }) => {
          await updatePrice(
            {
              id: secondPrice.id,
              isDefault: true,
              type: PriceType.Subscription,
            },
            transaction
          )
        })
      ).resolves.not.toThrow()
    })

    it('allows inserting a non-default price when a default price already exists', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          // A default price for product.id already exists from the beforeEach hook.
          const nonDefaultPriceInsert: Price.SubscriptionInsert = {
            productId: product.id,
            name: 'Non-Default Price',
            type: PriceType.Subscription,
            unitPrice: 4000,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            livemode: true,
            isDefault: false,
            trialPeriodDays: 0,
            currency: CurrencyCode.USD,
            externalId: null,
            active: true,
            usageEventsPerUnit: null,
            usageMeterId: null,
            slug: `non-default-price+${core.nanoid()}`,
          }

          const newPrice = await insertPrice(
            nonDefaultPriceInsert,
            transaction
          )
          expect(newPrice.isDefault).toBe(false)

          const productWithPrices =
            await selectPricesAndProductByProductId(
              product.id,
              transaction
            )
          expect(productWithPrices.prices.length).toBe(2)
          const defaultPriceCount = productWithPrices.prices.filter(
            (p) => p.isDefault
          ).length
          expect(defaultPriceCount).toBe(1)
        })
      ).unwrap()
    })

    it('allows multiple prices for the same product but only the latest one is default', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          // The first default price is created in beforeEach

          // Create a second price
          const secondPrice = await setupPrice({
            productId: product.id,
            name: 'Second Price',
            type: PriceType.Subscription,
            unitPrice: 1500,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            livemode: true,
            isDefault: false,
            trialPeriodDays: 0,
            currency: CurrencyCode.USD,
          })

          // Create a third price
          const lastPrice = await setupPrice({
            productId: product.id,
            name: 'Third Price',
            type: PriceType.Subscription,
            unitPrice: 2500,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            livemode: true,
            isDefault: false,
            trialPeriodDays: 0,
            currency: CurrencyCode.USD,
          })

          const productWithPrices =
            await selectPricesAndProductByProductId(
              product.id,
              transaction
            )
          expect(productWithPrices.prices.length).toBe(3)
          const defaultPrices = productWithPrices.prices.filter(
            (p) => p.isDefault
          )
          expect(defaultPrices.length).toBe(1)
          expect(defaultPrices[0].active).toBe(true)
          expect(defaultPrices[0].id).toBe(lastPrice.id)

          const updatedPrice = await selectPriceById(
            price.id,
            transaction
          )
          const updatedSecondPrice = await selectPriceById(
            secondPrice.id,
            transaction
          )
          expect(updatedSecondPrice.active).toBe(false)
          expect(updatedSecondPrice.isDefault).toBe(false)
          expect(updatedPrice.active).toBe(false)
          expect(updatedPrice.isDefault).toBe(false)
        })
      ).unwrap()
    })

    it('allows multiple default prices for different products', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          // The first default price for the first product is created in beforeEach

          // Create a second product
          const secondProduct = await setupProduct({
            organizationId: organization.id,
            name: 'Second Test Product',
            pricingModelId: product.pricingModelId,
          })

          // Create a default price for the second product
          const defaultPriceForSecondProduct = await setupPrice({
            productId: secondProduct.id,
            name: 'Default Price for Second Product',
            type: PriceType.Subscription,
            unitPrice: 9999,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            livemode: true,
            isDefault: true,
            trialPeriodDays: 0,
            currency: CurrencyCode.USD,
          })

          expect(defaultPriceForSecondProduct.isDefault).toBe(true)
          expect(defaultPriceForSecondProduct.productId).toBe(
            secondProduct.id
          )

          // Verify the original price is still default for its product
          const originalPrice = await selectPriceById(
            price.id,
            transaction
          )
          expect(originalPrice.isDefault).toBe(true)
          expect(originalPrice.productId).toBe(product.id)
        })
      ).unwrap()
    })
  })

  // Slug uniqueness RLS policy tests
  describe('Slug uniqueness policies', () => {
    it('throws an error when inserting a price with duplicate slug in same pricing model across products (both active)', async () => {
      const slug = 'duplicate-slug'
      await expect(
        adminTransaction(async ({ transaction }) => {
          // Create a second product in the same pricing model
          const secondProduct = await setupProduct({
            organizationId: organization.id,
            name: 'Second Product',
            pricingModelId: product.pricingModelId,
          })
          // Insert first ACTIVE price with slug on the original product
          await insertPrice(
            {
              ...nulledPriceColumns,
              productId: product.id,
              name: 'First Slug Price',
              type: PriceType.Subscription,
              unitPrice: 1000,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              livemode: true,
              isDefault: false,
              trialPeriodDays: 0,
              currency: CurrencyCode.USD,
              externalId: null,
              active: true,
              slug,
            },
            transaction
          )
          // Attempt to insert another ACTIVE price with the same slug on the second product
          await insertPrice(
            {
              ...nulledPriceColumns,
              productId: secondProduct.id,
              name: 'Second Slug Price',
              type: PriceType.Subscription,
              unitPrice: 1500,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              livemode: true,
              isDefault: false,
              trialPeriodDays: 0,
              currency: CurrencyCode.USD,
              externalId: null,
              active: true,
              slug,
            },
            transaction
          )
        })
      ).rejects.toThrow(/Failed query: /)
    })

    it('throws an error when updating a price slug to one that already exists on an active price in the same pricing model', async () => {
      const slug1 = 'slug-one'
      const slug2 = 'slug-two'
      await expect(
        adminTransaction(async ({ transaction }) => {
          // Create a second product in the same pricing model
          const secondProduct = await setupProduct({
            organizationId: organization.id,
            name: 'Second Product',
            pricingModelId: product.pricingModelId,
          })
          // Insert first ACTIVE price with slug1 on the original product
          const firstPrice = await insertPrice(
            {
              ...nulledPriceColumns,
              productId: product.id,
              name: 'First Slug Price',
              type: PriceType.Subscription,
              unitPrice: 1000,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              livemode: true,
              isDefault: false,
              trialPeriodDays: 0,
              currency: CurrencyCode.USD,
              externalId: null,
              active: true,
              slug: slug1,
            },
            transaction
          )
          // Insert second ACTIVE price with slug2 on the second product
          const secondPrice = await insertPrice(
            {
              ...nulledPriceColumns,
              productId: secondProduct.id,
              name: 'Second Slug Price',
              type: PriceType.Subscription,
              unitPrice: 1500,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              livemode: true,
              isDefault: false,
              trialPeriodDays: 0,
              currency: CurrencyCode.USD,
              externalId: null,
              active: true,
              slug: slug2,
            },
            transaction
          )
          // Attempt to update the second price to have slug1 (both are active)
          await updatePrice(
            {
              id: secondPrice.id,
              slug: slug1,
              type: PriceType.Subscription,
            },
            transaction
          )
        })
      ).rejects.toThrow(/Failed query: /)
    })

    it('allows inserting active price with slug different from existing active prices slugs', async () => {
      const slug1 = 'active-slug-1'
      const slug2 = 'active-slug-2'
      ;(
        await adminTransaction(async ({ transaction }) => {
          // Create a second product in the same pricing model
          const secondProduct = await setupProduct({
            organizationId: organization.id,
            name: 'Second Product',
            pricingModelId: product.pricingModelId,
          })
          // Insert first ACTIVE price with slug1
          await insertPrice(
            {
              ...nulledPriceColumns,
              productId: product.id,
              name: 'First Active Price',
              type: PriceType.Subscription,
              unitPrice: 1000,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              livemode: true,
              isDefault: false,
              trialPeriodDays: 0,
              currency: CurrencyCode.USD,
              externalId: null,
              active: true,
              slug: slug1,
            },
            transaction
          )
          // Insert second ACTIVE price with a different slug (slug2) - should succeed
          const insertedPrice = await insertPrice(
            {
              ...nulledPriceColumns,
              productId: secondProduct.id,
              name: 'Second Active Price',
              type: PriceType.Subscription,
              unitPrice: 1500,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              livemode: true,
              isDefault: false,
              trialPeriodDays: 0,
              currency: CurrencyCode.USD,
              externalId: null,
              active: true,
              slug: slug2,
            },
            transaction
          )
          expect(insertedPrice.id).toMatch(/^price_/)
          expect(insertedPrice.slug).toBe(slug2)
          expect(insertedPrice.active).toBe(true)
        })
      ).unwrap()
    })

    it('allows updating the slug on an active price to a value different from existing active prices slugs', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          // Create a second product in the same pricing model
          const secondProduct = await setupProduct({
            organizationId: organization.id,
            name: 'Second Product',
            pricingModelId: product.pricingModelId,
          })

          // Insert two ACTIVE prices with unique slugs
          const price1 = await insertPrice(
            {
              ...nulledPriceColumns,
              productId: product.id,
              name: 'Active Price 1',
              type: PriceType.Subscription,
              unitPrice: 1000,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              livemode: true,
              isDefault: false,
              trialPeriodDays: 0,
              currency: CurrencyCode.USD,
              externalId: null,
              active: true,
              slug: 'slug-original',
            },
            transaction
          )

          const price2 = await insertPrice(
            {
              ...nulledPriceColumns,
              productId: secondProduct.id,
              name: 'Active Price 2',
              type: PriceType.Subscription,
              unitPrice: 1200,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              livemode: true,
              isDefault: false,
              trialPeriodDays: 0,
              currency: CurrencyCode.USD,
              externalId: null,
              active: true,
              slug: 'slug-other',
            },
            transaction
          )

          // Now update price1's slug to a different, not-taken slug
          const updatedSlug = 'slug-updated'
          const updateResult = await updatePrice(
            {
              id: price1.id,
              slug: updatedSlug,
              type: PriceType.Subscription,
            },
            transaction
          )

          expect(updateResult.id).toBe(price1.id)
          expect(updateResult.slug).toBe(updatedSlug)
          // Ensure no collision or constraint thrown, and price2 untouched
          expect(price2.slug).toBe('slug-other')
        })
      ).unwrap()
    })

    it('allows inserting inactive price with slug that exists on active price in same pricing model', async () => {
      const slug = 'shared-slug'
      ;(
        await adminTransaction(async ({ transaction }) => {
          // Create a second product in the same pricing model
          const secondProduct = await setupProduct({
            organizationId: organization.id,
            name: 'Second Product',
            pricingModelId: product.pricingModelId,
          })
          // Insert first ACTIVE price with slug
          await insertPrice(
            {
              ...nulledPriceColumns,
              productId: product.id,
              name: 'Active Price',
              type: PriceType.Subscription,
              unitPrice: 1000,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              livemode: true,
              isDefault: false,
              trialPeriodDays: 0,
              currency: CurrencyCode.USD,
              externalId: null,
              active: true,
              slug,
            },
            transaction
          )
          // Insert INACTIVE price with same slug - should succeed
          const inactivePrice = await insertPrice(
            {
              ...nulledPriceColumns,
              productId: secondProduct.id,
              name: 'Inactive Price',
              type: PriceType.Subscription,
              unitPrice: 1500,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              livemode: true,
              isDefault: false,
              trialPeriodDays: 0,
              currency: CurrencyCode.USD,
              externalId: null,
              active: false,
              slug,
            },
            transaction
          )
          expect(inactivePrice.slug).toBe(slug)
          expect(inactivePrice.active).toBe(false)
        })
      ).unwrap()
    })

    it('allows inserting active price with slug that exists on inactive price in same pricing model', async () => {
      const slug = 'reusable-slug'
      ;(
        await adminTransaction(async ({ transaction }) => {
          // Create a second product in the same pricing model
          const secondProduct = await setupProduct({
            organizationId: organization.id,
            name: 'Second Product',
            pricingModelId: product.pricingModelId,
          })
          // Insert first INACTIVE price with slug
          await insertPrice(
            {
              ...nulledPriceColumns,
              productId: product.id,
              name: 'Inactive Price',
              type: PriceType.Subscription,
              unitPrice: 1000,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              livemode: true,
              isDefault: false,
              trialPeriodDays: 0,
              currency: CurrencyCode.USD,
              externalId: null,
              active: false,
              slug,
            },
            transaction
          )
          // Insert ACTIVE price with same slug - should succeed
          const activePrice = await insertPrice(
            {
              ...nulledPriceColumns,
              productId: secondProduct.id,
              name: 'Active Price',
              type: PriceType.Subscription,
              unitPrice: 1500,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              livemode: true,
              isDefault: false,
              trialPeriodDays: 0,
              currency: CurrencyCode.USD,
              externalId: null,
              active: true,
              slug,
            },
            transaction
          )
          expect(activePrice.slug).toBe(slug)
          expect(activePrice.active).toBe(true)
        })
      ).unwrap()
    })

    it('allows updating price from active to inactive even when another active price has same slug', async () => {
      const slug = 'shared-slug'
      ;(
        await adminTransaction(async ({ transaction }) => {
          // Create a second product in the same pricing model
          const secondProduct = await setupProduct({
            organizationId: organization.id,
            name: 'Second Product',
            pricingModelId: product.pricingModelId,
          })
          // Insert first ACTIVE price with slug
          const firstPrice = await insertPrice(
            {
              ...nulledPriceColumns,
              productId: product.id,
              name: 'First Active Price',
              type: PriceType.Subscription,
              unitPrice: 1000,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              livemode: true,
              isDefault: false,
              trialPeriodDays: 0,
              currency: CurrencyCode.USD,
              externalId: null,
              active: true,
              slug,
            },
            transaction
          )
          // Insert second ACTIVE price with DIFFERENT slug
          const secondPrice = await insertPrice(
            {
              ...nulledPriceColumns,
              productId: secondProduct.id,
              name: 'Second Active Price',
              type: PriceType.Subscription,
              unitPrice: 1500,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              livemode: true,
              isDefault: false,
              trialPeriodDays: 0,
              currency: CurrencyCode.USD,
              externalId: null,
              active: true,
              slug: 'different-slug-initially',
            },
            transaction
          )
          // Update second price slug to match first AND set to inactive - should succeed
          const updatedPrice = await updatePrice(
            {
              id: secondPrice.id,
              active: false,
              slug,
              type: PriceType.Subscription,
            },
            transaction
          )
          expect(updatedPrice.active).toBe(false)
          expect(updatedPrice.slug).toBe(slug)
        })
      ).unwrap()
    })

    it('throws an error when updating inactive price to active when another active price has the same slug', async () => {
      const slug = 'conflicting-slug'
      await expect(
        adminTransaction(async ({ transaction }) => {
          // Create a second product in the same pricing model
          const secondProduct = await setupProduct({
            organizationId: organization.id,
            name: 'Second Product',
            pricingModelId: product.pricingModelId,
          })
          // Insert first ACTIVE price with slug
          await insertPrice(
            {
              ...nulledPriceColumns,
              productId: product.id,
              name: 'Active Price',
              type: PriceType.Subscription,
              unitPrice: 1000,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              livemode: true,
              isDefault: false,
              trialPeriodDays: 0,
              currency: CurrencyCode.USD,
              externalId: null,
              active: true,
              slug,
            },
            transaction
          )
          // Insert INACTIVE price with same slug
          const inactivePrice = await insertPrice(
            {
              ...nulledPriceColumns,
              productId: secondProduct.id,
              name: 'Inactive Price',
              type: PriceType.Subscription,
              unitPrice: 1500,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              livemode: true,
              isDefault: false,
              trialPeriodDays: 0,
              currency: CurrencyCode.USD,
              externalId: null,
              active: false,
              slug,
            },
            transaction
          )
          // Attempt to update inactive price to active - should fail
          await updatePrice(
            {
              id: inactivePrice.id,
              active: true,
              type: PriceType.Subscription,
            },
            transaction
          )
        })
      ).rejects.toThrow(/Failed query: /)
    })

    it('allows multiple inactive prices with the same slug in same pricing model', async () => {
      const slug = 'inactive-slug'
      ;(
        await adminTransaction(async ({ transaction }) => {
          // Create a second product in the same pricing model
          const secondProduct = await setupProduct({
            organizationId: organization.id,
            name: 'Second Product',
            pricingModelId: product.pricingModelId,
          })
          // Insert first INACTIVE price with slug
          const firstPrice = await insertPrice(
            {
              ...nulledPriceColumns,
              productId: product.id,
              name: 'First Inactive Price',
              type: PriceType.Subscription,
              unitPrice: 1000,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              livemode: true,
              isDefault: false,
              trialPeriodDays: 0,
              currency: CurrencyCode.USD,
              externalId: null,
              active: false,
              slug,
            },
            transaction
          )
          // Insert second INACTIVE price with same slug - should succeed
          const secondPrice = await insertPrice(
            {
              ...nulledPriceColumns,
              productId: secondProduct.id,
              name: 'Second Inactive Price',
              type: PriceType.Subscription,
              unitPrice: 1500,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              livemode: true,
              isDefault: false,
              trialPeriodDays: 0,
              currency: CurrencyCode.USD,
              externalId: null,
              active: false,
              slug,
            },
            transaction
          )
          expect(firstPrice.slug).toBe(slug)
          expect(firstPrice.active).toBe(false)
          expect(secondPrice.slug).toBe(slug)
          expect(secondPrice.active).toBe(false)
        })
      ).unwrap()
    })

    it('allows updating inactive price slug to match another inactive price slug', async () => {
      const slug = 'shared-inactive-slug'
      ;(
        await adminTransaction(async ({ transaction }) => {
          // Create a second product in the same pricing model
          const secondProduct = await setupProduct({
            organizationId: organization.id,
            name: 'Second Product',
            pricingModelId: product.pricingModelId,
          })
          // Insert first INACTIVE price with the target slug
          await insertPrice(
            {
              ...nulledPriceColumns,
              productId: product.id,
              name: 'First Inactive Price',
              type: PriceType.Subscription,
              unitPrice: 1000,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              livemode: true,
              isDefault: false,
              trialPeriodDays: 0,
              currency: CurrencyCode.USD,
              externalId: null,
              active: false,
              slug,
            },
            transaction
          )
          // Insert second INACTIVE price with different slug
          const secondPrice = await insertPrice(
            {
              ...nulledPriceColumns,
              productId: secondProduct.id,
              name: 'Second Inactive Price',
              type: PriceType.Subscription,
              unitPrice: 1500,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              livemode: true,
              isDefault: false,
              trialPeriodDays: 0,
              currency: CurrencyCode.USD,
              externalId: null,
              active: false,
              slug: 'different-slug',
            },
            transaction
          )
          // Update second price to have same slug as first - should succeed since both inactive
          const updatedPrice = await updatePrice(
            {
              id: secondPrice.id,
              slug,
              type: PriceType.Subscription,
            },
            transaction
          )
          expect(updatedPrice.slug).toBe(slug)
          expect(updatedPrice.active).toBe(false)
        })
      ).unwrap()
    })
  })

  describe('selectPriceBySlugAndCustomerId', () => {
    let organization: Organization.Record
    let product: Product.Record
    let price: Price.Record
    let customer: Awaited<ReturnType<typeof setupCustomer>>
    let pricingModelId: string

    beforeEach(async () => {
      const setup = await setupOrg()
      organization = setup.organization
      pricingModelId = setup.pricingModel.id

      // Setup product
      product = await setupProduct({
        organizationId: organization.id,
        name: 'Test Product',
        livemode: true,
        pricingModelId: pricingModelId,
      })

      // Setup price with slug
      price = await setupPrice({
        productId: product.id,
        name: 'Test Price',
        type: PriceType.Subscription,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
        trialPeriodDays: 0,
        currency: CurrencyCode.USD,
        slug: 'test-price-slug',
      })

      // Setup customer
      customer = await setupCustomer({
        organizationId: organization.id,
      })
    })

    it('should find price by slug for customer in default pricing model', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          const result = await selectPriceBySlugAndCustomerId(
            {
              slug: 'test-price-slug',
              customerId: customer.id,
            },
            transaction
          )

          expect(result).toMatchObject({ id: price.id })
          expect(result?.id).toBe(price.id)
          expect(result?.slug).toBe('test-price-slug')
          expect(result?.name).toBe('Test Price')
        })
      ).unwrap()
    })

    it('should return null when slug does not exist', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          const result = await selectPriceBySlugAndCustomerId(
            {
              slug: 'non-existent-slug',
              customerId: customer.id,
            },
            transaction
          )

          expect(result).toBeNull()
        })
      ).unwrap()
    })

    it('should return null when price is inactive', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          // Deactivate the price
          await updatePrice(
            {
              id: price.id,
              active: false,
              type: PriceType.Subscription,
            },
            transaction
          )

          const result = await selectPriceBySlugAndCustomerId(
            {
              slug: 'test-price-slug',
              customerId: customer.id,
            },
            transaction
          )

          expect(result).toBeNull()
        })
      ).unwrap()
    })

    it('should find price in customer-specific pricing model when set', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          // Create a new pricing model
          const customPricingModel = await setupPricingModel({
            organizationId: organization.id,
            name: 'Custom Pricing Model',
            isDefault: false,
          })

          // Create a product and price in the custom pricing model
          const customProduct = await setupProduct({
            organizationId: organization.id,
            name: 'Custom Product',
            livemode: true,
            pricingModelId: customPricingModel.id,
          })

          const customPrice = await setupPrice({
            productId: customProduct.id,
            name: 'Custom Price',
            type: PriceType.Subscription,
            unitPrice: 2000,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            livemode: true,
            isDefault: true,
            trialPeriodDays: 0,
            currency: CurrencyCode.USD,
            slug: 'custom-price-slug',
          })

          // Update customer to use custom pricing model
          await updateCustomer(
            {
              id: customer.id,
              pricingModelId: customPricingModel.id,
            },
            transaction
          )

          // Should find price in custom pricing model
          const result = await selectPriceBySlugAndCustomerId(
            {
              slug: 'custom-price-slug',
              customerId: customer.id,
            },
            transaction
          )

          expect(result).toMatchObject({ id: customPrice.id })
          expect(result?.id).toBe(customPrice.id)
          expect(result?.slug).toBe('custom-price-slug')

          // Should not find price from default pricing model
          const defaultResult = await selectPriceBySlugAndCustomerId(
            {
              slug: 'test-price-slug',
              customerId: customer.id,
            },
            transaction
          )

          expect(defaultResult).toBeNull()
        })
      ).unwrap()
    })

    it('should return active price when both active and inactive prices exist with same slug', async () => {
      // NOTE: Database constraints prevent multiple ACTIVE prices with same slug,
      // but allow multiple inactive prices and one active + multiple inactive with same slug
      ;(
        await adminTransaction(async ({ transaction }) => {
          const slug = 'shared-slug'

          // Update and deactivate the original price to use the shared slug
          await updatePrice(
            {
              id: price.id,
              active: false,
              slug,
              type: PriceType.Subscription,
            },
            transaction
          )

          // Create a second product
          const secondProduct = await setupProduct({
            organizationId: organization.id,
            name: 'Second Product',
            livemode: true,
            pricingModelId: pricingModelId,
          })

          // Create an active price with the same slug on the second product
          // This is allowed because the original price is now inactive
          const activePrice = await setupPrice({
            productId: secondProduct.id,
            name: 'Active Price',
            type: PriceType.Subscription,
            unitPrice: 1500,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            livemode: true,
            isDefault: true,
            trialPeriodDays: 0,
            currency: CurrencyCode.USD,
            slug,
          })

          // Should return the active price, not the inactive one
          const result = await selectPriceBySlugAndCustomerId(
            {
              slug,
              customerId: customer.id,
            },
            transaction
          )

          expect(result).toMatchObject({ id: activePrice.id })
          expect(result?.id).toBe(activePrice.id)
          expect(result?.active).toBe(true)
        })
      ).unwrap()
    })
  })

  describe('selectPriceBySlugForDefaultPricingModel', () => {
    let organization: Organization.Record
    let product: Product.Record
    let price: Price.Record
    let pricingModelId: string

    beforeEach(async () => {
      const setup = await setupOrg()
      organization = setup.organization
      pricingModelId = setup.pricingModel.id

      // Setup product
      product = await setupProduct({
        organizationId: organization.id,
        name: 'Test Product',
        livemode: true,
        pricingModelId: pricingModelId,
      })

      // Setup price with slug
      price = await setupPrice({
        productId: product.id,
        name: 'Test Price',
        type: PriceType.Subscription,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
        trialPeriodDays: 0,
        currency: CurrencyCode.USD,
        slug: 'test-price-slug',
      })
    })

    it('should find price by slug for organization in default pricing model', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          const result =
            await selectPriceBySlugForDefaultPricingModel(
              {
                slug: 'test-price-slug',
                organizationId: organization.id,
                livemode: true,
              },
              transaction
            )

          expect(result).toMatchObject({ id: price.id })
          expect(result?.id).toBe(price.id)
          expect(result?.slug).toBe('test-price-slug')
          expect(result?.name).toBe('Test Price')
        })
      ).unwrap()
    })

    it('should return null when slug does not exist', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          const result =
            await selectPriceBySlugForDefaultPricingModel(
              {
                slug: 'non-existent-slug',
                organizationId: organization.id,
                livemode: true,
              },
              transaction
            )

          expect(result).toBeNull()
        })
      ).unwrap()
    })

    it('should return null when price is inactive', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          // Deactivate the price
          await updatePrice(
            {
              id: price.id,
              active: false,
              type: PriceType.Subscription,
            },
            transaction
          )

          const result =
            await selectPriceBySlugForDefaultPricingModel(
              {
                slug: 'test-price-slug',
                organizationId: organization.id,
                livemode: true,
              },
              transaction
            )

          expect(result).toBeNull()
        })
      ).unwrap()
    })

    it('should respect livemode parameter', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          // Should find livemode price when livemode is true
          const livemodeResult =
            await selectPriceBySlugForDefaultPricingModel(
              {
                slug: 'test-price-slug',
                organizationId: organization.id,
                livemode: true,
              },
              transaction
            )

          expect(livemodeResult).toMatchObject({ id: price.id })
          expect(livemodeResult?.id).toBe(price.id)

          // Should return null when searching in test mode (livemode: false)
          // because there's no default test mode pricing model with this price
          const testModeResult =
            await selectPriceBySlugForDefaultPricingModel(
              {
                slug: 'test-price-slug',
                organizationId: organization.id,
                livemode: false,
              },
              transaction
            )

          // The price exists but is in livemode, so searching with livemode: false should return null
          expect(testModeResult).toBeNull()
        })
      ).unwrap()
    })

    it('should throw error when no default pricing model exists', async () => {
      await expect(
        adminTransaction(async ({ transaction }) => {
          // Create a new organization without a default pricing model
          const nonDefaultPricingModel = await setupPricingModel({
            organizationId: organization.id,
            name: 'Non-Default Pricing Model',
            isDefault: false,
          })

          // Create a product in the non-default pricing model
          const nonDefaultProduct = await setupProduct({
            organizationId: organization.id,
            name: 'Non-Default Product',
            livemode: true,
            pricingModelId: nonDefaultPricingModel.id,
          })

          const nonDefaultPrice = await setupPrice({
            productId: nonDefaultProduct.id,
            name: 'Non-Default Price',
            type: PriceType.Subscription,
            unitPrice: 3000,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            livemode: true,
            isDefault: true,
            trialPeriodDays: 0,
            currency: CurrencyCode.USD,
            slug: 'non-default-price-slug',
          })

          // Update the default pricing model to be non-default
          // This simulates a state where there's no default pricing model
          await updatePricingModel(
            {
              id: pricingModelId,
              isDefault: false,
            },
            transaction
          )

          // This should throw an error because there's no default pricing model
          await selectPriceBySlugForDefaultPricingModel(
            {
              slug: 'non-default-price-slug',
              organizationId: organization.id,
              livemode: true,
            },
            transaction
          )
        })
      ).rejects.toThrow(
        /No default pricing model found for organization/
      )
    })

    it('should return active price when both active and inactive prices exist with same slug', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          const slug = 'shared-slug'

          // Update and deactivate the original price to use the shared slug
          await updatePrice(
            {
              id: price.id,
              active: false,
              slug,
              type: PriceType.Subscription,
            },
            transaction
          )

          // Create a second product
          const secondProduct = await setupProduct({
            organizationId: organization.id,
            name: 'Second Product',
            livemode: true,
            pricingModelId: pricingModelId,
          })

          // Create an active price with the same slug on the second product
          // This is allowed because the original price is now inactive
          const activePrice = await setupPrice({
            productId: secondProduct.id,
            name: 'Active Price',
            type: PriceType.Subscription,
            unitPrice: 1500,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            livemode: true,
            isDefault: true,
            trialPeriodDays: 0,
            currency: CurrencyCode.USD,
            slug,
          })

          // Should return the active price, not the inactive one
          const result =
            await selectPriceBySlugForDefaultPricingModel(
              {
                slug,
                organizationId: organization.id,
                livemode: true,
              },
              transaction
            )

          expect(result).toMatchObject({ id: activePrice.id })
          expect(result?.id).toBe(activePrice.id)
          expect(result?.active).toBe(true)
        })
      ).unwrap()
    })
  })

  describe('pricingModelIdsForPrices', () => {
    let price1: Price.Record
    let price2: Price.Record

    beforeEach(async () => {
      // Setup additional prices for batch testing
      price1 = await setupPrice({
        productId: product.id,
        name: 'Test Price 1',
        type: PriceType.Subscription,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        trialPeriodDays: 0,
        currency: CurrencyCode.USD,
      })

      price2 = await setupPrice({
        productId: product.id,
        name: 'Test Price 2',
        type: PriceType.Subscription,
        unitPrice: 2000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        trialPeriodDays: 0,
        currency: CurrencyCode.USD,
      })
    })

    it('should successfully return map of pricingModelIds for multiple prices', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          const pricingModelIdMap = await pricingModelIdsForPrices(
            [price1.id, price2.id],
            transaction
          )

          expect(pricingModelIdMap.size).toBe(2)
          expect(pricingModelIdMap.get(price1.id)).toBe(
            product.pricingModelId
          )
          expect(pricingModelIdMap.get(price2.id)).toBe(
            product.pricingModelId
          )
        })
      ).unwrap()
    })

    it('should return empty map when no price IDs are provided', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          const pricingModelIdMap = await pricingModelIdsForPrices(
            [],
            transaction
          )

          expect(pricingModelIdMap.size).toBe(0)
        })
      ).unwrap()
    })

    it('should only return entries for existing prices', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          const nonExistentPriceId = `price_${core.nanoid()}`
          const pricingModelIdMap = await pricingModelIdsForPrices(
            [price1.id, nonExistentPriceId],
            transaction
          )

          expect(pricingModelIdMap.size).toBe(1)
          expect(pricingModelIdMap.get(price1.id)).toBe(
            product.pricingModelId
          )
          expect(pricingModelIdMap.has(nonExistentPriceId)).toBe(
            false
          )
        })
      ).unwrap()
    })
  })

  describe('insertPrice', () => {
    it('should insert price and derive pricingModelId from product for product-backed prices', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          const newPrice = await insertPrice(
            {
              ...nulledPriceColumns,
              productId: product.id,
              name: 'Test Price',
              type: PriceType.SinglePayment,
              unitPrice: 5000,
              livemode: true,
              currency: CurrencyCode.USD,
              slug: `test-price-${core.nanoid()}`,
              isDefault: false,
            },
            transaction
          )

          expect(newPrice.pricingModelId).toBe(product.pricingModelId)
        })
      ).unwrap()
    })

    it('should derive pricingModelId from usage meter for usage prices', async () => {
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Test Usage Meter',
        livemode: true,
        pricingModelId: product.pricingModelId,
      })

      ;(
        await adminTransaction(async ({ transaction }) => {
          const newPrice = await insertPrice(
            {
              ...nulledPriceColumns,
              productId: null,
              usageMeterId: usageMeter.id,
              name: 'Usage Price',
              type: PriceType.Usage,
              unitPrice: 100,
              livemode: true,
              currency: CurrencyCode.USD,
              slug: `usage-price-${core.nanoid()}`,
              isDefault: false,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              usageEventsPerUnit: 1,
            },
            transaction
          )

          expect(newPrice.pricingModelId).toBe(
            usageMeter.pricingModelId
          )
        })
      ).unwrap()
    })

    it('should set productId to null for usage prices', async () => {
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Test Usage Meter For Null Product',
        livemode: true,
        pricingModelId: product.pricingModelId,
      })

      ;(
        await adminTransaction(async ({ transaction }) => {
          const newPrice = await insertPrice(
            {
              ...nulledPriceColumns,
              productId: null,
              usageMeterId: usageMeter.id,
              name: 'Usage Price Null Product',
              type: PriceType.Usage,
              unitPrice: 200,
              livemode: true,
              currency: CurrencyCode.USD,
              slug: `usage-price-null-${core.nanoid()}`,
              isDefault: false,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              usageEventsPerUnit: 1,
            },
            transaction
          )

          expect(newPrice.productId).toBeNull()
          expect(newPrice.usageMeterId).toBe(usageMeter.id)
          expect(newPrice.type).toBe(PriceType.Usage)
        })
      ).unwrap()
    })

    it('should use provided pricingModelId without derivation', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          const newPrice = await insertPrice(
            {
              ...nulledPriceColumns,
              productId: product.id,
              name: 'Test Price with PM ID',
              type: PriceType.SinglePayment,
              unitPrice: 5000,
              livemode: true,
              currency: CurrencyCode.USD,
              slug: `test-price-pm-${core.nanoid()}`,
              isDefault: false,
              pricingModelId: product.pricingModelId, // Pre-provided
            },
            transaction
          )

          expect(newPrice.pricingModelId).toBe(product.pricingModelId)
        })
      ).unwrap()
    })
  })

  describe('dangerouslyInsertPrice', () => {
    it('should use provided pricingModelId without derivation', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          const newPrice = await dangerouslyInsertPrice(
            {
              ...nulledPriceColumns,
              productId: product.id,
              name: 'Test Dangerous Price',
              type: PriceType.SinglePayment,
              unitPrice: 7500,
              livemode: true,
              currency: CurrencyCode.USD,
              slug: `test-dangerous-${core.nanoid()}`,
              isDefault: false,
              active: true,
              pricingModelId: product.pricingModelId, // Pre-provided
            },
            transaction
          )

          expect(newPrice.pricingModelId).toBe(product.pricingModelId)
        })
      ).unwrap()
    })
  })

  describe('bulkInsertPrices', () => {
    let product2: Product.Record

    beforeEach(async () => {
      product2 = await setupProduct({
        organizationId: organization.id,
        name: 'Test Product 2',
        livemode: true,
        pricingModelId: product.pricingModelId,
      })
    })

    it('should bulk insert prices and derive pricingModelId for each', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          const prices = await bulkInsertPrices(
            [
              {
                ...nulledPriceColumns,
                productId: product.id,
                name: 'Bulk Price 1',
                type: PriceType.SinglePayment,
                unitPrice: 3000,
                livemode: true,
                currency: CurrencyCode.USD,
                slug: `bulk-1-${core.nanoid()}`,
                isDefault: false,
              },
              {
                ...nulledPriceColumns,
                productId: product2.id,
                name: 'Bulk Price 2',
                type: PriceType.SinglePayment,
                unitPrice: 4000,
                livemode: true,
                currency: CurrencyCode.USD,
                slug: `bulk-2-${core.nanoid()}`,
                isDefault: false,
              },
            ],
            transaction
          )

          expect(prices).toHaveLength(2)
          expect(prices[0]!.pricingModelId).toBe(
            product.pricingModelId
          )
          expect(prices[1]!.pricingModelId).toBe(
            product2.pricingModelId
          )
        })
      ).unwrap()
    })

    it('should honor pre-provided pricingModelId in bulk insert', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          const prices = await bulkInsertPrices(
            [
              {
                ...nulledPriceColumns,
                productId: product.id,
                name: 'Bulk Price with PM 1',
                type: PriceType.SinglePayment,
                unitPrice: 3000,
                livemode: true,
                currency: CurrencyCode.USD,
                slug: `bulk-pm-1-${core.nanoid()}`,
                isDefault: false,
                pricingModelId: product.pricingModelId, // Pre-provided
              },
              {
                ...nulledPriceColumns,
                productId: product2.id,
                name: 'Bulk Price without PM 2',
                type: PriceType.SinglePayment,
                unitPrice: 4000,
                livemode: true,
                currency: CurrencyCode.USD,
                slug: `bulk-pm-2-${core.nanoid()}`,
                isDefault: false,
                // No pricingModelId - should derive
              },
            ],
            transaction
          )

          expect(prices).toHaveLength(2)
          expect(prices[0]!.pricingModelId).toBe(
            product.pricingModelId
          )
          expect(prices[1]!.pricingModelId).toBe(
            product2.pricingModelId
          )
        })
      ).unwrap()
    })

    it('should bulk insert subscription prices with pricingModelId from product and usage prices with pricingModelId from usage meter', async () => {
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Bulk Test Usage Meter',
        livemode: true,
        pricingModelId: product.pricingModelId,
      })

      ;(
        await adminTransaction(async ({ transaction }) => {
          const prices = await bulkInsertPrices(
            [
              {
                ...nulledPriceColumns,
                productId: product.id,
                name: 'Subscription Price',
                type: PriceType.Subscription,
                unitPrice: 2000,
                livemode: true,
                currency: CurrencyCode.USD,
                slug: `bulk-sub-${core.nanoid()}`,
                isDefault: false,
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
              },
              {
                ...nulledPriceColumns,
                productId: null,
                usageMeterId: usageMeter.id,
                name: 'Usage Price',
                type: PriceType.Usage,
                unitPrice: 100,
                livemode: true,
                currency: CurrencyCode.USD,
                slug: `bulk-usage-${core.nanoid()}`,
                isDefault: false,
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                usageEventsPerUnit: 1,
              },
            ],
            transaction
          )

          expect(prices).toHaveLength(2)

          const subscriptionPrice = prices.find(
            (p) => p.type === PriceType.Subscription
          )
          const usagePrice = prices.find(
            (p) => p.type === PriceType.Usage
          )

          expect(subscriptionPrice!.productId).toBe(product.id)
          expect(subscriptionPrice!.pricingModelId).toBe(
            product.pricingModelId
          )

          expect(usagePrice!.productId).toBeNull()
          expect(usagePrice!.usageMeterId).toBe(usageMeter.id)
          expect(usagePrice!.pricingModelId).toBe(
            usageMeter.pricingModelId
          )
        })
      ).unwrap()
    })
  })

  describe('selectPricesAndProductsForOrganization', () => {
    it('should not return usage prices (they are filtered out by innerJoin due to null productId)', async () => {
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Select Test Usage Meter',
        livemode: true,
        pricingModelId: product.pricingModelId,
      })

      const usagePrice = await setupPrice({
        name: 'Usage Price For Select',
        type: PriceType.Usage,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        unitPrice: 50,
        currency: CurrencyCode.USD,
        livemode: true,
        usageMeterId: usageMeter.id,
        isDefault: false,
      })

      ;(
        await adminTransaction(async ({ transaction }) => {
          // Query specifically for the usage price by ID
          const results =
            await selectPricesAndProductsForOrganization(
              { id: usagePrice.id },
              organization.id,
              transaction
            )

          // Usage prices have null productId, so innerJoin filters them out
          // This is the expected behavior - this function only returns product-attached prices
          expect(results).toHaveLength(0)
        })
      ).unwrap()
    })

    it('should return product for subscription prices', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          const results =
            await selectPricesAndProductsForOrganization(
              { id: price.id },
              organization.id,
              transaction
            )

          expect(results).toHaveLength(1)
          expect(results[0]!.price.id).toBe(price.id)
          expect(results[0]!.price.type).toBe(PriceType.Subscription)
          expect(results[0]!.product?.id).toBe(product.id)
        })
      ).unwrap()
    })

    it('should return only product-attached prices and exclude usage prices (which have null productId)', async () => {
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Mixed Select Test Meter',
        livemode: true,
        pricingModelId: product.pricingModelId,
      })

      // Create a usage price that should NOT be returned (has null productId)
      await setupPrice({
        name: 'Mixed Usage Price',
        type: PriceType.Usage,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        unitPrice: 75,
        currency: CurrencyCode.USD,
        livemode: true,
        usageMeterId: usageMeter.id,
        isDefault: false,
      })

      ;(
        await adminTransaction(async ({ transaction }) => {
          const results =
            await selectPricesAndProductsForOrganization(
              {},
              organization.id,
              transaction
            )

          // innerJoin on products filters out usage prices (which have null productId)
          const subscriptionResults = results.filter(
            (r) => r.price.type === PriceType.Subscription
          )
          const usageResults = results.filter(
            (r) => r.price.type === PriceType.Usage
          )

          // Should have subscription prices from beforeEach
          expect(subscriptionResults.length).toBeGreaterThan(0)
          // Usage prices should be excluded due to innerJoin (they have null productId)
          expect(usageResults.length).toBe(0)

          // All returned prices should have non-null products
          results.forEach((result) => {
            expect(typeof result.product?.id).toBe('string')
          })
        })
      ).unwrap()
    })
  })

  describe('Deriving pricingModelId from usage meter', () => {
    let organization: Organization.Record
    let pricingModel: PricingModel.Record
    let usageMeter: UsageMeter.Record

    beforeEach(async () => {
      const setup = await setupOrg()
      organization = setup.organization
      pricingModel = setup.pricingModel

      usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Test Usage Meter for Price Tests',
        livemode: true,
        pricingModelId: pricingModel.id,
      })
    })

    describe('insertPrice', () => {
      it('derives pricingModelId from usageMeterId when inserting a usage price without pricingModelId', async () => {
        ;(
          await adminTransaction(async ({ transaction }) => {
            const newPrice = await insertPrice(
              {
                ...usagePriceDefaultColumns,
                usageMeterId: usageMeter.id,
                name: 'Usage Price via Meter',
                unitPrice: 100,
                livemode: true,
                currency: CurrencyCode.USD,
                slug: `usage-price-${core.nanoid()}`,
                isDefault: false,
              },
              transaction
            )

            expect(newPrice.pricingModelId).toBe(
              usageMeter.pricingModelId
            )
            expect(newPrice.pricingModelId).toBe(pricingModel.id)
            expect(newPrice.type).toBe(PriceType.Usage)
            expect(newPrice.usageMeterId).toBe(usageMeter.id)
            expect(newPrice.productId).toBeNull()
          })
        ).unwrap()
      })

      it('uses provided pricingModelId instead of deriving from usageMeterId when both are provided', async () => {
        ;(
          await adminTransaction(async ({ transaction }) => {
            const newPrice = await insertPrice(
              {
                ...usagePriceDefaultColumns,
                usageMeterId: usageMeter.id,
                name: 'Usage Price with PM ID',
                unitPrice: 200,
                livemode: true,
                currency: CurrencyCode.USD,
                slug: `usage-price-pm-${core.nanoid()}`,
                isDefault: false,
                pricingModelId: pricingModel.id, // Explicitly provided
              },
              transaction
            )

            expect(newPrice.pricingModelId).toBe(pricingModel.id)
            expect(newPrice.usageMeterId).toBe(usageMeter.id)
          })
        ).unwrap()
      })
    })

    describe('dangerouslyInsertPrice', () => {
      it('derives pricingModelId from usageMeterId when inserting a usage price without pricingModelId', async () => {
        ;(
          await adminTransaction(async ({ transaction }) => {
            const newPrice = await dangerouslyInsertPrice(
              {
                ...usagePriceDefaultColumns,
                usageMeterId: usageMeter.id,
                name: 'Dangerous Usage Price',
                unitPrice: 150,
                livemode: true,
                currency: CurrencyCode.USD,
                slug: `dangerous-usage-${core.nanoid()}`,
                isDefault: false,
                active: true,
              },
              transaction
            )

            expect(newPrice.pricingModelId).toBe(
              usageMeter.pricingModelId
            )
            expect(newPrice.pricingModelId).toBe(pricingModel.id)
            expect(newPrice.type).toBe(PriceType.Usage)
            expect(newPrice.usageMeterId).toBe(usageMeter.id)
          })
        ).unwrap()
      })
    })

    describe('bulkInsertPrices', () => {
      it('derives pricingModelId from usageMeterId for usage prices in bulk insert', async () => {
        const secondUsageMeter = await setupUsageMeter({
          organizationId: organization.id,
          name: 'Second Usage Meter',
          livemode: true,
          pricingModelId: pricingModel.id,
        })

        ;(
          await adminTransaction(async ({ transaction }) => {
            const prices = await bulkInsertPrices(
              [
                {
                  ...usagePriceDefaultColumns,
                  usageMeterId: usageMeter.id,
                  name: 'Bulk Usage Price 1',
                  unitPrice: 100,
                  livemode: true,
                  currency: CurrencyCode.USD,
                  slug: `bulk-usage-1-${core.nanoid()}`,
                  isDefault: false,
                },
                {
                  ...usagePriceDefaultColumns,
                  usageMeterId: secondUsageMeter.id,
                  name: 'Bulk Usage Price 2',
                  unitPrice: 200,
                  livemode: true,
                  currency: CurrencyCode.USD,
                  slug: `bulk-usage-2-${core.nanoid()}`,
                  isDefault: false,
                },
              ],
              transaction
            )

            expect(prices).toHaveLength(2)
            expect(prices[0]!.pricingModelId).toBe(
              usageMeter.pricingModelId
            )
            expect(prices[0]!.pricingModelId).toBe(pricingModel.id)
            expect(prices[0]!.usageMeterId).toBe(usageMeter.id)
            expect(prices[1]!.pricingModelId).toBe(
              secondUsageMeter.pricingModelId
            )
            expect(prices[1]!.pricingModelId).toBe(pricingModel.id)
            expect(prices[1]!.usageMeterId).toBe(secondUsageMeter.id)
          })
        ).unwrap()
      })

      it('bulk insert derives pricingModelId from product for product prices and from usage meter for usage prices', async () => {
        const testProduct = await setupProduct({
          organizationId: organization.id,
          name: 'Test Product for Mixed Insert',
          livemode: true,
          pricingModelId: pricingModel.id,
        })

        ;(
          await adminTransaction(async ({ transaction }) => {
            const prices = await bulkInsertPrices(
              [
                {
                  ...nulledPriceColumns,
                  productId: testProduct.id,
                  name: 'Subscription Price',
                  type: PriceType.Subscription,
                  unitPrice: 1000,
                  intervalUnit: IntervalUnit.Month,
                  intervalCount: 1,
                  livemode: true,
                  currency: CurrencyCode.USD,
                  slug: `sub-price-${core.nanoid()}`,
                  isDefault: false,
                  trialPeriodDays: 0,
                },
                {
                  ...usagePriceDefaultColumns,
                  usageMeterId: usageMeter.id,
                  name: 'Usage Price in Mixed Insert',
                  unitPrice: 50,
                  livemode: true,
                  currency: CurrencyCode.USD,
                  slug: `usage-mixed-${core.nanoid()}`,
                  isDefault: false,
                },
              ],
              transaction
            )

            expect(prices).toHaveLength(2)
            // Subscription price derived from product
            expect(prices[0]!.pricingModelId).toBe(
              testProduct.pricingModelId
            )
            expect(prices[0]!.productId).toBe(testProduct.id)
            expect(prices[0]!.type).toBe(PriceType.Subscription)
            // Usage price derived from usage meter
            expect(prices[1]!.pricingModelId).toBe(
              usageMeter.pricingModelId
            )
            expect(prices[1]!.usageMeterId).toBe(usageMeter.id)
            expect(prices[1]!.type).toBe(PriceType.Usage)
            expect(prices[1]!.productId).toBeNull()
          })
        ).unwrap()
      })
    })
  })

  describe('selectResourceFeaturesForPrice', () => {
    it('returns resource features linked to the price via productFeatures', async () => {
      const setup = await setupOrg()
      const organization = setup.organization

      // Create a resource
      const resource = await setupResource({
        organizationId: organization.id,
        pricingModelId: setup.pricingModel.id,
        name: 'Seats',
        slug: `seats-${core.nanoid()}`,
      })

      // Create a resource feature
      const resourceFeature = await setupResourceFeature({
        organizationId: organization.id,
        name: 'Seat Feature',
        resourceId: resource.id,
        livemode: true,
        amount: 5,
        slug: `seat-feature-${core.nanoid()}`,
      })

      // Create a product
      const product = await setupProduct({
        organizationId: organization.id,
        name: 'Test Product',
        livemode: true,
        pricingModelId: setup.pricingModel.id,
      })

      // Link the feature to the product
      await setupProductFeature({
        productId: product.id,
        featureId: resourceFeature.id,
        organizationId: organization.id,
      })

      // Create a price for the product
      const price = await setupPrice({
        productId: product.id,
        name: 'Test Price',
        type: PriceType.Subscription,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
        trialPeriodDays: 0,
        currency: CurrencyCode.USD,
      })

      ;(
        await adminTransaction(async ({ transaction }) => {
          const features = await selectResourceFeaturesForPrice(
            price.id,
            transaction
          )

          expect(features).toHaveLength(1)
          expect(features[0].id).toBe(resourceFeature.id)
          expect(features[0].resourceId).toBe(resource.id)
          expect(features[0].amount).toBe(5)
          expect(features[0].type).toBe('resource')
        })
      ).unwrap()
    })

    it('returns empty array when price has no resource features', async () => {
      const setup = await setupOrg()

      const product = await setupProduct({
        organizationId: setup.organization.id,
        name: 'Test Product',
        livemode: true,
        pricingModelId: setup.pricingModel.id,
      })

      const price = await setupPrice({
        productId: product.id,
        name: 'Test Price',
        type: PriceType.Subscription,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
        trialPeriodDays: 0,
        currency: CurrencyCode.USD,
      })

      ;(
        await adminTransaction(async ({ transaction }) => {
          const features = await selectResourceFeaturesForPrice(
            price.id,
            transaction
          )

          expect(features).toHaveLength(0)
        })
      ).unwrap()
    })

    it('excludes expired productFeatures', async () => {
      const setup = await setupOrg()
      const organization = setup.organization

      const resource = await setupResource({
        organizationId: organization.id,
        pricingModelId: setup.pricingModel.id,
        name: 'Seats',
        slug: `seats-${core.nanoid()}`,
      })

      const resourceFeature = await setupResourceFeature({
        organizationId: organization.id,
        name: 'Seat Feature',
        resourceId: resource.id,
        livemode: true,
        amount: 5,
        slug: `seat-feature-${core.nanoid()}`,
      })

      const product = await setupProduct({
        organizationId: organization.id,
        name: 'Test Product',
        livemode: true,
        pricingModelId: setup.pricingModel.id,
      })

      // Link the feature to the product with an expired timestamp
      await setupProductFeature({
        productId: product.id,
        featureId: resourceFeature.id,
        organizationId: organization.id,
        expiredAt: Date.now() - 10000, // Expired 10 seconds ago
      })

      const price = await setupPrice({
        productId: product.id,
        name: 'Test Price',
        type: PriceType.Subscription,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
        trialPeriodDays: 0,
        currency: CurrencyCode.USD,
      })

      ;(
        await adminTransaction(async ({ transaction }) => {
          const features = await selectResourceFeaturesForPrice(
            price.id,
            transaction
          )

          expect(features).toHaveLength(0)
        })
      ).unwrap()
    })

    it('returns multiple resource features when product has multiple linked', async () => {
      const setup = await setupOrg()
      const organization = setup.organization

      // Create two resources
      const resource1 = await setupResource({
        organizationId: organization.id,
        pricingModelId: setup.pricingModel.id,
        name: 'Seats',
        slug: `seats-${core.nanoid()}`,
      })

      const resource2 = await setupResource({
        organizationId: organization.id,
        pricingModelId: setup.pricingModel.id,
        name: 'API Keys',
        slug: `api-keys-${core.nanoid()}`,
      })

      // Create two resource features
      const resourceFeature1 = await setupResourceFeature({
        organizationId: organization.id,
        name: 'Seat Feature',
        resourceId: resource1.id,
        livemode: true,
        amount: 5,
        slug: `seat-feature-${core.nanoid()}`,
      })

      const resourceFeature2 = await setupResourceFeature({
        organizationId: organization.id,
        name: 'API Key Feature',
        resourceId: resource2.id,
        livemode: true,
        amount: 10,
        slug: `api-key-feature-${core.nanoid()}`,
      })

      const product = await setupProduct({
        organizationId: organization.id,
        name: 'Test Product',
        livemode: true,
        pricingModelId: setup.pricingModel.id,
      })

      // Link both features to the product
      await setupProductFeature({
        productId: product.id,
        featureId: resourceFeature1.id,
        organizationId: organization.id,
      })

      await setupProductFeature({
        productId: product.id,
        featureId: resourceFeature2.id,
        organizationId: organization.id,
      })

      const price = await setupPrice({
        productId: product.id,
        name: 'Test Price',
        type: PriceType.Subscription,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
        trialPeriodDays: 0,
        currency: CurrencyCode.USD,
      })

      ;(
        await adminTransaction(async ({ transaction }) => {
          const features = await selectResourceFeaturesForPrice(
            price.id,
            transaction
          )

          expect(features).toHaveLength(2)
          const featureIds = features.map((f) => f.id).sort()
          expect(featureIds).toEqual(
            [resourceFeature1.id, resourceFeature2.id].sort()
          )
        })
      ).unwrap()
    })
  })

  describe('selectResourceFeaturesForPrices', () => {
    it('returns a map of priceId to resource features for multiple prices', async () => {
      const setup = await setupOrg()
      const organization = setup.organization

      // Create a resource
      const resource = await setupResource({
        organizationId: organization.id,
        pricingModelId: setup.pricingModel.id,
        name: 'Seats',
        slug: `seats-${core.nanoid()}`,
      })

      // Create a resource feature
      const resourceFeature = await setupResourceFeature({
        organizationId: organization.id,
        name: 'Seat Feature',
        resourceId: resource.id,
        livemode: true,
        amount: 5,
        slug: `seat-feature-${core.nanoid()}`,
      })

      // Create two products
      const product1 = await setupProduct({
        organizationId: organization.id,
        name: 'Product 1',
        livemode: true,
        pricingModelId: setup.pricingModel.id,
      })

      const product2 = await setupProduct({
        organizationId: organization.id,
        name: 'Product 2',
        livemode: true,
        pricingModelId: setup.pricingModel.id,
      })

      // Link feature to product1 only
      await setupProductFeature({
        productId: product1.id,
        featureId: resourceFeature.id,
        organizationId: organization.id,
      })

      // Create prices for both products
      const price1 = await setupPrice({
        productId: product1.id,
        name: 'Price 1',
        type: PriceType.Subscription,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
        trialPeriodDays: 0,
        currency: CurrencyCode.USD,
      })

      const price2 = await setupPrice({
        productId: product2.id,
        name: 'Price 2',
        type: PriceType.Subscription,
        unitPrice: 2000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
        trialPeriodDays: 0,
        currency: CurrencyCode.USD,
      })

      ;(
        await adminTransaction(async ({ transaction }) => {
          const featureMap = await selectResourceFeaturesForPrices(
            [price1.id, price2.id],
            transaction
          )

          expect(featureMap.size).toBe(2)

          // Price1 should have the resource feature
          const price1Features = featureMap.get(price1.id) ?? []
          expect(price1Features).toHaveLength(1)
          expect(price1Features[0].id).toBe(resourceFeature.id)

          // Price2 should have no resource features
          const price2Features = featureMap.get(price2.id) ?? []
          expect(price2Features).toHaveLength(0)
        })
      ).unwrap()
    })

    it('returns empty map when passed empty array', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          const featureMap = await selectResourceFeaturesForPrices(
            [],
            transaction
          )

          expect(featureMap.size).toBe(0)
        })
      ).unwrap()
    })

    it('returns identical resource features for multiple prices of the same product', async () => {
      const setup = await setupOrg()
      const organization = setup.organization

      const resource = await setupResource({
        organizationId: organization.id,
        pricingModelId: setup.pricingModel.id,
        name: 'Seats',
        slug: `seats-${core.nanoid()}`,
      })

      const resourceFeature = await setupResourceFeature({
        organizationId: organization.id,
        name: 'Seat Feature',
        resourceId: resource.id,
        livemode: true,
        amount: 5,
        slug: `seat-feature-${core.nanoid()}`,
      })

      const product = await setupProduct({
        organizationId: organization.id,
        name: 'Product',
        livemode: true,
        pricingModelId: setup.pricingModel.id,
      })

      await setupProductFeature({
        productId: product.id,
        featureId: resourceFeature.id,
        organizationId: organization.id,
      })

      // Create two prices for the same product
      const price1 = await setupPrice({
        productId: product.id,
        name: 'Monthly Price',
        type: PriceType.Subscription,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        trialPeriodDays: 0,
        currency: CurrencyCode.USD,
      })

      const price2 = await setupPrice({
        productId: product.id,
        name: 'Annual Price',
        type: PriceType.Subscription,
        unitPrice: 10000,
        intervalUnit: IntervalUnit.Year,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        trialPeriodDays: 0,
        currency: CurrencyCode.USD,
      })

      ;(
        await adminTransaction(async ({ transaction }) => {
          const featureMap = await selectResourceFeaturesForPrices(
            [price1.id, price2.id],
            transaction
          )

          expect(featureMap.size).toBe(2)

          // Both prices should have the same resource features
          const price1Features = featureMap.get(price1.id) ?? []
          const price2Features = featureMap.get(price2.id) ?? []

          expect(price1Features).toHaveLength(1)
          expect(price2Features).toHaveLength(1)
          expect(price1Features[0].id).toBe(resourceFeature.id)
          expect(price2Features[0].id).toBe(resourceFeature.id)
        })
      ).unwrap()
    })

    it('returns empty arrays for prices that do not exist', async () => {
      const setup = await setupOrg()

      const product = await setupProduct({
        organizationId: setup.organization.id,
        name: 'Product',
        livemode: true,
        pricingModelId: setup.pricingModel.id,
      })

      const price = await setupPrice({
        productId: product.id,
        name: 'Price',
        type: PriceType.Subscription,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
        trialPeriodDays: 0,
        currency: CurrencyCode.USD,
      })

      const nonExistentPriceId = `price_${core.nanoid()}`

      ;(
        await adminTransaction(async ({ transaction }) => {
          const featureMap = await selectResourceFeaturesForPrices(
            [price.id, nonExistentPriceId],
            transaction
          )

          expect(featureMap.size).toBe(2)
          expect(featureMap.get(price.id)).toHaveLength(0)
          expect(featureMap.get(nonExistentPriceId)).toHaveLength(0)
        })
      ).unwrap()
    })
  })

  describe('derivePricingModelIdForPrice', () => {
    it('derives pricingModelId from productId when productId is provided', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          const priceInsert = {
            ...nulledPriceColumns,
            productId: product.id,
            name: 'Test Derive Price',
            type: PriceType.Subscription,
            unitPrice: 1000,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            livemode: true,
            currency: CurrencyCode.USD,
            slug: `derive-test-${core.nanoid()}`,
            isDefault: false,
          } as Price.Insert

          const derivedPricingModelId =
            await derivePricingModelIdForPrice(
              priceInsert,
              transaction
            )

          expect(derivedPricingModelId).toBe(product.pricingModelId)
        })
      ).unwrap()
    })

    it('derives pricingModelId from usageMeterId when usageMeterId is provided', async () => {
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Test Usage Meter for Derive',
        livemode: true,
        pricingModelId: product.pricingModelId,
      })

      ;(
        await adminTransaction(async ({ transaction }) => {
          const priceInsert = {
            ...usagePriceDefaultColumns,
            usageMeterId: usageMeter.id,
            name: 'Test Derive Usage Price',
            type: PriceType.Usage,
            unitPrice: 100,
            livemode: true,
            currency: CurrencyCode.USD,
            slug: `derive-usage-test-${core.nanoid()}`,
            isDefault: false,
          } as Price.Insert

          const derivedPricingModelId =
            await derivePricingModelIdForPrice(
              priceInsert,
              transaction
            )

          expect(derivedPricingModelId).toBe(
            usageMeter.pricingModelId
          )
        })
      ).unwrap()
    })

    it('uses the provided pricingModelId when already set', async () => {
      const explicitPricingModelId = product.pricingModelId

      ;(
        await adminTransaction(async ({ transaction }) => {
          const priceInsert = {
            ...nulledPriceColumns,
            productId: product.id,
            pricingModelId: explicitPricingModelId,
            name: 'Test Explicit PricingModelId',
            type: PriceType.Subscription,
            unitPrice: 1000,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            livemode: true,
            currency: CurrencyCode.USD,
            slug: `explicit-pm-test-${core.nanoid()}`,
            isDefault: false,
          } as Price.Insert

          const derivedPricingModelId =
            await derivePricingModelIdForPrice(
              priceInsert,
              transaction
            )

          expect(derivedPricingModelId).toBe(explicitPricingModelId)
        })
      ).unwrap()
    })

    it('throws an error when neither productId nor usageMeterId is provided and pricingModelId is not set', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          const priceInsert = {
            ...nulledPriceColumns,
            productId: null,
            usageMeterId: null,
            name: 'Test No ID Price',
            type: PriceType.Subscription,
            unitPrice: 1000,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            livemode: true,
            currency: CurrencyCode.USD,
            slug: `no-id-test-${core.nanoid()}`,
            isDefault: false,
          } as unknown as Price.Insert

          await expect(
            derivePricingModelIdForPrice(priceInsert, transaction)
          ).rejects.toThrow(
            /Pricing model id must be provided or derivable from productId or usageMeterId/
          )
        })
      ).unwrap()
    })
  })
})
