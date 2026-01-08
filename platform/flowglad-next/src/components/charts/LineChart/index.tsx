/**
 * LineChart Module - Modular chart components extracted from LineChart.tsx
 *
 * This directory contains the modular components that make up the LineChart:
 * - hooks/useContainerSize.ts - ResizeObserver hook for container dimensions
 * - utils/colors.ts - CSS color value utilities
 * - Tooltip/types.ts - Type definitions for tooltip props
 * - Tooltip/index.tsx - Default chart tooltip component
 * - Legend/index.tsx - Chart legend components
 * - Legend/ScrollButton.tsx - Scroll button for legend slider
 *
 * Note: The main LineChart component is still in charts/LineChart.tsx
 * for backward compatibility. These modular components can be used
 * independently or to gradually replace the monolithic file.
 */

// Re-export modular components
export { useContainerSize } from './hooks/useContainerSize'
export {
  ChartLegend,
  Legend,
  type RechartsLegendContentProps,
  type RechartsLegendPayloadItem,
} from './Legend'
export {
  ChartTooltip,
  type ChartTooltipProps,
  type PayloadItem,
  type TooltipProps,
} from './Tooltip'
export { getCSSColorValue } from './utils/colors'
