'use client'

import {
  format,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
} from 'date-fns'
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
 * Creates UTC midnight for the current day.
 * Used for "Today" preset to ensure hourly charts show 00:00-23:00 UTC,
 * matching the database's UTC-based date_trunc behavior.
 */
function getStartOfDayUTC(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate()
    )
  )
}

/**
 * Creates UTC end of day (23:59:59.999) for the current day.
 * Used for "Today" preset to ensure hourly charts show 00:00-23:00 UTC.
 */
function getEndOfDayUTC(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999
    )
  )
}

/**
 * Creates default presets with dates calculated relative to the current day.
 * Called each time the popover opens to ensure "Today" and relative presets
 * remain accurate across midnight boundaries during long sessions.
 *
 * NOTE: The "Today" preset uses UTC dates to ensure hourly charts display
 * 00:00-23:00 consistently, matching the backend's UTC-based processing.
 * This is a common approach used by analytics platforms.
 */
function createDefaultPresets(): DateRangePreset[] {
  const now = new Date()
  const today = startOfDay(now)

  // Use UTC dates for "Today" to ensure hourly charts show 00:00-23:00 UTC
  const todayUTC = getStartOfDayUTC(now)
  const endOfTodayUTC = getEndOfDayUTC(now)

  return [
    {
      label: 'Today',
      dateRange: { from: todayUTC, to: endOfTodayUTC },
    },
    {
      label: 'Last 7 days',
      dateRange: {
        from: subDays(today, 7),
        to: today,
      },
    },
    {
      label: 'Last 30 days',
      dateRange: {
        from: subDays(today, 30),
        to: today,
      },
    },
    {
      label: 'Last 3 months',
      dateRange: {
        from: subMonths(today, 3),
        to: today,
      },
    },
    {
      label: 'Last 6 months',
      dateRange: {
        from: subMonths(today, 6),
        to: today,
      },
    },
    {
      label: 'Last 12 months',
      dateRange: {
        from: subMonths(today, 12),
        to: today,
      },
    },
    {
      label: 'Month to date',
      dateRange: {
        from: startOfMonth(today),
        to: today,
      },
    },
    {
      label: 'Year to date',
      dateRange: {
        from: startOfYear(today),
        to: today,
      },
    },
  ]
}

/**
 * Checks if two date ranges match (comparing by date string to ignore time).
 */
function dateRangesMatch(
  range1: { from: Date; to: Date },
  range2: { from: Date; to: Date }
): boolean {
  return (
    range1.from.toDateString() === range2.from.toDateString() &&
    range1.to.toDateString() === range2.to.toDateString()
  )
}

/**
 * Finds the matching preset label for a given date range.
 * When multiple presets match (e.g., "Month to date" and "Year to date" in January),
 * prioritizes "Year to date" over "Month to date".
 */
