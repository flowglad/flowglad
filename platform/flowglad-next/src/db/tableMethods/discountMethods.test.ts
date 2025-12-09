import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupCustomer,
  setupDiscount,
  setupDiscountRedemption,
  setupOrg,
  setupPurchase,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Organization } from '@/db/schema/organizations'
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

  beforeEach(async () => {
    const orgData1 = await setupOrg()
    organization1 = orgData1.organization
    const orgData2 = await setupOrg()
    organization2 = orgData2.organization
  })

  it('should not allow two discounts with the same code, organizationId, and livemode', async () => {
    await adminTransaction(async ({ transaction }) => {
      await insertDiscount(
        {
          organizationId: organization1.id,
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
    })

    await expect(
      adminTransaction(async ({ transaction }) => {
        await insertDiscount(
          {
            organizationId: organization1.id,
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
      })
    ).rejects.toThrow()
  })

  it('should allow two discounts with the same code and organizationId but different livemode', async () => {
    await adminTransaction(async ({ transaction }) => {
      await insertDiscount(
        {
          organizationId: organization1.id,
          name: 'Test Discount Live',
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
          name: 'Test Discount Test',
          code: 'UNIQUE123',
          amount: 10,
          amountType: DiscountAmountType.Percent,
          duration: DiscountDuration.Once,
          active: true,
          livemode: false,
          numberOfPayments: null,
        },
        transaction
      )
    })

    const discounts = await adminTransaction(
      async ({ transaction }) => {
        return selectDiscounts(
          {
            organizationId: organization1.id,
            code: 'UNIQUE123',
          },
          transaction
        )
      }
    )
    expect(discounts.length).toBe(2)
  })

  it('should allow two discounts with the same code and livemode but different organizationId', async () => {
    await adminTransaction(async ({ transaction }) => {
      await insertDiscount(
        {
          organizationId: organization1.id,
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
    })

    const discountsOrg1 = await adminTransaction(
      async ({ transaction }) => {
        return selectDiscounts(
          {
            organizationId: organization1.id,
            code: 'UNIQUE123',
          },
          transaction
        )
      }
    )
    const discountsOrg2 = await adminTransaction(
      async ({ transaction }) => {
        return selectDiscounts(
          {
            organizationId: organization2.id,
            code: 'UNIQUE123',
          },
          transaction
        )
      }
    )
    expect(discountsOrg1.length).toBe(1)
    expect(discountsOrg2.length).toBe(1)
  })

  it('should allow two discounts with different codes for the same organization and livemode', async () => {
    await adminTransaction(async ({ transaction }) => {
      await insertDiscount(
        {
          organizationId: organization1.id,
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
    })

    const discounts = await adminTransaction(
      async ({ transaction }) => {
        return selectDiscounts(
          {
            organizationId: organization1.id,
          },
          transaction
        )
      }
    )
    expect(discounts.length).toBe(2)
  })
})

describe('enrichDiscountsWithRedemptionCounts', () => {
  let organization: Organization.Record
  let price: Awaited<ReturnType<typeof setupOrg>>['price']

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    price = orgData.price
  })

  it('should add redemptionCount of 0 for discounts with no redemptions', async () => {
    const discount = await setupDiscount({
      organizationId: organization.id,
      name: 'Test Discount',
      code: 'TEST10',
      amount: 10,
      amountType: DiscountAmountType.Percent,
      livemode: true,
    })

    const discounts = await adminTransaction(
      async ({ transaction }) => {
        const discountRecord = await selectDiscountById(
          discount.id,
          transaction
        )
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
    const discount = await setupDiscount({
      organizationId: organization.id,
      name: 'Test Discount',
      code: 'TEST10',
      amount: 10,
      amountType: DiscountAmountType.Percent,
      livemode: true,
    })

    const customer = await setupCustomer({
      organizationId: organization.id,
    })

    // Create 3 purchases and redemptions
    const purchases = await Promise.all([
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
        const discountRecord = await selectDiscountById(
          discount.id,
          transaction
        )
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
