'use client'

import { ChartBody } from './ChartBody'
import { ChartHeader } from './ChartHeader'
import { ChartValueDisplay } from './ChartValueDisplay'
import type { ChartSize } from './types'

interface ChartLayoutProps {
  /** Chart title displayed in header */
  title: string
  /** Info tooltip content explaining the metric */
  infoTooltip: string
  /** Formatted value to display (e.g., "$1,234.56" or "42") */
  value: string
  /** Whether data is loading */
  isLoading: boolean
  /** Chart size variant - 'lg' for primary, 'sm' for secondary */
  size?: ChartSize
  /** Chart content (usually a LineChart) */
  children: React.ReactNode
}

/**
 * Composite layout component for dashboard charts.
 * Combines ChartHeader, ChartValueDisplay, and ChartBody into a single component.
 *
 * @example
 * <ChartLayout
 *   title="Revenue"
 *   infoTooltip="Total revenue collected..."
 *   value="$1,234.56"
 *   isLoading={isLoading}
 *   size="lg"
 * >
 *   <LineChart {...chartProps} />
 * </ChartLayout>
 */
export function ChartLayout({
  title,
  infoTooltip,
  value,
  isLoading,
  size = 'lg',
  children,
}: ChartLayoutProps) {
  return (
    <div className="w-full h-full">
      <ChartHeader
        title={title}
        infoTooltip={infoTooltip}
        size={size}
      />
      <ChartValueDisplay
        value={value}
        isLoading={isLoading}
        size={size}
      />
      <ChartBody isLoading={isLoading} size={size}>
        {children}
      </ChartBody>
    </div>
  )
}
