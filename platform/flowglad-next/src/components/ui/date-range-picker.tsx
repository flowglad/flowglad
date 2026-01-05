'use client'

import { format, isSameDay } from 'date-fns'
import { ChevronDown } from 'lucide-react'
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
      label: 'Last 12 months',
      dateRange: {
        from: new Date(
          today.getFullYear() - 1,
          today.getMonth(),
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

  // Track if user has started selecting in this session
  // When false, we show the preview and don't pass `selected` to Calendar
  const [hasStartedSelecting, setHasStartedSelecting] =
    React.useState(false)

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

  // Reset internal state and selection mode when popover opens
  React.useEffect(() => {
    if (open) {
      setInternalRange({ from: fromDate, to: toDate })
      setHasStartedSelecting(false) // Reset - user hasn't started selecting yet
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
    // By not passing `selected` to Calendar until hasStartedSelecting is true,
    // react-day-picker handles the selection flow naturally:
    // - First click: sets from date
    // - Second click: sets to date
    // - Third click (complete range): resets and starts new selection
    if (!hasStartedSelecting) {
      setHasStartedSelecting(true)
    }
    setInternalRange(newRange)
  }

  const handlePresetClick = (preset: DateRangePreset) => {
    // Apply preset immediately and close the popover
    onSelect({
      from: preset.dateRange.from,
      to: preset.dateRange.to,
    })
    setOpen(false)
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
    setHasStartedSelecting(false)
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

  // Preview modifiers - show existing range when user hasn't started selecting
  // This gives visual feedback of the current range without affecting selection behavior
  const showPreview = !hasStartedSelecting && fromDate && toDate
  const previewModifiers = showPreview
    ? {
        previewRangeStart: fromDate,
        previewRangeEnd: toDate,
        previewRangeMiddle: (date: Date) => {
          if (!fromDate || !toDate) return false
          // Check if date is between start and end (exclusive)
          return (
            date > fromDate &&
            date < toDate &&
            !isSameDay(date, fromDate) &&
            !isSameDay(date, toDate)
          )
        },
      }
    : undefined

  // Apply same styling as selected range for the preview
  const previewModifiersClassNames = showPreview
    ? {
        previewRangeStart:
          '[&_button]:bg-primary [&_button]:text-primary-foreground [&_button]:!rounded-l bg-accent rounded-l',
        previewRangeMiddle:
          '[&_button]:bg-accent [&_button]:text-accent-foreground [&_button]:!rounded-none bg-accent',
        previewRangeEnd:
          '[&_button]:bg-primary [&_button]:text-primary-foreground [&_button]:!rounded-r bg-accent rounded-r',
      }
    : undefined

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
            {formatDateRange()}
            <ChevronDown className="ml-auto h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto max-w-[92.5vw] overflow-hidden p-0 rounded-md"
          align="start"
        >
          <div className="flex flex-col sm:flex-row">
            {/* Presets - horizontal scroll on mobile, vertical sidebar on desktop */}
            <div className="flex h-14 w-full items-center gap-2 border-b border-border px-3 overflow-x-auto sm:h-auto sm:w-auto sm:flex-col sm:items-stretch sm:gap-0 sm:border-b-0 sm:border-r sm:px-0 sm:py-2 sm:overflow-visible">
              {activePresets.map((preset) => (
                <Button
                  key={preset.label}
                  variant="outline"
                  size="sm"
                  className={cn(
                    'shrink-0 font-normal sm:border-0 sm:bg-transparent sm:rounded-none sm:justify-start',
                    isPresetActive(preset) && 'font-medium bg-accent'
                  )}
                  onClick={() => handlePresetClick(preset)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            {/* Right side with calendar and footer */}
            <div className="flex flex-col">
              {/* Two-month calendar view - horizontally scrollable on mobile */}
              <div className="overflow-x-auto">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={internalRange?.from || new Date()}
                  // Only pass selected once user starts selecting
                  // This lets react-day-picker handle fresh selections naturally
                  selected={
                    hasStartedSelecting ? internalRange : undefined
                  }
                  onSelect={handleSelect}
                  numberOfMonths={2}
                  disabled={disabledMatchers}
                  showOutsideDays={false}
                  // Show existing range as preview (same styling, no click impact)
                  modifiers={previewModifiers}
                  modifiersClassNames={previewModifiersClassNames}
                />
              </div>

              {/* Footer with Range label and buttons */}
              <div className="border-t border-border px-3 py-2 sm:flex sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Range:
                  </span>
                  {formatRangeLabel() && <> {formatRangeLabel()}</>}
                </div>
                <div className="mt-2 flex items-center gap-2 sm:mt-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full sm:w-fit"
                    onClick={handleCancel}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="w-full sm:w-fit"
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
