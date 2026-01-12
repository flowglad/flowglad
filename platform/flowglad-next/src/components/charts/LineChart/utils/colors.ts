import type { AvailableChartColorsKeys } from '@/utils/chartStyles'

/**
 * Color mapping for Recharts stroke props.
 * Maps semantic color names to actual CSS color values.
 */
const colorMap = {
  blue: '#3b82f6',
  emerald: '#10b981',
  violet: '#8b5cf6',
  amber: '#f59e0b',
  gray: '#6b7280',
  cyan: '#06b6d4',
  pink: '#ec4899',
  lime: '#84cc16',
  fuchsia: '#d946ef',
  primary: 'hsl(var(--primary))',
  stone: '#57534e',
  foreground: 'hsl(var(--foreground))',
} as const

/**
 * Gets the actual CSS color value for Recharts stroke prop.
 * Converts semantic color names to CSS color values that work in SVG elements.
 *
 * @param color - Semantic color key from the chart colors palette
 * @returns CSS color value string
 *
 * @example
 * getCSSColorValue('foreground') // 'hsl(var(--foreground))'
 * getCSSColorValue('blue') // '#3b82f6'
 */
export function getCSSColorValue(
  color: AvailableChartColorsKeys
): string {
  return colorMap[color as keyof typeof colorMap] ?? '#6b7280'
}
