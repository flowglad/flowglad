import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupCustomer,
  setupDiscount,
  setupOrg,
  setupPrice,
  setupProduct,
  setupPurchase,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  CurrencyCode,
  DiscountAmountType,
  DiscountDuration,
  PriceType,
} from '@/types'
import { core } from '@/utils/core'
import type { Customer } from '../schema/customers'
import type { Discount } from '../schema/discounts'
import type { Organization } from '../schema/organizations'
import type { Price } from '../schema/prices'
import type { PricingModel } from '../schema/pricingModels'
import type { Product } from '../schema/products'
import type { Purchase } from '../schema/purchases'
import {
  insertDiscountRedemption,
  upsertDiscountRedemptionByPurchaseId,
} from './discountRedemptionMethods'

describe('Discount Redemption Methods', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let purchase: Purchase.Record
  let discount: Discount.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product

    price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      unitPrice: 1000,
      type: PriceType.SinglePayment,
      livemode: true,
      isDefault: false,
      currency: CurrencyCode.USD,
    })

    customer = await setupCustomer({
      organizationId: organization.id,
      email: 'test@test.com',
      livemode: true,
    })

    purchase = await setupPurchase({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      livemode: true,
    })

    discount = await setupDiscount({
      organizationId: organization.id,
      name: 'Test Discount',
      code: `TESTCODE_${core.nanoid()}`,
      amount: 500,
      amountType: DiscountAmountType.Fixed,
      livemode: true,
    })
  })

  describe('insertDiscountRedemption', () => {
    it('should successfully insert discount redemption and derive pricingModelId from purchase', async () => {
      await adminTransaction(async ({ transaction }) => {
        const discountRedemption = await insertDiscountRedemption(
          {
            discountId: discount.id,
            discountName: discount.name,
            discountCode: discount.code,
            discountAmount: discount.amount,
            discountAmountType: discount.amountType,
            purchaseId: purchase.id,
            duration: DiscountDuration.Once,
            numberOfPayments: null,
            livemode: true,
          },
          transaction
        )

        // Verify pricingModelId is correctly derived from purchase
        expect(discountRedemption.pricingModelId).toBe(
          purchase.pricingModelId
        )
        expect(discountRedemption.pricingModelId).toBe(
          pricingModel.id
        )
        expect(discountRedemption.purchaseId).toBe(purchase.id)
      })
    })

    it('should throw an error when purchaseId does not exist', async () => {
      await adminTransaction(async ({ transaction }) => {
        const nonExistentPurchaseId = `purch_${core.nanoid()}`

        await expect(
          insertDiscountRedemption(
            {
              discountId: discount.id,
              discountName: discount.name,
              discountCode: discount.code,
              discountAmount: discount.amount,
              discountAmountType: discount.amountType,
              purchaseId: nonExistentPurchaseId,
              duration: DiscountDuration.Once,
              numberOfPayments: null,
              livemode: true,
            },
            transaction
          )
        ).rejects.toThrow()
      })
    })

    it('should use provided pricingModelId without derivation', async () => {
      await adminTransaction(async ({ transaction }) => {
        const discountRedemption = await insertDiscountRedemption(
          {
            discountId: discount.id,
            discountName: discount.name,
            discountCode: discount.code,
            discountAmount: discount.amount,
            discountAmountType: discount.amountType,
            purchaseId: purchase.id,
            duration: DiscountDuration.Once,
            numberOfPayments: null,
            livemode: true,
            pricingModelId: pricingModel.id, // explicitly provided
          },
          transaction
        )

        // Verify the provided pricingModelId is used
        expect(discountRedemption.pricingModelId).toBe(
          pricingModel.id
        )
      })
    })
  })

  describe('upsertDiscountRedemptionByPurchaseId', () => {
    it('should successfully upsert discount redemption and derive pricingModelId from purchase', async () => {
      await adminTransaction(async ({ transaction }) => {
        const result = await upsertDiscountRedemptionByPurchaseId(
          {
            discountId: discount.id,
            discountName: discount.name,
            discountCode: discount.code,
            discountAmount: discount.amount,
            discountAmountType: discount.amountType,
            purchaseId: purchase.id,
            duration: DiscountDuration.Once,
            numberOfPayments: null,
            livemode: true,
          },
          transaction
        )

        expect(result).toHaveLength(1)
        const discountRedemption = result[0]
        expect(discountRedemption.pricingModelId).toBe(
          purchase.pricingModelId
        )
        expect(discountRedemption.pricingModelId).toBe(
          pricingModel.id
        )
      })
    })

    it('should update existing discount redemption on upsert', async () => {
      await adminTransaction(async ({ transaction }) => {
        // First upsert
        const firstResult =
          await upsertDiscountRedemptionByPurchaseId(
            {
              discountId: discount.id,
              discountName: discount.name,
              discountCode: discount.code,
              discountAmount: 500,
              discountAmountType: discount.amountType,
              purchaseId: purchase.id,
              duration: DiscountDuration.Once,
              numberOfPayments: null,
              livemode: true,
            },
            transaction
          )

        expect(firstResult).toHaveLength(1)
        const firstRedemption = firstResult[0]

        // Second upsert with same purchaseId but different amount
        const secondResult =
          await upsertDiscountRedemptionByPurchaseId(
            {
              discountId: discount.id,
              discountName: discount.name,
              discountCode: discount.code,
              discountAmount: 750, // different amount
              discountAmountType: discount.amountType,
              purchaseId: purchase.id,
              duration: DiscountDuration.Once,
              numberOfPayments: null,
              livemode: true,
            },
            transaction
          )

        expect(secondResult).toHaveLength(1)
        const secondRedemption = secondResult[0]
        expect(secondRedemption.id).toBe(firstRedemption.id) // same record
        expect(secondRedemption.discountAmount).toBe(750) // updated amount
        expect(secondRedemption.pricingModelId).toBe(pricingModel.id)
      })
    })

    it('should use provided pricingModelId without derivation', async () => {
      await adminTransaction(async ({ transaction }) => {
        const result = await upsertDiscountRedemptionByPurchaseId(
          {
            discountId: discount.id,
            discountName: discount.name,
            discountCode: discount.code,
            discountAmount: discount.amount,
            discountAmountType: discount.amountType,
            purchaseId: purchase.id,
            duration: DiscountDuration.Once,
            numberOfPayments: null,
            livemode: true,
            pricingModelId: pricingModel.id, // explicitly provided
          },
          transaction
        )

        expect(result).toHaveLength(1)
        expect(result[0].pricingModelId).toBe(pricingModel.id)
      })
    })
  })
})