function findMatchingPresetLabel(
  fromDate: Date,
  toDate: Date,
  presets: DateRangePreset[]
): string | null {
  const matches = presets.filter((preset) =>
    dateRangesMatch({ from: fromDate, to: toDate }, preset.dateRange)
  )

  if (matches.length === 0) return null

  // Prioritize "Year to date" over other matches (relevant in January)
  const yearToDate = matches.find((m) => m.label === 'Year to date')
  if (yearToDate) return yearToDate.label

  // Otherwise return the first match
  return matches[0].label
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

  // Track explicitly selected preset label (for when user clicks a preset button)
  // This ensures "Month to date" shows when clicked, even if "Year to date" also matches
  const [selectedPresetLabel, setSelectedPresetLabel] =
    React.useState<string | null>(null)

  // Internal state for in-progress selection
  const [internalRange, setInternalRange] = React.useState<
    DateRange | undefined
  >({
    from: fromDate,
    to: toDate,
  })

  // Generate fresh presets each time the popover opens to ensure current dates
  // (e.g., "Today" stays accurate across midnight boundaries)
  const activePresets = React.useMemo(() => {
    if (presets) return presets
    return createDefaultPresets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presets, open])

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
    // Store the preset label so it shows in the trigger button
    setSelectedPresetLabel(preset.label)
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
      // Clear preset label since user selected custom dates via calendar
      setSelectedPresetLabel(null)
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

  // Generate fresh presets for trigger button display (needs to work when popover is closed)
  const triggerPresets = React.useMemo(() => {
    if (presets) return presets
    return createDefaultPresets()
  }, [presets])

  // Format for trigger button (committed range from props)
  const formatDateRange = () => {
    if (!fromDate) {
      return placeholder
    }
    if (fromDate && !toDate) {
      return format(fromDate, 'd LLL, y')
    }
    if (fromDate && toDate) {
      // First, check if user explicitly selected a preset that still matches
      if (selectedPresetLabel) {
        const selectedPreset = triggerPresets.find(
          (p) => p.label === selectedPresetLabel
        )
        if (
          selectedPreset &&
          dateRangesMatch(
            { from: fromDate, to: toDate },
            selectedPreset.dateRange
          )
        ) {
          return selectedPresetLabel
        }
      }

      // Otherwise, infer the preset label (with Year to date priority)
      const presetLabel = findMatchingPresetLabel(
        fromDate,
        toDate,
        triggerPresets
      )
      if (presetLabel) {
        return presetLabel
      }
      return `${format(fromDate, 'd LLL, y')} - ${format(toDate, 'd LLL, y')}`
    }
    return placeholder
  }

  // Format for footer label (in-progress selection)
  const formatRangeLabel = () => {
    if (!internalRange?.from) {
      return null
    }
    // Show single date if no end date selected yet
    if (!internalRange.to) {
      return format(internalRange.from, 'd MMM, yyyy')
    }
    // Show single date if start and end are the same day
    // (selection in progress or intentional single-day range)
    if (isSameDay(internalRange.from, internalRange.to)) {
      return format(internalRange.from, 'd MMM, yyyy')
    }
    return `${format(internalRange.from, 'd MMM, yyyy')} - ${format(internalRange.to, 'd MMM, yyyy')}`
  }

  // Check if a preset matches the current internal selection
  // When multiple presets match (e.g., "Month to date" and "Year to date" in January),
  // only highlight the explicitly selected one, or default to "Year to date"
  const isPresetActive = (preset: DateRangePreset) => {
    if (!internalRange?.from || !internalRange?.to) return false

    const datesMatch = dateRangesMatch(
      { from: internalRange.from, to: internalRange.to },
      preset.dateRange
    )

    if (!datesMatch) return false

    // Find all presets that match these dates
    const matchingPresets = activePresets.filter((p) =>
      dateRangesMatch(
        { from: internalRange.from!, to: internalRange.to! },
        p.dateRange
      )
    )

    // If only one preset matches, it's active
    if (matchingPresets.length === 1) return true

    // Multiple presets match - check if user explicitly selected this one
    if (selectedPresetLabel) {
      return preset.label === selectedPresetLabel
    }

    // No explicit selection - default to "Year to date" if it matches
    const yearToDateMatches = matchingPresets.some(
      (p) => p.label === 'Year to date'
    )
    if (yearToDateMatches) {
      return preset.label === 'Year to date'
    }

    // Otherwise, first matching preset wins
    return preset.label === matchingPresets[0].label
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

  // Apply same styling as selected range for the preview.
  // Includes hover overrides to prevent ghost button's hover styles from changing colors and border-radius.
  //
  // Border radius uses literal '6px' to match RANGE_BORDER_RADIUS from calendar.tsx.
  // Literal strings are required because Tailwind's JIT cannot detect classes
  // constructed via template literals with variables.
  const previewModifiersClassNames = showPreview
    ? {
        previewRangeStart:
          '[&_button]:bg-primary [&_button]:text-primary-foreground [&_button]:hover:bg-primary [&_button]:hover:text-primary-foreground [&_button]:!rounded-l-[6px] [&_button]:!rounded-r-none [&_button]:hover:!rounded-l-[6px] [&_button]:hover:!rounded-r-none bg-accent rounded-l-[6px]',
        previewRangeMiddle:
          '[&_button]:bg-accent [&_button]:text-accent-foreground [&_button]:hover:bg-accent [&_button]:hover:text-accent-foreground [&_button]:!rounded-none [&_button]:hover:!rounded-none bg-accent',
        previewRangeEnd:
          '[&_button]:bg-primary [&_button]:text-primary-foreground [&_button]:hover:bg-primary [&_button]:hover:text-primary-foreground [&_button]:!rounded-r-[6px] [&_button]:!rounded-l-none [&_button]:hover:!rounded-r-[6px] [&_button]:hover:!rounded-l-none bg-accent rounded-r-[6px]',
      }
    : undefined

  return (
    <div className={cn('grid gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant="ghost"
            className={cn(
              'text-foreground',
              !fromDate && 'text-muted-foreground'
            )}
            disabled={disabled}
          >
            {formatDateRange()}
            <ChevronDown className="ml-auto h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto max-w-[92.5vw] overflow-hidden p-0"
          align="start"
        >
          <div className="flex flex-col sm:flex-row">
            {/* Presets - horizontal scroll on mobile (reversed order), vertical sidebar on desktop */}
            <div className="flex flex-row-reverse h-14 w-full items-center gap-2 border-b border-dashed border-border px-3 overflow-x-auto sm:flex-col sm:h-auto sm:w-auto sm:items-stretch sm:gap-0 sm:border-b-0 sm:border-r sm:px-0 sm:py-2 sm:overflow-visible">
              {activePresets.map((preset) => (
                <Button
                  key={preset.label}
                  variant="outline"
                  size="sm"
                  className={cn(
                    'shrink-0 font-normal sm:border-0 sm:bg-transparent sm:rounded-none sm:justify-start sm:px-5',
                    isPresetActive(preset) && 'font-medium'
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

              {/* Footer with date range and buttons */}
              <div className="border-t border-dashed border-border px-2 py-2 sm:flex sm:items-center sm:justify-between">
                <div className="text-sm text-foreground">
                  {formatRangeLabel()}
                </div>
                <div className="mt-2 flex items-center gap-2 sm:mt-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full bg-popover sm:w-fit"
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
