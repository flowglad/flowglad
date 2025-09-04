'use client'

import * as React from 'react'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { CalendarIcon, ChevronDown } from 'lucide-react'
import { format } from 'date-fns'
import { DateRange } from 'react-day-picker'
import { cn } from '@/lib/utils'

interface DateRangePickerProps {
  fromDate: Date
  toDate?: Date
  onSelect: (range?: DateRange) => void
  minDate?: Date
  maxDate?: Date
  className?: string
}

export function DateRangePicker({
  fromDate,
  toDate,
  onSelect,
  minDate,
  maxDate,
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)

  const disabledMatchers = []
  if (minDate) {
    disabledMatchers.push({ before: minDate })
  }
  if (maxDate) {
    disabledMatchers.push({ after: maxDate })
  }

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="justify-start text-left font-normal"
          >
            <CalendarIcon className="w-4 h-4 mr-2" />
            {format(fromDate, 'PPP')} -{' '}
            {toDate ? format(toDate, 'PPP') : 'Present'}
            <ChevronDown className="w-4 h-4 ml-2" strokeWidth={2} />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0"
          align="end"
          sideOffset={12}
        >
          <Calendar
            mode="range"
            selected={{ from: fromDate, to: toDate }}
            onSelect={(range) => {
              onSelect(range)
              if (range?.from && range?.to) {
                setOpen(false)
              }
            }}
            disabled={disabledMatchers}
            className="group"
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
