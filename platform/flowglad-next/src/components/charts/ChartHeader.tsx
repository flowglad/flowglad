'use client'

import React from 'react'
import { ChartInfoTooltip } from '@/components/ui/chart-info-tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { RevenueChartIntervalUnit } from '@/types'
import { getIntervalSelectOptions } from '@/utils/chartIntervalUtils'
import { CHART_SIZE_CONFIG } from './constants'

interface ChartHeaderProps {
  /** Chart title displayed in header */
  title: string
  /** Info tooltip content explaining the metric */
  infoTooltip: string
  /** Whether to show the inline interval selector */
  showInlineSelector?: boolean
  /** Current interval value (required if showInlineSelector is true) */
  interval?: RevenueChartIntervalUnit
  /** Interval change handler (required if showInlineSelector is true) */
  onIntervalChange?: (interval: RevenueChartIntervalUnit) => void
  /** Date range start for computing interval options */
  fromDate?: Date
  /** Date range end for computing interval options */
  toDate?: Date
  /** Compact mode for secondary charts - smaller text, reduced padding */
  compact?: boolean
}

/**
 * Shared chart header component with title, info tooltip, and optional interval selector.
 *
 * @example
 * <ChartHeader
 *   title="Revenue"
 *   infoTooltip="Total revenue collected..."
 *   showInlineSelector={showInlineSelector}
 *   interval={interval}
 *   onIntervalChange={handleIntervalChange}
 *   fromDate={fromDate}
 *   toDate={toDate}
 *   compact={false}
 * />
 */
export function ChartHeader({
  title,
  infoTooltip,
  showInlineSelector = false,
  interval,
  onIntervalChange,
  fromDate,
  toDate,
  compact = false,
}: ChartHeaderProps) {
  const config = CHART_SIZE_CONFIG[compact ? 'sm' : 'lg']

  const intervalOptions = React.useMemo(() => {
    if (!fromDate || !toDate) return []
    return getIntervalSelectOptions(fromDate, toDate)
  }, [fromDate, toDate])

  return (
    <div
      className={cn(
        'flex flex-row gap-2 justify-between',
        config.padding
      )}
    >
      <div
        className={cn(
          'text-foreground w-fit flex items-center flex-row gap-0.5',
          config.headerText
        )}
      >
        <p className="whitespace-nowrap">{title}</p>
        {showInlineSelector && interval && onIntervalChange && (
          <Select
            value={interval}
            onValueChange={(value) =>
              onIntervalChange(value as RevenueChartIntervalUnit)
            }
          >
            <SelectTrigger className="border-none bg-transparent px-1 text-muted-foreground shadow-none h-auto py-0 gap-0 text-base">
              <span className="text-muted-foreground">by&nbsp;</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {intervalOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <ChartInfoTooltip content={infoTooltip} />
      </div>
    </div>
  )
}
