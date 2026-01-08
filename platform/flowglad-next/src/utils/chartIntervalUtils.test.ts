import { describe, expect, it } from 'vitest'
import { RevenueChartIntervalUnit } from '@/types'
import {
  getDefaultInterval,
  getIntervalSelectOptions,
  minimumUnitInHours,
} from './chartIntervalUtils'

describe('minimumUnitInHours', () => {
  it('should have correct minimum hours for each interval unit', () => {
    // "Two dots make a graph" principle: minimum duration to display a multi-point graph
    expect(minimumUnitInHours[RevenueChartIntervalUnit.Hour]).toBe(2) // 2 hours
    expect(minimumUnitInHours[RevenueChartIntervalUnit.Day]).toBe(48) // 2 days
    expect(minimumUnitInHours[RevenueChartIntervalUnit.Week]).toBe(
      336
    ) // 2 weeks
    expect(minimumUnitInHours[RevenueChartIntervalUnit.Month]).toBe(
      1440
    ) // ~2 months
    expect(minimumUnitInHours[RevenueChartIntervalUnit.Year]).toBe(
      17520
    ) // 2 years
  })
})

describe('getDefaultInterval', () => {
  /**
   * The function determines chart intervals based on date range thresholds
   * (via getIntervalConfig):
   * - 0-1 days → Hourly
   * - 2-14 days → Daily
   * - 15-30 days → Daily
   * - 31-92 days → Weekly
   * - 93+ days → Monthly
   */

  describe('when range is less than 48 hours', () => {
    it('should return Hourly for "Today" scenario (0 hours)', () => {
      const now = new Date()
      const result = getDefaultInterval(now, now)
      expect(result).toBe(RevenueChartIntervalUnit.Hour)
    })

    it('should return Hourly for 12 hour range', () => {
      const fromDate = new Date('2024-01-01T00:00:00Z')
      const toDate = new Date('2024-01-01T12:00:00Z')
      const result = getDefaultInterval(fromDate, toDate)
      expect(result).toBe(RevenueChartIntervalUnit.Hour)
    })

    it('should return Hourly for 23 hour range', () => {
      const fromDate = new Date('2024-01-01T00:00:00Z')
      const toDate = new Date('2024-01-01T23:00:00Z')
      const result = getDefaultInterval(fromDate, toDate)
      expect(result).toBe(RevenueChartIntervalUnit.Hour)
    })

    it('should return Hourly at exactly 24 hours (below minimumUnitInHours[Day])', () => {
      const fromDate = new Date('2024-01-01T00:00:00Z')
      const toDate = new Date('2024-01-02T00:00:00Z')
      const result = getDefaultInterval(fromDate, toDate)
      expect(result).toBe(RevenueChartIntervalUnit.Hour)
    })

    it('should return Hourly for 47 hour range (just under 48 hour threshold)', () => {
      const fromDate = new Date('2024-01-01T00:00:00Z')
      const toDate = new Date('2024-01-02T23:00:00Z')
      const result = getDefaultInterval(fromDate, toDate)
      expect(result).toBe(RevenueChartIntervalUnit.Hour)
    })
  })

  describe('when range is 2-30 days (Daily default)', () => {
    it('should return Daily at 2 days', () => {
      const fromDate = new Date('2024-01-01T00:00:00Z')
      const toDate = new Date('2024-01-03T00:00:00Z')
      const result = getDefaultInterval(fromDate, toDate)
      expect(result).toBe(RevenueChartIntervalUnit.Day)
    })

    it('should return Daily for "Last 7 days" scenario', () => {
      const fromDate = new Date('2024-01-01T00:00:00Z')
      const toDate = new Date('2024-01-08T00:00:00Z')
      const result = getDefaultInterval(fromDate, toDate)
      expect(result).toBe(RevenueChartIntervalUnit.Day)
    })

    it('should return Daily for "Last 30 days" scenario', () => {
      const fromDate = new Date('2024-01-01T00:00:00Z')
      const toDate = new Date('2024-01-31T00:00:00Z')
      const result = getDefaultInterval(fromDate, toDate)
      expect(result).toBe(RevenueChartIntervalUnit.Day)
    })
  })

  describe('when range is 31-92 days (Weekly default)', () => {
    it('should return Weekly for 31 days (boundary)', () => {
      const fromDate = new Date('2024-01-01T00:00:00Z')
      const toDate = new Date('2024-02-01T00:00:00Z') // 31 days
      const result = getDefaultInterval(fromDate, toDate)
      expect(result).toBe(RevenueChartIntervalUnit.Week)
    })

    it('should return Weekly for ~60 days', () => {
      const fromDate = new Date('2024-01-01T00:00:00Z')
      const toDate = new Date('2024-03-01T00:00:00Z') // 60 days
      const result = getDefaultInterval(fromDate, toDate)
      expect(result).toBe(RevenueChartIntervalUnit.Week)
    })

    it('should return Weekly for 92 days (boundary)', () => {
      const fromDate = new Date('2024-01-01T00:00:00Z')
      const toDate = new Date('2024-04-02T00:00:00Z') // 92 days
      const result = getDefaultInterval(fromDate, toDate)
      expect(result).toBe(RevenueChartIntervalUnit.Week)
    })
  })

  describe('when range is 93+ days (Monthly default)', () => {
    it('should return Monthly at exactly 93 days (boundary)', () => {
      const fromDate = new Date('2024-01-01T00:00:00Z')
      const toDate = new Date('2024-04-03T00:00:00Z') // 93 days
      const result = getDefaultInterval(fromDate, toDate)
      expect(result).toBe(RevenueChartIntervalUnit.Month)
    })

    it('should return Monthly for "Last 6 months" scenario', () => {
      const fromDate = new Date('2024-01-01T00:00:00Z')
      const toDate = new Date('2024-07-01T00:00:00Z') // ~180 days
      const result = getDefaultInterval(fromDate, toDate)
      expect(result).toBe(RevenueChartIntervalUnit.Month)
    })

    it('should return Monthly for "Last 12 months" scenario', () => {
      const fromDate = new Date('2024-01-01T00:00:00Z')
      const toDate = new Date('2025-01-01T00:00:00Z') // ~365 days
      const result = getDefaultInterval(fromDate, toDate)
      expect(result).toBe(RevenueChartIntervalUnit.Month)
    })
  })
})

describe('getIntervalSelectOptions', () => {
  it('should return options with noun labels for select components', () => {
    const fromDate = new Date('2024-01-01T00:00:00Z')
    const toDate = new Date('2024-01-15T00:00:00Z') // 14 days → Daily + Hourly
    const result = getIntervalSelectOptions(fromDate, toDate)

    expect(result).toEqual([
      { label: 'day', value: RevenueChartIntervalUnit.Day },
      { label: 'hour', value: RevenueChartIntervalUnit.Hour },
    ])
  })

  it('should return single option when only one interval is valid', () => {
    const fromDate = new Date('2024-01-01T00:00:00Z')
    const toDate = new Date('2024-01-01T12:00:00Z') // same day → Hourly only
    const result = getIntervalSelectOptions(fromDate, toDate)

    expect(result).toEqual([
      { label: 'hour', value: RevenueChartIntervalUnit.Hour },
    ])
  })
})
