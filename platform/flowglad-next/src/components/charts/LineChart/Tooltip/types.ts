import type { AvailableChartColorsKeys } from '@/utils/chartStyles'

/**
 * Individual payload item in chart tooltip data.
 * Represents one data series/category at a specific point.
 */
export interface PayloadItem {
  /** The data series name/category */
  category: string
  /** The numeric value at this point */
  value: number
  /** The index label (usually date/time) */
  index: string
  /** Color for this series */
  color: AvailableChartColorsKeys
  /** Recharts internal type */
  type?: string
  /** Original data point payload */
  payload: Record<string, unknown>
}

/**
 * Props passed to custom tooltip components.
 * Used by both LineChart and AreaChart.
 */
export interface TooltipProps {
  /** Whether the tooltip is currently active/visible */
  active?: boolean
  /** Array of data points at the hovered position */
  payload?: PayloadItem[]
  /** The label for the hovered position (usually date/time) */
  label?: string
}

/**
 * Internal props for the default ChartTooltip component.
 */
export interface ChartTooltipProps {
  active: boolean | undefined
  payload: PayloadItem[]
  label: string
  valueFormatter: (value: number) => string
}
