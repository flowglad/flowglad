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
      catalogId: setup.catalog.id,
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
      setupFeeAmount: 0,
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
            isDefault: false,
            setupFeeAmount: 0,
            trialPeriodDays: 0,
            currency: CurrencyCode.USD,
            externalId: null,
            active: true,
          },
          transaction
        )

        expect(newPrice.name).toBe('New Price')
        expect(newPrice.unitPrice).toBe(2000)
        expect(newPrice.isDefault).toBe(false)
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
          setupFeeAmount: 0,
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
            isDefault: true,
            setupFeeAmount: 0,
            trialPeriodDays: 0,
            currency: CurrencyCode.USD,
            externalId: null,
            active: true,
          },
          transaction
        )

        // Verify the new price is default
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
          setupFeeAmount: 0,
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

    it('does not change other prices when updating a non-default price', async () => {
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
          setupFeeAmount: 0,
          trialPeriodDays: 0,
          currency: CurrencyCode.USD,
        })

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

        // Verify the second price is still not default
        expect(updatedSecondPrice.isDefault).toBe(false)
        expect(updatedSecondPrice.name).toBe('Updated Second Price')
        expect(updatedSecondPrice.unitPrice).toBe(2000)

        // Verify the original price is still default
        const updatedOriginalPrice = await selectPriceById(
          price.id,
          transaction
        )
        expect(updatedOriginalPrice.isDefault).toBe(true)
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
          setupFeeAmount: 0,
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
        setupFeeAmount: 0,
        trialPeriodDays: 0,
        currency: CurrencyCode.USD,
        externalId: null,
        active: true,
        overagePriceId: null,
        usageEventsPerUnit: null,
        startsWithCreditTrial: false,
        usageMeterId: null,
      }

      // Expect the entire transaction to fail due to the unique constraint violation
      await expect(
        adminTransaction(async ({ transaction }) => {
          await insertPrice(newPriceInsert, transaction)
        })
      ).rejects.toThrow(
        /duplicate key value violates unique constraint "prices_product_id_is_default_unique_idx"/
      )
    })

    it('throws an error when updating a price to be default when another default price exists', async () => {
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
        setupFeeAmount: 0,
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
      ).rejects.toThrow(
        /duplicate key value violates unique constraint "prices_product_id_is_default_unique_idx"/
      )
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
          setupFeeAmount: 0,
          trialPeriodDays: 0,
          currency: CurrencyCode.USD,
          externalId: null,
          active: true,
          overagePriceId: null,
          usageEventsPerUnit: null,
          startsWithCreditTrial: false,
          usageMeterId: null,
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

    it('allows multiple non-default prices for the same product', async () => {
      await adminTransaction(async ({ transaction }) => {
        // The first default price is created in beforeEach

        // Create a second non-default price
        await setupPrice({
          productId: product.id,
          name: 'Second Price',
          type: PriceType.Subscription,
          unitPrice: 1500,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          livemode: true,
          isDefault: false,
          setupFeeAmount: 0,
          trialPeriodDays: 0,
          currency: CurrencyCode.USD,
        })

        // Create a third non-default price
        await setupPrice({
          productId: product.id,
          name: 'Third Price',
          type: PriceType.Subscription,
          unitPrice: 2500,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          livemode: true,
          isDefault: false,
          setupFeeAmount: 0,
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
        expect(defaultPrices[0].id).toBe(price.id)
      })
    })

    it('allows multiple default prices for different products', async () => {
      await adminTransaction(async ({ transaction }) => {
        // The first default price for the first product is created in beforeEach

        // Create a second product
        const secondProduct = await setupProduct({
          organizationId: organization.id,
          name: 'Second Test Product',
          catalogId: product.catalogId,
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
          setupFeeAmount: 0,
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
})
