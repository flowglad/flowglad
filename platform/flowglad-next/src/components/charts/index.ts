/**
 * Chart components and composition primitives
 */

// Base chart components
// Backward compatibility - TooltipCallbackProps is an alias for TooltipProps
// Prefer using TooltipProps for new code
export { AreaChart, type TooltipCallbackProps } from './AreaChart'

// Composition primitives for building dashboard charts
export { ChartBody } from './ChartBody'
export { ChartHeader } from './ChartHeader'
export { ChartValueDisplay } from './ChartValueDisplay'
export { LineChart, type TooltipProps } from './LineChart'
