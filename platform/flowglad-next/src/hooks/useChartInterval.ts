import { useEffect, useMemo, useState } from 'react'
import { RevenueChartIntervalUnit } from '@/types'
import {
  getDefaultInterval,
  getIntervalConfig,
} from '@/utils/chartIntervalUtils'

interface UseChartIntervalOptions {
  fromDate: Date
  toDate: Date
  /** Controlled interval value (makes component controlled) */
  controlledInterval?: RevenueChartIntervalUnit
  /** Callback for controlled mode */
  onIntervalChange?: (interval: RevenueChartIntervalUnit) => void
}

/**
 * Manages interval state for chart components.
 * Supports both controlled and uncontrolled modes.
 * Auto-corrects interval when date range changes.
 *
 * @example
 * // Uncontrolled mode
 * const { interval, handleIntervalChange, showInlineSelector } = useChartInterval({
 *   fromDate,
 *   toDate,
 * })
 *
 * // Controlled mode
 * const { interval, showInlineSelector } = useChartInterval({
 *   fromDate,
 *   toDate,
 *   controlledInterval: parentInterval,
 *   onIntervalChange: setParentInterval,
 * })
 */
export function useChartInterval({
  fromDate,
  toDate,
  controlledInterval,
  onIntervalChange,
}: UseChartIntervalOptions) {
  // Compute the best default interval based on available options
  const defaultInterval = useMemo(
    () => getDefaultInterval(fromDate, toDate),
    [fromDate, toDate]
  )

  const [internalInterval, setInternalInterval] =
    useState<RevenueChartIntervalUnit>(defaultInterval)

  // Use controlled value if provided, otherwise internal
  const interval = controlledInterval ?? internalInterval
  const handleIntervalChange = onIntervalChange ?? setInternalInterval

  // Hide inline selector when controlled externally
  const showInlineSelector = controlledInterval === undefined

  // Update interval if current selection becomes invalid due to date range change
  useEffect(() => {
    // Only auto-correct for uncontrolled mode
    if (controlledInterval !== undefined) return

    const config = getIntervalConfig(fromDate, toDate)
    const isCurrentIntervalInvalid =
      !config.options.includes(internalInterval)

    if (isCurrentIntervalInvalid) {
      setInternalInterval(config.default)
    }
  }, [fromDate, toDate, internalInterval, controlledInterval])

  return {
    interval,
    handleIntervalChange,
    showInlineSelector,
  }
}
