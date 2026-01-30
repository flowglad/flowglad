import { beforeEach, describe, expect, it } from 'bun:test'
import {
  CurrencyCode,
  DiscountAmountType,
  DiscountDuration,
  PriceType,
} from '@db-core/enums'
import type { Customer } from '@db-core/schema/customers'
import type { Discount } from '@db-core/schema/discounts'
import type { Organization } from '@db-core/schema/organizations'
import type { Price } from '@db-core/schema/prices'
import type { PricingModel } from '@db-core/schema/pricingModels'
import type { Product } from '@db-core/schema/products'
import type { Purchase } from '@db-core/schema/purchases'
import {
  setupCustomer,
  setupDiscount,
  setupOrg,
  setupPrice,
  setupProduct,
  setupPurchase,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { core } from '@/utils/core'
import {
  insertDiscountRedemption,
  selectDiscountRedemptions,
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
      pricingModelId: pricingModel.id,
      name: 'Test Discount',
      code: `TEST${core.nanoid().substring(0, 15)}`, // Keep under 20 chars
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

    it('should do nothing on conflict with existing discount redemption', async () => {
      await adminTransaction(async ({ transaction }) => {
        // First upsert (insert)
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
        expect(firstRedemption.discountAmount).toBe(500)

        // Second upsert with same purchaseId - should do nothing (returns empty)
        // Note: createUpsertFunction actually does onConflictDoNothing, not update
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

        // On conflict, it does nothing and returns empty array
        expect(secondResult).toHaveLength(0)

        // Verify the original record is unchanged
        const existingRedemptions = await selectDiscountRedemptions(
          { purchaseId: purchase.id },
          transaction
        )
        expect(existingRedemptions).toHaveLength(1)
        expect(existingRedemptions[0].discountAmount).toBe(500) // unchanged
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
