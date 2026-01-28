import { beforeEach, describe, expect, it } from 'bun:test'
import { Result } from 'better-result'
import {
  setupCustomer,
  setupDiscount,
  setupDiscountRedemption,
  setupOrg,
  setupPurchase,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Organization } from '@/db/schema/organizations'
import type { PricingModel } from '@/db/schema/pricingModels'
import { DiscountAmountType, DiscountDuration } from '@/types'
import {
  enrichDiscountsWithRedemptionCounts,
  insertDiscount,
  selectDiscountById,
  selectDiscounts,
} from './discountMethods'

describe('insertDiscount uniqueness constraints', () => {
  let organization1: Organization.Record
  let organization2: Organization.Record
  let pricingModel1: PricingModel.Record
  let pricingModel2: PricingModel.Record

  beforeEach(async () => {
    const orgData1 = (await setupOrg()).unwrap()
    organization1 = orgData1.organization
    pricingModel1 = orgData1.pricingModel
    const orgData2 = (await setupOrg()).unwrap()
    organization2 = orgData2.organization
    pricingModel2 = orgData2.pricingModel
  })

  it('should not allow two discounts with the same code and pricingModelId', async () => {
    await adminTransaction(async ({ transaction }) => {
      await insertDiscount(
        {
          organizationId: organization1.id,
          pricingModelId: pricingModel1.id,
          name: 'Test Discount',
          code: 'UNIQUE123',
          amount: 10,
          amountType: DiscountAmountType.Percent,
          duration: DiscountDuration.Once,
          active: true,
          livemode: true,
          numberOfPayments: null,
        },
        transaction
      )
      return Result.ok(undefined)
    })

    await expect(
      adminTransaction(async ({ transaction }) => {
        await insertDiscount(
          {
            organizationId: organization1.id,
            pricingModelId: pricingModel1.id,
            name: 'Test Discount 2',
            code: 'UNIQUE123',
            amount: 20,
            amountType: DiscountAmountType.Percent,
            duration: DiscountDuration.Once,
            active: true,
            livemode: true,
            numberOfPayments: null,
          },
          transaction
        )
        return Result.ok(undefined)
      })
    ).rejects.toThrow()
  })

  it('should allow two discounts with the same code but different pricingModelId', async () => {
    await adminTransaction(async ({ transaction }) => {
      await insertDiscount(
        {
          organizationId: organization1.id,
          pricingModelId: pricingModel1.id,
          name: 'Test Discount Org1',
          code: 'UNIQUE123',
          amount: 10,
          amountType: DiscountAmountType.Percent,
          duration: DiscountDuration.Once,
          active: true,
          livemode: true,
          numberOfPayments: null,
        },
        transaction
      )

      await insertDiscount(
        {
          organizationId: organization2.id,
          pricingModelId: pricingModel2.id,
          name: 'Test Discount Org2',
          code: 'UNIQUE123',
          amount: 10,
          amountType: DiscountAmountType.Percent,
          duration: DiscountDuration.Once,
          active: true,
          livemode: true,
          numberOfPayments: null,
        },
        transaction
      )
      return Result.ok(undefined)
    })

    const discountsOrg1 = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await selectDiscounts(
            {
              organizationId: organization1.id,
              code: 'UNIQUE123',
            },
            transaction
          )
        )
      })
    ).unwrap()
    const discountsOrg2 = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await selectDiscounts(
            {
              organizationId: organization2.id,
              code: 'UNIQUE123',
            },
            transaction
          )
        )
      })
    ).unwrap()
    expect(discountsOrg1.length).toBe(1)
    expect(discountsOrg2.length).toBe(1)
  })

  it('should allow two discounts with different codes for the same pricingModelId', async () => {
    await adminTransaction(async ({ transaction }) => {
      await insertDiscount(
        {
          organizationId: organization1.id,
          pricingModelId: pricingModel1.id,
          name: 'Test Discount 1',
          code: 'UNIQUE123',
          amount: 10,
          amountType: DiscountAmountType.Percent,
          duration: DiscountDuration.Once,
          active: true,
          livemode: true,
          numberOfPayments: null,
        },
        transaction
      )

      await insertDiscount(
        {
          organizationId: organization1.id,
          pricingModelId: pricingModel1.id,
          name: 'Test Discount 2',
          code: 'DIFFERENT456',
          amount: 20,
          amountType: DiscountAmountType.Percent,
          duration: DiscountDuration.Once,
          active: true,
          livemode: true,
          numberOfPayments: null,
        },
        transaction
      )
      return Result.ok(undefined)
    })

    const discounts = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await selectDiscounts(
            {
              organizationId: organization1.id,
            },
            transaction
          )
        )
      })
    ).unwrap()
    expect(discounts.length).toBe(2)
  })
})

describe('enrichDiscountsWithRedemptionCounts', () => {
  let organization: Organization.Record
  let price: Awaited<ReturnType<typeof setupOrg>>['price']
  let pricingModel: Awaited<
    ReturnType<typeof setupOrg>
  >['pricingModel']

  beforeEach(async () => {
    const orgData = (await setupOrg()).unwrap()
    organization = orgData.organization
    price = orgData.price
    pricingModel = orgData.pricingModel
  })

  it('should add redemptionCount of 0 for discounts with no redemptions', async () => {
    const discount = (
      await setupDiscount({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'Test Discount',
        code: 'TEST10',
        amount: 10,
        amountType: DiscountAmountType.Percent,
        livemode: true,
      })
    ).unwrap()

    const discounts = await adminTransaction(
      async ({ transaction }) => {
        const discountRecord = (
          await selectDiscountById(discount.id, transaction)
        ).unwrap()
        return await enrichDiscountsWithRedemptionCounts(
          [discountRecord],
          transaction
        )
      }
    )

    expect(discounts).toHaveLength(1)
    expect(discounts[0].id).toBe(discount.id)
    expect(discounts[0].redemptionCount).toBe(0)
  })

  it('should correctly count redemptions for a discount', async () => {
    const discount = (
      await setupDiscount({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'Test Discount',
        code: 'TEST10',
        amount: 10,
        amountType: DiscountAmountType.Percent,
        livemode: true,
      })
    ).unwrap()

    const customer = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()

    // Create 3 purchases and redemptions
    const purchaseResults = await Promise.all([
      setupPurchase({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
      }),
      setupPurchase({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
      }),
      setupPurchase({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
      }),
    ])
    const purchases = purchaseResults.map((r) => r.unwrap())

    await Promise.all(
      purchases.map((purchase) =>
        setupDiscountRedemption({
          discount,
          purchaseId: purchase.id,
        })
      )
    )

    const enrichedDiscounts = await adminTransaction(
      async ({ transaction }) => {
        const discountRecord = (
          await selectDiscountById(discount.id, transaction)
        ).unwrap()
        return await enrichDiscountsWithRedemptionCounts(
          [discountRecord],
          transaction
        )
      }
    )

    expect(enrichedDiscounts).toHaveLength(1)
    expect(enrichedDiscounts[0].id).toBe(discount.id)
    expect(enrichedDiscounts[0].redemptionCount).toBe(3)
  })
})
