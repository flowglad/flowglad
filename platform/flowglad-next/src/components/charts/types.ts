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
  /** Tailwind width class for skeleton loading state */
  skeletonWidth: string
  /** Tailwind height class for skeleton loading state */
  skeletonHeight: string
  /** Whether to show vertical grid lines on the chart */
  showGridLines: boolean
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
