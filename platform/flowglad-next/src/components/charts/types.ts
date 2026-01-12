/**
 * Chart type definitions
 */

/**
 * Chart size variant.
 * - 'lg': Primary chart (h-80, 320px) - full size with all features
 * - 'sm': Secondary chart (h-40, 160px) - compact sparkline view
 */
export type ChartSize = 'lg' | 'sm'

/**
 * Configuration for chart size styling.
 * Contains properties that VARY by chart size (lg vs sm).
 * For properties that are constant across all sizes, see ChartConstants.
 */
export interface ChartSizeConfig {
  /** Tailwind height class (e.g., 'h-80', 'h-40') */
  height: string
  /** Tailwind padding class for horizontal spacing */
  padding: string
  /** Numeric padding value in pixels (for Recharts margins) */
  chartMargin: number
  /** Tailwind width class for skeleton loading state */
  skeletonWidth: string
  /** Tailwind height class for skeleton loading state */
  skeletonHeight: string
  /** Whether to show vertical grid lines on the chart */
  showGridLines: boolean
}

/**
 * Layout tokens for consistent horizontal padding across dashboard components.
 * These values are the single source of truth for page-level horizontal spacing.
 */
export interface LayoutToken {
  /** Numeric value in pixels (for JS-based styling like Recharts margins) */
  value: number
  /** Tailwind class name (for CSS-based styling) */
  class: string
}

/**
 * Chart constants that are the same across all chart sizes.
 * For properties that vary by size, see ChartSizeConfig.
 */
export interface ChartConstants {
  /** Tailwind text size class for header (same for all chart sizes) */
  headerText: string
  /** Tailwind text size class for value display (same for all chart sizes) */
  valueText: string
}

/**
 * Available chart color keys from the Tremor color palette.
 */
export type ChartColorKey =
  | 'foreground'
  | 'primary'
  | 'blue'
  | 'emerald'
  | 'violet'
  | 'amber'
  | 'gray'
  | 'cyan'
  | 'pink'
  | 'lime'
  | 'fuchsia'
  | 'stone'

/**
 * Default LineChart props shared across all dashboard charts.
 * These settings are common to Revenue, MRR, Subscribers, and other dashboard charts.
 */
export interface DashboardLineChartDefaults {
  /** Line/area colors - uses foreground for consistent theme */
  colors: ChartColorKey[]
  /** Fill style for the area under the line */
  fill: 'gradient' | 'solid' | 'none'
  /** Disable auto min value calculation */
  autoMinValue: boolean
  /** Minimum Y-axis value (0 for positive-only metrics) */
  minValue: number
  /** Only show first and last X-axis labels */
  startEndOnly: boolean
  /** Only show first and last Y-axis labels */
  startEndOnlyYAxis: boolean
  /** Hide Y-axis (values shown in header instead) */
  showYAxis: boolean
}
