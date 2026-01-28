import { describe, expect, it } from 'bun:test'
import { IntervalUnit } from '@/types'
import { generateNextBillingPeriod } from './billingIntervalHelpers'

describe('generateNextBillingPeriod', () => {
  describe('monthly billing', () => {
    it('handles 31 -> 30 day month transition', () => {
      const anchor = new Date('2024-01-31T10:00:00Z')
      const result = generateNextBillingPeriod({
        billingCycleAnchorDate: anchor,
        subscriptionStartDate: anchor,
        interval: IntervalUnit.Month,
        intervalCount: 1,
        lastBillingPeriodEndDate: null,
      })

      expect(result.startDate).toEqual(
        new Date('2024-01-31T10:00:00Z').getTime()
      )
      expect(result.endDate).toEqual(
        new Date('2024-02-29T10:00:00Z').getTime()
      ) // Leap year
    })

    it('handles 31 -> 28 day month transition', () => {
      const anchor = new Date('2023-01-31T10:00:00Z')
      const result = generateNextBillingPeriod({
        billingCycleAnchorDate: anchor,
        subscriptionStartDate: anchor,
        interval: IntervalUnit.Month,
        intervalCount: 1,
        lastBillingPeriodEndDate: null,
      })

      expect(result.startDate).toEqual(
        new Date('2023-01-31T10:00:00Z').getTime()
      )
      expect(result.endDate).toEqual(
        new Date('2023-02-28T10:00:00Z').getTime()
      )
    })

    it('handles multiple month intervals', () => {
      const anchor = new Date('2024-01-31T10:00:00Z')
      const result = generateNextBillingPeriod({
        billingCycleAnchorDate: anchor,
        subscriptionStartDate: anchor,
        interval: IntervalUnit.Month,
        intervalCount: 3,
        lastBillingPeriodEndDate: null,
      })

      expect(result.startDate).toEqual(
        new Date('2024-01-31T10:00:00Z').getTime()
      )
      expect(result.endDate).toEqual(
        new Date('2024-04-30T10:00:00Z').getTime()
      )
    })

    it('preserves time of day', () => {
      const anchor = new Date('2024-01-31T23:59:59.999Z')
      const result = generateNextBillingPeriod({
        billingCycleAnchorDate: anchor,
        subscriptionStartDate: anchor,
        interval: IntervalUnit.Month,
        intervalCount: 1,
        lastBillingPeriodEndDate: null,
      })

      expect(result.startDate).toEqual(
        new Date('2024-01-31T23:59:59.999Z').getTime()
      )
      expect(result.endDate).toEqual(
        new Date('2024-02-29T23:59:59.999Z').getTime()
      )
    })
  })

  describe('yearly billing', () => {
    it('handles leap year to non-leap year transition', () => {
      const anchor = new Date('2024-02-29T10:00:00Z')
      const result = generateNextBillingPeriod({
        billingCycleAnchorDate: anchor,
        subscriptionStartDate: anchor,
        interval: IntervalUnit.Year,
        intervalCount: 1,
        lastBillingPeriodEndDate: null,
      })

      expect(result.startDate).toEqual(
        new Date('2024-02-29T10:00:00Z').getTime()
      )
      expect(result.endDate).toEqual(
        new Date('2025-02-28T10:00:00Z').getTime()
      )
    })

    it('handles non-leap year to leap year transition', () => {
      const anchor = new Date('2023-02-28T10:00:00Z')
      const result = generateNextBillingPeriod({
        billingCycleAnchorDate: anchor,
        subscriptionStartDate: anchor,
        interval: IntervalUnit.Year,
        intervalCount: 1,
        lastBillingPeriodEndDate: new Date('2024-02-29T10:00:00Z'),
      })

      expect(result.startDate).toEqual(
        new Date('2024-02-29T10:00:00Z').getTime()
      )
      expect(result.endDate).toEqual(
        new Date('2025-02-28T10:00:00Z').getTime()
      )
    })

    it('handles multiple year intervals', () => {
      const anchor = new Date('2024-02-29T10:00:00Z')
      const result = generateNextBillingPeriod({
        billingCycleAnchorDate: anchor,
        subscriptionStartDate: anchor,
        interval: IntervalUnit.Year,
        intervalCount: 2,
        lastBillingPeriodEndDate: null,
      })

      expect(result.startDate).toEqual(
        new Date('2024-02-29T10:00:00Z').getTime()
      )
      expect(result.endDate).toEqual(
        new Date('2026-02-28T10:00:00Z').getTime()
      )
    })
  })

  describe('error cases', () => {
    it('throws error for unsupported intervals', () => {
      const anchor = new Date('2024-01-01T00:00:00Z')
      expect(() => {
        generateNextBillingPeriod({
          billingCycleAnchorDate: anchor,
          subscriptionStartDate: anchor,
          interval: 'decade' as IntervalUnit,
          intervalCount: 1,
          lastBillingPeriodEndDate: null,
        })
      }).toThrow('Unsupported interval: decade')
    })
  })

  // --------------------------------------
  // NEW TESTS: ADDITIONAL COVERAGE
  // --------------------------------------
  describe('additional coverage', () => {
    it('handles mid-month anchor date for monthly interval (no leap transition)', () => {
      // e.g. 2024-03-15 + 1 month => 2024-04-15
      const anchor = new Date('2024-03-15T12:00:00Z')
      const result = generateNextBillingPeriod({
        billingCycleAnchorDate: anchor,
        subscriptionStartDate: anchor,
        interval: IntervalUnit.Month,
        intervalCount: 1,
        lastBillingPeriodEndDate: null,
      })

      expect(result.startDate).toEqual(
        new Date('2024-03-15T12:00:00Z').getTime()
      )
      expect(result.endDate).toEqual(
        new Date('2024-04-15T12:00:00Z').getTime()
      )
    })

    it('handles large monthly interval crossing multiple months including a leap boundary', () => {
      // e.g. 2023-11-15 + 5 months => 2024-04-15 (covers leap day in 2024)
      const anchor = new Date('2023-11-15T09:30:00Z')
      const result = generateNextBillingPeriod({
        billingCycleAnchorDate: anchor,
        subscriptionStartDate: anchor,
        interval: IntervalUnit.Month,
        intervalCount: 5,
        lastBillingPeriodEndDate: null,
      })

      expect(result.startDate).toEqual(
        new Date('2023-11-15T09:30:00Z').getTime()
      )
      expect(result.endDate).toEqual(
        new Date('2024-04-15T09:30:00Z').getTime()
      )
    })

    it('handles multiple year intervals from a non-edge day', () => {
      // e.g. 2023-05-15 + 2 years => 2025-05-15
      const anchor = new Date('2023-05-15T00:00:00Z')
      const result = generateNextBillingPeriod({
        billingCycleAnchorDate: anchor,
        subscriptionStartDate: anchor,
        interval: IntervalUnit.Year,
        intervalCount: 2,
        lastBillingPeriodEndDate: null,
      })

      expect(result.startDate).toEqual(
        new Date('2023-05-15T00:00:00Z').getTime()
      )
      expect(result.endDate).toEqual(
        new Date('2025-05-15T00:00:00Z').getTime()
      )
    })

    it('allows contiguous billing where new start date == last end date', () => {
      // e.g. last cycle ended on 2023-09-10; new cycle starts exactly 2023-09-10
      const lastEnd = new Date('2023-09-10T10:00:00Z')
      const result = generateNextBillingPeriod({
        billingCycleAnchorDate: new Date('2023-09-01T00:00:00Z'), // anchor is different but time is copied over
        subscriptionStartDate: new Date('2023-09-01T00:00:00Z'),
        interval: IntervalUnit.Month,
        intervalCount: 1,
        lastBillingPeriodEndDate: lastEnd,
      })

      // The code might copy time from anchorDate to lastEnd,
      // so the new start could be exactly lastEnd's date/time.
      expect(result.startDate).toEqual(lastEnd.getTime())
      expect(result.endDate).toEqual(
        new Date('2023-10-10T10:00:00Z').getTime()
      )
    })

    it('throws error if intervalCount is zero', () => {
      const anchor = new Date('2024-01-01T00:00:00Z')
      expect(() => {
        generateNextBillingPeriod({
          billingCycleAnchorDate: anchor,
          subscriptionStartDate: anchor,
          interval: IntervalUnit.Month,
          intervalCount: 0, // Invalid scenario
          lastBillingPeriodEndDate: null,
        })
      }).toThrow()
    })

    it('throws error if intervalCount is negative', () => {
      const anchor = new Date('2024-01-01T00:00:00Z')
      expect(() => {
        generateNextBillingPeriod({
          billingCycleAnchorDate: anchor,
          subscriptionStartDate: anchor,
          interval: IntervalUnit.Year,
          intervalCount: -1, // Invalid scenario
          lastBillingPeriodEndDate: null,
        })
      }).toThrow()
    })
  })
})

