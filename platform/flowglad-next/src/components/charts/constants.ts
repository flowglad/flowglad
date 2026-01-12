import type {
  ChartConstants,
  ChartSize,
  ChartSizeConfig,
} from './types'

/**
 * Chart constants that are the same across all chart sizes.
 * Use this for properties that should NOT vary between lg and sm charts.
 *
 * @example
 * <div className={CHART_CONSTANTS.headerText}>Title</div>
 * <p className={CHART_CONSTANTS.valueText}>$1,234</p>
 */
export const CHART_CONSTANTS: ChartConstants = {
  headerText: 'text-base',
  valueText: 'text-lg',
} as const

/**
 * Size-specific configuration for chart components.
 * Use this for properties that SHOULD vary between lg and sm charts.
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
    skeletonWidth: 'w-36',
    skeletonHeight: 'h-7',
    showGridLines: true,
  },
  sm: {
    height: 'h-40', // 160px
    padding: 'px-4',
    skeletonWidth: 'w-24',
    skeletonHeight: 'h-5',
    showGridLines: false,
  },
} as const
