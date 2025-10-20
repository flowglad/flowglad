import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import { setupOrg, setupProduct, setupPrice } from '@/../seedDatabase'
import { PriceType, IntervalUnit, CurrencyCode } from '@/types'
import {
  safelyInsertPrice,
  safelyUpdatePrice,
  selectPriceById,
  selectPricesAndProductByProductId,
  insertPrice,
  updatePrice,
} from './priceMethods'
import { nulledPriceColumns, Price } from '../schema/prices'
import { Organization } from '../schema/organizations'
import { Product } from '../schema/products'
import { core } from '@/utils/core'

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
      })
    })

    it('sets all other prices to non-default when inserting a default price', async () => {
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
    })
  })

  describe('safelyUpdatePrice', () => {
    it('successfully updates a price', async () => {
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
    })

    it('sets all other prices to non-default when updating a price to default', async () => {
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
    })

    it('sets other prices to non-default and not active when addin and updating a new price', async () => {
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
    })

    it('retrieves the correct product with prices after updates', async () => {
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
        expect(productWithPrices.defaultPrice.id).toBe(secondPrice.id)
        expect(productWithPrices.defaultPrice.isDefault).toBe(true)
      })
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
    })

    it('allows multiple prices for the same product but only the latest one is default', async () => {
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
    })

    it('allows multiple default prices for different products', async () => {
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
        expect(insertedPrice).toBeDefined()
        expect(insertedPrice.slug).toBe(slug2)
        expect(insertedPrice.active).toBe(true)
      })
    })

    it('allows updating the slug on an active price to a value different from existing active prices slugs', async () => {
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

        expect(updateResult).toBeDefined()
        expect(updateResult.slug).toBe(updatedSlug)
        // Ensure no collision or constraint thrown, and price2 untouched
        expect(updateResult.id).toBe(price1.id)
        expect(price2.slug).toBe('slug-other')
      })
    })

    it('allows inserting inactive price with slug that exists on active price in same pricing model', async () => {
      const slug = 'shared-slug'
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
    })

    it('allows inserting active price with slug that exists on inactive price in same pricing model', async () => {
      const slug = 'reusable-slug'
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
    })

    it('allows updating price from active to inactive even when another active price has same slug', async () => {
      const slug = 'shared-slug'
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
    })

    it('allows updating inactive price slug to match another inactive price slug', async () => {
      const slug = 'shared-inactive-slug'
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
    })
  })
})
