'use client'

import { format } from 'date-fns'
import { CalendarIcon, ChevronDown } from 'lucide-react'
import * as React from 'react'
import type { DateRange } from 'react-day-picker'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface DateRangePickerProps {
  fromDate?: Date
  toDate?: Date
  onSelect: (range?: DateRange) => void
  minDate?: Date
  maxDate?: Date
  className?: string
  placeholder?: string
  disabled?: boolean
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
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)

  // Current selected range from props
  const selectedRange: DateRange | undefined = React.useMemo(
    () => ({
      from: fromDate,
      to: toDate,
    }),
    [fromDate, toDate]
  )

  const disabledMatchers = []
  if (minDate) {
    disabledMatchers.push({ before: minDate })
  }
  if (maxDate) {
    disabledMatchers.push({ after: maxDate })
  }

  const handleSelect = (newRange: DateRange | undefined) => {
    onSelect(newRange)
    // Close the popover when both dates are selected
    if (newRange?.from && newRange?.to) {
      setOpen(false)
    }
  }

  const formatDateRange = () => {
    if (!selectedRange?.from) {
      return placeholder
    }

    if (selectedRange.from && !selectedRange.to) {
      return format(selectedRange.from, 'LLL dd, y')
    }

    if (selectedRange.from && selectedRange.to) {
      return `${format(selectedRange.from, 'LLL dd, y')} - ${format(selectedRange.to, 'LLL dd, y')}`
    }

    return placeholder
  }

  return (
    <div className={cn('grid gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant="secondary"
            className={cn(
              'w-[300px] justify-start text-left font-normal',
              !selectedRange?.from && 'text-muted-foreground'
            )}
            disabled={disabled}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {formatDateRange()}
            <ChevronDown className="ml-auto h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto overflow-hidden p-0 rounded-[4px] bg-card"
          align="start"
        >
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={selectedRange?.from || new Date()}
            selected={selectedRange}
            onSelect={handleSelect}
            numberOfMonths={1}
            disabled={disabledMatchers}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
