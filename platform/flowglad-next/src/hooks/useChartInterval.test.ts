import { describe, expect, it, mock } from 'bun:test'
import { act, renderHook } from '@testing-library/react'
import { RevenueChartIntervalUnit } from '@/types'
import { useChartInterval } from './useChartInterval'

describe('useChartInterval', () => {
  describe('default interval selection based on date range', () => {
    it('should default to Hourly for a 1-day range', () => {
      const fromDate = new Date('2024-01-01T00:00:00Z')
      const toDate = new Date('2024-01-01T23:00:00Z')

      const { result } = renderHook(() =>
        useChartInterval({ fromDate, toDate })
      )

      expect(result.current.interval).toBe(
        RevenueChartIntervalUnit.Hour
      )
    })

    it('should default to Daily for a 7-day range', () => {
      const fromDate = new Date('2024-01-01T00:00:00Z')
      const toDate = new Date('2024-01-08T00:00:00Z')

      const { result } = renderHook(() =>
        useChartInterval({ fromDate, toDate })
      )

      expect(result.current.interval).toBe(
        RevenueChartIntervalUnit.Day
      )
    })

    it('should default to Weekly for a 60-day range', () => {
      const fromDate = new Date('2024-01-01T00:00:00Z')
      const toDate = new Date('2024-03-01T00:00:00Z')

      const { result } = renderHook(() =>
        useChartInterval({ fromDate, toDate })
      )

      expect(result.current.interval).toBe(
        RevenueChartIntervalUnit.Week
      )
    })

    it('should default to Monthly for a 180-day range', () => {
      const fromDate = new Date('2024-01-01T00:00:00Z')
      const toDate = new Date('2024-07-01T00:00:00Z')

      const { result } = renderHook(() =>
        useChartInterval({ fromDate, toDate })
      )

      expect(result.current.interval).toBe(
        RevenueChartIntervalUnit.Month
      )
    })
  })

  describe('auto-correction when interval becomes invalid', () => {
    it('should auto-correct interval when date range changes to make current interval invalid', () => {
      // Start with a 7-day range (Daily/Hourly options)
      let fromDate = new Date('2024-01-01T00:00:00Z')
      let toDate = new Date('2024-01-08T00:00:00Z')

      const { result, rerender } = renderHook(() =>
        useChartInterval({ fromDate, toDate })
      )

      // Default should be Daily
      expect(result.current.interval).toBe(
        RevenueChartIntervalUnit.Day
      )

      // Change to Hourly (valid for this range)
      act(() => {
        result.current.handleIntervalChange(
          RevenueChartIntervalUnit.Hour
        )
      })
      expect(result.current.interval).toBe(
        RevenueChartIntervalUnit.Hour
      )

      // Now change to a 60-day range (Weekly/Monthly options - Hourly is NOT valid)
      fromDate = new Date('2024-01-01T00:00:00Z')
      toDate = new Date('2024-03-01T00:00:00Z')
      rerender()

      // Should auto-correct to the default for the new range (Weekly)
      expect(result.current.interval).toBe(
        RevenueChartIntervalUnit.Week
      )
    })
  })

  describe('controlled vs uncontrolled mode', () => {
    it('should show inline selector in uncontrolled mode', () => {
      const fromDate = new Date('2024-01-01T00:00:00Z')
      const toDate = new Date('2024-01-08T00:00:00Z')

      const { result } = renderHook(() =>
        useChartInterval({ fromDate, toDate })
      )

      expect(result.current.showInlineSelector).toBe(true)
    })

    it('should hide inline selector in controlled mode', () => {
      const fromDate = new Date('2024-01-01T00:00:00Z')
      const toDate = new Date('2024-01-08T00:00:00Z')
      const controlledInterval = RevenueChartIntervalUnit.Day
      const onIntervalChange = mock(() => undefined)

      const { result } = renderHook(() =>
        useChartInterval({
          fromDate,
          toDate,
          controlledInterval,
          onIntervalChange,
        })
      )

      expect(result.current.showInlineSelector).toBe(false)
      expect(result.current.interval).toBe(controlledInterval)
    })

    it('should call onIntervalChange callback in controlled mode', () => {
      const fromDate = new Date('2024-01-01T00:00:00Z')
      const toDate = new Date('2024-01-08T00:00:00Z')
      const controlledInterval = RevenueChartIntervalUnit.Day
      const onIntervalChange = mock(() => undefined)

      const { result } = renderHook(() =>
        useChartInterval({
          fromDate,
          toDate,
          controlledInterval,
          onIntervalChange,
        })
      )

      act(() => {
        result.current.handleIntervalChange(
          RevenueChartIntervalUnit.Hour
        )
      })

      expect(onIntervalChange).toHaveBeenCalledWith(
        RevenueChartIntervalUnit.Hour
      )
    })

    it('should not auto-correct interval in controlled mode', () => {
      // Start with a 7-day range but force Weekly (which would be invalid)
      let fromDate = new Date('2024-01-01T00:00:00Z')
      let toDate = new Date('2024-01-08T00:00:00Z')
      const controlledInterval = RevenueChartIntervalUnit.Week
      const onIntervalChange = mock(() => undefined)

      const { result, rerender } = renderHook(() =>
        useChartInterval({
          fromDate,
          toDate,
          controlledInterval,
          onIntervalChange,
        })
      )

      // Controlled value should be used even if "invalid" for the range
      expect(result.current.interval).toBe(
        RevenueChartIntervalUnit.Week
      )

      // Change the date range
      fromDate = new Date('2024-01-01T00:00:00Z')
      toDate = new Date('2024-07-01T00:00:00Z')
      rerender()

      // Should still use controlled value, no auto-correction
      expect(result.current.interval).toBe(
        RevenueChartIntervalUnit.Week
      )
      expect(onIntervalChange).not.toHaveBeenCalled()
    })
  })
})
