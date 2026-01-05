'use client'

import { format } from 'date-fns'
import { CalendarIcon, ChevronDown } from 'lucide-react'
import * as React from 'react'
import type { DateRange, Matcher } from 'react-day-picker'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/**
 * Preset type for quick date range selection
 */
export interface DateRangePreset {
  label: string
  dateRange: {
    from: Date
    to: Date
  }
}

/**
 * Creates default presets with fresh dates each time they're accessed.
 * This ensures dates are always current when the picker is opened.
 */
function createDefaultPresets(): DateRangePreset[] {
  const now = new Date()
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  )

  return [
    {
      label: 'Today',
      dateRange: { from: today, to: today },
    },
    {
      label: 'Last 7 days',
      dateRange: {
        from: new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate() - 7
        ),
        to: today,
      },
    },
    {
      label: 'Last 30 days',
      dateRange: {
        from: new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate() - 30
        ),
        to: today,
      },
    },
    {
      label: 'Last 3 months',
      dateRange: {
        from: new Date(
          today.getFullYear(),
          today.getMonth() - 3,
          today.getDate()
        ),
        to: today,
      },
    },
    {
      label: 'Last 6 months',
      dateRange: {
        from: new Date(
          today.getFullYear(),
          today.getMonth() - 6,
          today.getDate()
        ),
        to: today,
      },
    },
    {
      label: 'Month to date',
      dateRange: {
        from: new Date(today.getFullYear(), today.getMonth(), 1),
        to: today,
      },
    },
    {
      label: 'Year to date',
      dateRange: {
        from: new Date(today.getFullYear(), 0, 1),
        to: today,
      },
    },
  ]
}

interface DateRangePickerProps {
  fromDate?: Date
  toDate?: Date
  onSelect: (range?: DateRange) => void
  minDate?: Date
  maxDate?: Date
  className?: string
  placeholder?: string
  disabled?: boolean
  /** Optional custom presets for left sidebar. Uses default presets if not provided. */
  presets?: DateRangePreset[]
}

export function DateRangePicker({
  fromDate,
  toDate,
  onSelect,
  minDate,
  maxDate,
  className,
  placeholder = 'Pick a date range',
  disabled = false,
  presets,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)

  // Internal state for in-progress selection
  const [internalRange, setInternalRange] = React.useState<
    DateRange | undefined
  >({
    from: fromDate,
    to: toDate,
  })

  // Generate presets when popover opens to ensure fresh dates
  const activePresets = React.useMemo(() => {
    if (presets) return presets
    return createDefaultPresets()
  }, [presets])

  // Sync internal state when props change (e.g., external reset)
  React.useEffect(() => {
    setInternalRange({ from: fromDate, to: toDate })
  }, [fromDate, toDate])

  // Reset internal state when popover opens
  React.useEffect(() => {
    if (open) {
      setInternalRange({ from: fromDate, to: toDate })
    }
  }, [open, fromDate, toDate])

  const disabledMatchers: Matcher[] = []
  if (minDate) {
    disabledMatchers.push({ before: minDate })
  }
  if (maxDate) {
    disabledMatchers.push({ after: maxDate })
  }

  const handleSelect = (newRange: DateRange | undefined) => {
    // Only update internal state, don't notify parent yet
    setInternalRange(newRange)
  }

  const handlePresetClick = (preset: DateRangePreset) => {
    // Set the internal range to the preset's date range
    setInternalRange({
      from: preset.dateRange.from,
      to: preset.dateRange.to,
    })
  }

  const handleApply = () => {
    // Only apply if we have a complete range
    if (internalRange?.from && internalRange?.to) {
      onSelect(internalRange)
      setOpen(false)
    }
  }

  const handleCancel = () => {
    // Reset to original values and close
    setInternalRange({ from: fromDate, to: toDate })
    setOpen(false)
  }

  // Format for trigger button (committed range from props)
  const formatDateRange = () => {
    if (!fromDate) {
      return placeholder
    }
    if (fromDate && !toDate) {
      return format(fromDate, 'LLL dd, y')
    }
    if (fromDate && toDate) {
      return `${format(fromDate, 'LLL dd, y')} - ${format(toDate, 'LLL dd, y')}`
    }
    return placeholder
  }

  // Format for footer label (in-progress selection)
  const formatRangeLabel = () => {
    if (!internalRange?.from) {
      return null
    }
    if (internalRange.from && !internalRange.to) {
      return format(internalRange.from, 'dd MMM, yyyy')
    }
    if (internalRange.from && internalRange.to) {
      return `${format(internalRange.from, 'dd MMM, yyyy')} - ${format(internalRange.to, 'dd MMM, yyyy')}`
    }
    return null
  }

  // Check if a preset matches the current internal selection
  const isPresetActive = (preset: DateRangePreset) => {
    if (!internalRange?.from || !internalRange?.to) return false
    return (
      internalRange.from.toDateString() ===
        preset.dateRange.from.toDateString() &&
      internalRange.to.toDateString() ===
        preset.dateRange.to.toDateString()
    )
  }

  // Check if Apply should be enabled
  const canApply = internalRange?.from && internalRange?.to

  return (
    <div className={cn('grid gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant="secondary"
            className={cn(
              'h-8 justify-start text-left font-normal',
              !fromDate && 'text-muted-foreground'
            )}
            disabled={disabled}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {formatDateRange()}
            <ChevronDown className="ml-auto h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto overflow-hidden p-0 rounded-[4px]"
          align="start"
        >
          <div className="flex">
            {/* Left sidebar with presets */}
            <div className="flex flex-col border-r border-border py-2">
              {activePresets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className={cn(
                    'px-3 py-1.5 text-left text-sm hover:bg-accent transition-colors',
                    isPresetActive(preset)
                      ? 'bg-accent font-medium'
                      : 'text-muted-foreground'
                  )}
                  onClick={() => handlePresetClick(preset)}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Right side with calendar and footer */}
            <div className="flex flex-col">
              {/* Two-month calendar view */}
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={internalRange?.from || new Date()}
                selected={internalRange}
                onSelect={handleSelect}
                numberOfMonths={2}
                disabled={disabledMatchers}
                showOutsideDays={false}
              />

              {/* Footer with Range label and buttons */}
              <div className="flex items-center justify-between border-t border-border px-3 py-2">
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Range:
                  </span>
                  {formatRangeLabel() && <> {formatRangeLabel()}</>}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancel}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleApply}
                    disabled={!canApply}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
