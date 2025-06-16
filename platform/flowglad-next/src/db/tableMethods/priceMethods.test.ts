import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupOrg,
  setupProduct,
  setupPrice,
} from '../../../seedDatabase'
import { PriceType, IntervalUnit, CurrencyCode } from '@/types'
import { nanoid } from '@/utils/core'
import {
  safelyInsertPrice,
  safelyUpdatePrice,
  selectPriceById,
  selectPricesAndProductByProductId,
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
})