describe('trial period handling', () => {
  it('should use trialEnd as the endDate when provided', () => {
    const anchorDate = new Date('2024-01-01T12:00:00Z')
    const trialEnd = new Date('2024-01-15T12:00:00Z')

    const result = generateNextBillingPeriod({
      billingCycleAnchorDate: anchorDate,
      subscriptionStartDate: anchorDate,
      interval: IntervalUnit.Month,
      intervalCount: 1,
      trialEnd: trialEnd,
    })

    expect(result.startDate).toEqual(anchorDate.getTime())
    expect(result.endDate).toEqual(trialEnd.getTime())
  })

  it('should prioritize trialEnd over other interval calculations', () => {
    const anchorDate = new Date('2024-01-01T00:00:00Z')
    const trialEnd = new Date('2024-01-10T00:00:00Z')
    // This would normally produce an end date of 2024-02-01
    const result = generateNextBillingPeriod({
      billingCycleAnchorDate: anchorDate,
      subscriptionStartDate: anchorDate,
      interval: IntervalUnit.Month,
      intervalCount: 1,
      lastBillingPeriodEndDate: null,
      trialEnd: trialEnd,
    })

    // The result should be based on the trial, not the month interval
    expect(result.startDate).toEqual(anchorDate.getTime())
    expect(result.endDate).toEqual(trialEnd.getTime())
  })

  it('should ignore lastBillingPeriodEndDate when trialEnd is present', () => {
    const anchorDate = new Date('2024-03-01T00:00:00Z')
    const trialEnd = new Date('2024-03-15T00:00:00Z')
    const lastBillingPeriodEndDate = new Date('2024-02-01T00:00:00Z')

    const result = generateNextBillingPeriod({
      billingCycleAnchorDate: anchorDate,
      subscriptionStartDate: anchorDate,
      interval: IntervalUnit.Month,
      intervalCount: 1,
      lastBillingPeriodEndDate,
      trialEnd,
    })

    // Start date should be the anchor, not the last period's end.
    expect(result.startDate).toEqual(anchorDate.getTime())
    expect(result.endDate).toEqual(trialEnd.getTime())
  })

  it('throws an error if trialEnd is not after the anchor date', () => {
    const anchorDate = new Date('2024-01-15T00:00:00Z')
    const trialEnd = new Date('2024-01-14T00:00:00Z') // Before anchor

    expect(() => {
      generateNextBillingPeriod({
        billingCycleAnchorDate: anchorDate,
        subscriptionStartDate: anchorDate,
        interval: IntervalUnit.Month,
        intervalCount: 1,
        trialEnd: trialEnd,
      })
    }).toThrow(
      'Trial end date must be after the billing cycle anchor date.'
    )
  })

  it('throws an error if trialEnd is the same as the anchor date', () => {
    const anchorDate = new Date('2024-01-15T00:00:00Z')
    const trialEnd = new Date('2024-01-15T00:00:00Z') // Same as anchor

    expect(() => {
      generateNextBillingPeriod({
        billingCycleAnchorDate: anchorDate,
        subscriptionStartDate: anchorDate,
        interval: IntervalUnit.Month,
        intervalCount: 1,
        trialEnd: trialEnd,
      })
    }).toThrow(
      'Trial end date must be after the billing cycle anchor date.'
    )
  })
})

describe('anchor date vs. start date handling', () => {
  it('should handle trial period correctly when anchor date is normalized to start of month', () => {
    const subscriptionStartDate = new Date('2024-01-15T12:00:00Z')
    const anchorDate = new Date('2024-01-01T00:00:00Z')
    const trialEnd = new Date('2024-01-25T12:00:00Z')

    const result = generateNextBillingPeriod({
      billingCycleAnchorDate: anchorDate,
      interval: IntervalUnit.Month,
      intervalCount: 1,
      trialEnd: trialEnd,
      subscriptionStartDate: subscriptionStartDate,
    })

    expect(result.startDate).toEqual(subscriptionStartDate.getTime())
    expect(result.endDate).toEqual(trialEnd.getTime())
  })
})
