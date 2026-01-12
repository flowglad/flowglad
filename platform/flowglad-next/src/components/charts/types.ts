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
 * Centralizes all size-related styles to avoid magic numbers.
 */
export interface ChartSizeConfig {
  /** Tailwind height class (e.g., 'h-80', 'h-40') */
  height: string
  /** Tailwind padding class for horizontal spacing */
  padding: string
  /** Tailwind text size class for header */
  headerText: string
  /** Tailwind text size class for value display */
  valueText: string
  /** Tailwind width class for skeleton loading state */
  skeletonWidth: string
  /** Tailwind height class for skeleton loading state */
  skeletonHeight: string
}
