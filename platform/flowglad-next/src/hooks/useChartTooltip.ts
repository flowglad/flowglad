import { useEffect, useRef, useState } from 'react'
import type { TooltipProps } from '@/components/charts/LineChart'

/**
 * Manages tooltip state for chart components.
 *
 * Solves the Recharts problem where tooltip callbacks fire during render,
 * causing React state update warnings. Uses a ref to queue updates
 * and applies them in useEffect.
 *
 * @returns Tooltip state and callback handler
 *
 * @example
 * const { tooltipData, tooltipCallback } = useChartTooltip()
 *
 * <LineChart
 *   tooltipCallback={tooltipCallback}
 *   // ...
 * />
 *
 * // Access current tooltip value
 * const currentValue = tooltipData?.payload?.[0]?.value
 */
export function useChartTooltip() {
  const [tooltipData, setTooltipData] = useState<TooltipProps | null>(
    null
  )

  // Use useRef to store tooltip data during render, then update state after render
  // FIXME(FG-384): This is a workaround for Recharts calling tooltip callbacks during render
  // Use `undefined` to mean "no pending change", allowing `null` to clear the tooltip
  const pendingTooltipData = useRef<TooltipProps | null | undefined>(
    undefined
  )

  // Use useEffect to safely update tooltip state after render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (pendingTooltipData.current !== undefined) {
      setTooltipData(pendingTooltipData.current)
      pendingTooltipData.current = undefined
    }
  })

  const tooltipCallback = (props: TooltipProps) => {
    // Store tooltip data in ref during render, useEffect will update state safely
    if (props.active) {
      // Only update if the data is different to prevent unnecessary re-renders
      if (tooltipData?.label !== props.label) {
        pendingTooltipData.current = props
      }
    } else if (tooltipData !== null) {
      // Only mark for clearing if we currently have tooltip data
      pendingTooltipData.current = null
    }
  }

  return { tooltipData, tooltipCallback }
}
