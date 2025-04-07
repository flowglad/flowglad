import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  normalizeToMonthlyValue,
  calculateOverlapPercentage,
  calculateBillingPeriodItemsValue
} from './revenueCalculationHelpers'
import { IntervalUnit } from '@/types'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import { startOfMonth, endOfMonth } from 'date-fns'

describe('normalizeToMonthlyValue', () => {
  it('should normalize monthly values based on interval count', () => {
    expect(normalizeToMonthlyValue(100, IntervalUnit.Month, 1)).toBe(100)
    expect(normalizeToMonthlyValue(100, IntervalUnit.Month, 2)).toBe(50)
  })

  it('should normalize yearly values to monthly', () => {
    expect(normalizeToMonthlyValue(1200, IntervalUnit.Year, 1)).toBe(100)
    expect(normalizeToMonthlyValue(2400, IntervalUnit.Year, 2)).toBe(100)
  })

  it('should normalize weekly values to monthly', () => {
    // 52 weeks in a year, so 100 * 52 / 12 = 433.33...
    expect(normalizeToMonthlyValue(100, IntervalUnit.Week, 1)).toBeCloseTo(433.33, 1)
  })

  it('should normalize daily values to monthly', () => {
    // 365 days in a year, so 10 * 365 / 12 = 304.17...
    expect(normalizeToMonthlyValue(10, IntervalUnit.Day, 1)).toBeCloseTo(304.17, 1)
  })

  it('should throw an error for invalid interval counts', () => {
    expect(() => normalizeToMonthlyValue(100, IntervalUnit.Month, 0)).toThrow()
    expect(() => normalizeToMonthlyValue(100, IntervalUnit.Month, -1)).toThrow()
  })
})

describe('calculateOverlapPercentage', () => {
  const createBillingPeriod = (startDate: Date, endDate: Date): BillingPeriod.Record => {
    return {
      id: 'test-id',
      subscriptionId: 'test-subscription-id',
      startDate,
      endDate,
      status: 'active' as any,
      trialPeriod: false,
      livemode: false,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }

  it('should return 1 when billing period is entirely within month', () => {
    const month = new Date('2023-05-15')
    const monthStart = startOfMonth(month)
    const monthEnd = endOfMonth(month)
    
    // Billing period is from May 5 to May 25, 2023
    const billingPeriod = createBillingPeriod(
      new Date('2023-05-05'),
      new Date('2023-05-25')
    )
    
    expect(calculateOverlapPercentage(billingPeriod, monthStart, monthEnd)).toBe(1)
  })

  it('should return 0 when billing period has no overlap with month', () => {
    const month = new Date('2023-05-15')
    const monthStart = startOfMonth(month)
    const monthEnd = endOfMonth(month)
    
    // Billing period is from April 1 to April 30, 2023
    const billingPeriod = createBillingPeriod(
      new Date('2023-04-01'),
      new Date('2023-04-30')
    )
    
    expect(calculateOverlapPercentage(billingPeriod, monthStart, monthEnd)).toBe(0)
  })

  it('should return partial value when billing period partially overlaps with month', () => {
    const month = new Date('2023-05-15')
    const monthStart = startOfMonth(month)
    const monthEnd = endOfMonth(month)
    
    // Billing period is from April 15 to May 15, 2023 (31 days total, 15 days in May)
    const billingPeriod = createBillingPeriod(
      new Date('2023-04-15'),
      new Date('2023-05-15')
    )
    
    // We expect close to 0.5 (half the billing period is in May)
    expect(calculateOverlapPercentage(billingPeriod, monthStart, monthEnd)).toBeCloseTo(0.48, 1)
  })
})

describe('calculateBillingPeriodItemsValue', () => {
  it('should calculate the total value of billing period items', () => {
    const items: BillingPeriodItem.Record[] = [
      {
        id: 'item1',
        billingPeriodId: 'bp1',
        quantity: 2,
        unitPrice: 100,
        name: 'Item 1',
        discountRedemptionId: null,
        description: 'Test item 1',
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'item2',
        billingPeriodId: 'bp1',
        quantity: 1,
        unitPrice: 50,
        name: 'Item 2',
        discountRedemptionId: null,
        description: 'Test item 2',
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]
    
    // 2 * 100 + 1 * 50 = 250
    expect(calculateBillingPeriodItemsValue(items)).toBe(250)
  })

  it('should return 0 for empty array', () => {
    expect(calculateBillingPeriodItemsValue([])).toBe(0)
  })
})