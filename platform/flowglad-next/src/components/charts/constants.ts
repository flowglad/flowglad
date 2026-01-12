import type { ChartSize, ChartSizeConfig } from './types'

/**
 * Size configuration for chart components.
 * Centralizes all size-related styling to avoid magic numbers.
 *
 * @example
 * const config = CHART_SIZE_CONFIG['lg']
 * // config.height === 'h-80'
 * // config.padding === 'px-6'
 */
export const CHART_SIZE_CONFIG: Record<ChartSize, ChartSizeConfig> = {
  lg: {
    height: 'h-80', // 320px
    padding: 'px-6',
    headerText: 'text-base',
    valueText: 'text-xl',
    skeletonWidth: 'w-36',
    skeletonHeight: 'h-7',
  },
  sm: {
    height: 'h-40', // 160px
    padding: 'px-4',
    headerText: 'text-sm',
    valueText: 'text-base',
    skeletonWidth: 'w-24',
    skeletonHeight: 'h-5',
  },
} as const
