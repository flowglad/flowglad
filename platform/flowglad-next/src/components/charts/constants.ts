import type {
  ChartConstants,
  ChartSize,
  ChartSizeConfig,
  DashboardLineChartDefaults,
  LayoutToken,
} from './types'

/**
 * Layout tokens for consistent horizontal padding across dashboard components.
 * Single source of truth for page-level horizontal spacing.
 *
 * Use `LAYOUT_TOKENS.page.class` for Tailwind classes (e.g., in className)
 * Use `LAYOUT_TOKENS.page.value` for numeric values (e.g., Recharts margins)
 *
 * @example
 * // In a React component
 * <div className={LAYOUT_TOKENS.page.class}>Content</div>
 *
 * // In Recharts config
 * margin={{ left: LAYOUT_TOKENS.page.value, right: LAYOUT_TOKENS.page.value }}
 */
export const LAYOUT_TOKENS = {
  /** Standard page horizontal inset (32px) */
  page: {
    value: 32,
    class: 'px-page',
  } as LayoutToken,
} as const

/**
 * Default props for LineChart used in dashboard charts.
 * These are the common settings shared across all dashboard chart components.
 * Spread these into LineChart and override only what differs per chart.
 *
 * @example
 * <LineChart
 *   {...DASHBOARD_LINE_CHART_DEFAULTS}
 *   data={chartData}
 *   categories={['revenue']}
 *   // ... chart-specific props
 * />
 */
export const DASHBOARD_LINE_CHART_DEFAULTS: DashboardLineChartDefaults =
  {
    colors: ['foreground'],
    fill: 'gradient',
    autoMinValue: false,
    minValue: 0,
    startEndOnly: true,
    startEndOnlyYAxis: true,
    showYAxis: false,
  }

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
  valueText: 'text-xl',
} as const

/**
 * Size-specific configuration for chart components.
 * Use this for properties that SHOULD vary between lg and sm charts.
 *
 * Note: `chartMargin` should match `padding` to align chart content with text.
 *
 * @example
 * const config = CHART_SIZE_CONFIG['lg']
 * // config.height === 'h-60'
 * // config.padding === 'px-page'
 * // config.chartMargin === 24
 */
export const CHART_SIZE_CONFIG: Record<ChartSize, ChartSizeConfig> = {
  lg: {
    height: 'h-60', // 240px
    padding: LAYOUT_TOKENS.page.class,
    chartMargin: LAYOUT_TOKENS.page.value,
    skeletonWidth: 'w-36',
    skeletonHeight: 'h-7',
    showGridLines: true,
  },
  sm: {
    height: 'h-28', // 112px
    padding: LAYOUT_TOKENS.page.class,
    chartMargin: LAYOUT_TOKENS.page.value,
    skeletonWidth: 'w-24',
    skeletonHeight: 'h-5',
    showGridLines: false,
  },
} as const
