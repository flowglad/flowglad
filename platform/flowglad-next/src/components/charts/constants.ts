import type {
  ChartConstants,
  ChartSize,
  ChartSizeConfig,
  DashboardLineChartDefaults,
  LayoutToken,
} from './types'

/**
 * Reads the page spacing value from the CSS variable --spacing-page.
 * Falls back to 32px for SSR or if the variable is not available.
 *
 * @returns The page spacing value in pixels as a number
 */
function getPageSpacingValue(): number {
  // SSR fallback: return default value during server-side rendering
  if (typeof window === 'undefined') {
    return 32
  }

  try {
    const value = getComputedStyle(
      document.documentElement
    ).getPropertyValue('--spacing-page')
    // Parse "32px" to 32, with fallback to 32 if parsing fails
    const parsed = parseInt(value.trim(), 10)
    return Number.isNaN(parsed) ? 32 : parsed
  } catch {
    // Fallback if getComputedStyle fails (shouldn't happen in browsers)
    return 32
  }
}

/**
 * Layout tokens for consistent horizontal padding across dashboard components.
 * Single source of truth for page-level horizontal spacing.
 *
 * The value is dynamically read from the CSS variable --spacing-page defined
 * in globals.css, ensuring it stays synchronized with the Tailwind class 'px-page'.
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
  /** Standard page horizontal inset (read from --spacing-page CSS variable) */
  page: {
    value: getPageSpacingValue(),
    class: 'px-page',
  },
} satisfies Record<string, LayoutToken>

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
    height: 'h-32', // 128px
    padding: LAYOUT_TOKENS.page.class,
    chartMargin: LAYOUT_TOKENS.page.value,
    skeletonWidth: 'w-24',
    skeletonHeight: 'h-5',
    showGridLines: false,
  },
} as const
