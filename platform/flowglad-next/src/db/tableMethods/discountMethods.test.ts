import { beforeEach, describe, expect, it } from 'vitest'
import { setupOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Organization } from '@/db/schema/organizations'
import { DiscountAmountType, DiscountDuration } from '@/types'
import { insertDiscount, selectDiscounts } from './discountMethods'

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
