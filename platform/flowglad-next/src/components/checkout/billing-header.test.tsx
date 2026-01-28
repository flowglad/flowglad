import { describe, expect, it } from 'bun:test'
import { IntervalUnit } from '@/types'
import { intervalLabel } from './billing-header'

describe('BillingHeader', () => {
  describe('intervalLabel function', () => {
    it('should return "monthly" for single month interval', () => {
      const result = intervalLabel(
        { intervalCount: 1, intervalUnit: IntervalUnit.Month },
        undefined
      )
      expect(result).toBe('monthly')
    })

    it('should return "yearly" for single year interval', () => {
      const result = intervalLabel(
        { intervalCount: 1, intervalUnit: IntervalUnit.Year },
        undefined
      )
      expect(result).toBe('yearly')
    })

    it('should return "weekly" for single week interval', () => {
      const result = intervalLabel(
        { intervalCount: 1, intervalUnit: IntervalUnit.Week },
        undefined
      )
      expect(result).toBe('weekly')
    })

    it('should return "daily" for single day interval', () => {
      const result = intervalLabel(
        { intervalCount: 1, intervalUnit: IntervalUnit.Day },
        undefined
      )
      expect(result).toBe('daily')
    })

    it('should return "2 months" for multiple month interval', () => {
      const result = intervalLabel(
        { intervalCount: 2, intervalUnit: IntervalUnit.Month },
        undefined
      )
      expect(result).toBe('2 months')
    })

    it('should return "3 years" for multiple year interval', () => {
      const result = intervalLabel(
        { intervalCount: 3, intervalUnit: IntervalUnit.Year },
        undefined
      )
      expect(result).toBe('3 years')
    })

    it('should return "6 weeks" for multiple week interval', () => {
      const result = intervalLabel(
        { intervalCount: 6, intervalUnit: IntervalUnit.Week },
        undefined
      )
      expect(result).toBe('6 weeks')
    })

    it('should return "7 days" for multiple day interval', () => {
      const result = intervalLabel(
        { intervalCount: 7, intervalUnit: IntervalUnit.Day },
        undefined
      )
      expect(result).toBe('7 days')
    })

    it('should fallback to price data when purchase data is null', () => {
      const result = intervalLabel(null, {
        intervalCount: 1,
        intervalUnit: IntervalUnit.Day,
      })
      expect(result).toBe('daily')
    })

    it('should fallback to price data when purchase data is undefined', () => {
      const result = intervalLabel(undefined, {
        intervalCount: 1,
        intervalUnit: IntervalUnit.Year,
      })
      expect(result).toBe('yearly')
    })

    it('should use purchase data when both purchase and price data exist', () => {
      const result = intervalLabel(
        { intervalCount: 2, intervalUnit: IntervalUnit.Month },
        { intervalCount: 1, intervalUnit: IntervalUnit.Year }
      )
      expect(result).toBe('2 months')
    })

    it('should default to monthly when no data is provided', () => {
      const result = intervalLabel(null, undefined)
      expect(result).toBe('monthly')
    })

    it('should handle zero interval count gracefully', () => {
      const result = intervalLabel(
        { intervalCount: 0, intervalUnit: IntervalUnit.Month },
        undefined
      )
      // Note: The current implementation returns "monthly" when intervalCount is 0 (since 0 is not > 1)
      expect(result).toBe('monthly')
    })
  })
})
