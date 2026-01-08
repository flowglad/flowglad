'use client'

import { cn } from '@/lib/utils'
import { getColorClassName } from '@/utils/chartStyles'
import type { ChartTooltipProps, PayloadItem } from './types'

export type {
  ChartTooltipProps,
  PayloadItem,
  TooltipProps,
} from './types'

/**
 * Default chart tooltip for LineChart.
 * Shows a vertical layout: value on top, date below.
 * Matches the Figma design system tooltip styling.
 *
 * For single category charts, shows a simplified tooltip.
 * For multi-category charts, shows a breakdown with color indicators.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: ChartTooltipProps) {
  if (active && payload && payload.length) {
    const legendPayload = payload.filter(
      (item: PayloadItem) => item.type !== 'none'
    )
    // For single category charts, show simplified tooltip
    if (legendPayload.length === 1) {
      const { value } = legendPayload[0]
      return (
        <div
          className={cn(
            'bg-popover flex flex-col gap-2 p-2 rounded border border-border',
            'shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]'
          )}
        >
          <p className="text-base font-medium text-foreground tracking-tight leading-none">
            {valueFormatter(value)}
          </p>
          <p className="text-sm text-muted-foreground tracking-tight leading-5">
            {label}
          </p>
        </div>
      )
    }
    // For multi-category charts, show category breakdown
    return (
      <div
        className={cn(
          'bg-popover rounded border border-border',
          'shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]'
        )}
      >
        <div className={cn('border-b border-inherit px-3 py-2')}>
          <p className="text-sm font-medium text-foreground">
            {label}
          </p>
        </div>
        <div className={cn('space-y-1 px-3 py-2')}>
          {legendPayload.map(({ value, category, color }) => (
            <div
              key={category}
              className="flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    'h-[3px] w-3.5 shrink-0 rounded-full',
                    getColorClassName(color, 'bg')
                  )}
                />
                <p className="text-sm whitespace-nowrap text-muted-foreground">
                  {category}
                </p>
              </div>
              <p className="text-sm whitespace-nowrap font-medium tabular-nums text-foreground">
                {valueFormatter(value)}
              </p>
            </div>
          ))}
        </div>
      </div>
    )
  }
  return null
}
