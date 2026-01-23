import { describe, expect, it } from 'bun:test'
import { RevenueChartIntervalUnit } from '@/types'
import { formatDateUTC } from './dateFormatting'

describe('formatDateUTC', () => {
  const testDate = new Date('2025-01-15T10:30:00Z')

  it('should format Year granularity as year only', () => {
    expect(
      formatDateUTC(testDate, RevenueChartIntervalUnit.Year)
    ).toBe('2025')
  })

  it('should format Hour granularity as time only', () => {
    expect(
      formatDateUTC(testDate, RevenueChartIntervalUnit.Hour)
    ).toBe('10:30')
  })

  it('should format Month granularity as month name only', () => {
    expect(
      formatDateUTC(testDate, RevenueChartIntervalUnit.Month)
    ).toBe('Jan')
  })

  it('should format Week granularity as day and month', () => {
    expect(
      formatDateUTC(testDate, RevenueChartIntervalUnit.Week)
    ).toBe('15 Jan')
  })

  it('should format Day granularity as day and month', () => {
    expect(
      formatDateUTC(testDate, RevenueChartIntervalUnit.Day)
    ).toBe('15 Jan')
  })

  it('should pad hours and minutes with leading zeros', () => {
    const earlyMorning = new Date('2025-03-05T04:07:00Z')
    expect(
      formatDateUTC(earlyMorning, RevenueChartIntervalUnit.Hour)
    ).toBe('04:07')
  })

  it('should format October as three-letter abbreviation "Oct"', () => {
    const october = new Date('2025-10-01T00:00:00Z')
    expect(
      formatDateUTC(october, RevenueChartIntervalUnit.Month)
    ).toBe('Oct')
  })
})
