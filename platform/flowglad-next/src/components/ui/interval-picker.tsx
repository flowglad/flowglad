'use client'

import { Check } from 'lucide-react'
import * as React from 'react'
import { ChevronDown } from '@/components/icons/navigation'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { RevenueChartIntervalUnit } from '@/types'
import {
  getIntervalConfig,
  intervalLabels,
} from '@/utils/chartIntervalUtils'

export interface IntervalPickerProps {
  /** The currently selected interval */
  value: RevenueChartIntervalUnit
  /** Callback when interval changes */
  onValueChange: (value: RevenueChartIntervalUnit) => void
  /** Start date of the date range (used to determine valid options) */
  fromDate: Date
  /** End date of the date range (used to determine valid options) */
  toDate: Date
  /** Optional className for the root container */
  className?: string
  /** Whether the picker is disabled */
  disabled?: boolean
}

/**
 * A dropdown picker for selecting chart interval granularity.
 *
 * Only shows valid interval options based on the selected date range.
 * Click immediately selects and closes the popover (no Apply/Cancel workflow).
 *
 * Styled to match `DateRangePicker` exactly: Button with variant="secondary" and size="sm",
 * ChevronDown icon, default popover width, align="start".
 */
export function IntervalPicker({
  value,
  onValueChange,
  fromDate,
  toDate,
  className,
  disabled = false,
}: IntervalPickerProps) {
  const [open, setOpen] = React.useState(false)

  // Get valid options for the current date range
  const config = React.useMemo(
    () => getIntervalConfig(fromDate, toDate),
    [fromDate, toDate]
  )

  const handleSelect = (interval: RevenueChartIntervalUnit) => {
    onValueChange(interval)
    setOpen(false)
  }

  return (
    <div className={cn('grid gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="secondary" size="sm" disabled={disabled}>
            {intervalLabels[value]}
            <ChevronDown className="ml-auto h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-1 rounded-md"
          align="start"
        >
          <div className="flex flex-col">
            {config.options.map((option) => (
              <Button
                key={option}
                variant="ghost"
                size="sm"
                className={cn(
                  'justify-start font-normal pl-8 relative',
                  value === option && 'bg-accent font-medium'
                )}
                onClick={() => handleSelect(option)}
              >
                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                  {value === option && <Check className="h-4 w-4" />}
                </span>
                {intervalLabels[option]}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
