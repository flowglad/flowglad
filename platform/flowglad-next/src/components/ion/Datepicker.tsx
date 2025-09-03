// Generated with Ion on 10/11/2024, 4:12:37 AM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=3690:18567
// ion/DatePicker: Migrated to use shadcn input directly
import clsx from 'clsx'
import React, { useEffect, useRef } from 'react'
import {
  DateRange,
  Matcher,
  type UseInputOptions,
  useInput,
} from 'react-day-picker'
import { twMerge } from 'tailwind-merge'

import { Calendar } from './Calendar'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from './Popover'
import { MigrationButton as Button } from '@/components/ui/button-migration'
import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react'
import core from '@/utils/core'
import { cn } from '@/utils/core'

/* ---------------------------------- Type --------------------------------- */

export interface DatePickerProps {
  /** HTML ID of the input */
  id?: string
  /** Selected date */
  value?: Date | undefined
  /** Icon to the left of the datepicker text */
  iconLeading?: React.ReactNode
  /** Icon to the right of the datepicker text */
  iconTrailing?: React.ReactNode
  /** Label of the datepicker */
  label?: string
  /** Helper text, to the right of the label */
  helper?: string
  /** Hint/description below the datepicker */
  hint?: string
  /** Display hint icon to the left of the hint
   * @default false
   */
  showHintIcon?: boolean
  /** Display the datepicker with an error state */
  error?: boolean
  /** Display required mark to the right of the label */
  required?: boolean
  /** Display the datepicker with a disabled state */
  disabled?: boolean
  /** Placeholder of the datepicker */
  placeholder?: string
  /** Classname of the datepicker container (use this to position the datepicker) */
  className?: string
  /** Classname of the datepicker input (use this to restyle the datepicker) */
  inputClassName?: string
  onSelect?: (date: Date | undefined) => void
  mode?: 'single' | 'range'
  minDate?: Date
  maxDate?: Date
}

/* ---------------------------------- Component --------------------------------- */

function Datepicker({
  error,
  value,
  onSelect,
  format = 'PP',
  iconLeading,
  iconTrailing,
  label,
  helper,
  required,
  hint,
  showHintIcon = false,
  className,
  placeholder,
  mode = 'single',
  minDate,
  maxDate,
  ...props
}: UseInputOptions & DatePickerProps) {
  const generatedId = React.useId()
  const id = props.id || generatedId
  const ariaInvalid = !!error
  const inputRef = useRef<HTMLInputElement>(null)
  const [inputFocused, setInputFocused] = React.useState(false)
  const [datePickerOpen, setDatePickerOpen] = React.useState(false)
  const { inputProps, dayPickerProps, setSelected } = useInput({
    ...props,
    format,
    defaultSelected: value ?? undefined,
  })
  const disabledMatchers: Matcher[] = []
  if (minDate) {
    disabledMatchers.push({ before: minDate })
  }
  if (maxDate) {
    disabledMatchers.push({ after: maxDate })
  }
  useEffect(() => {
    const selectedDate = dayPickerProps.selected as Date | undefined
    // Check if dates are the same to prevent infinite loop:
    // - First check: same object reference (fast path)
    // - Second check: same date value (handles different Date objects for same date)
    // Without this, Date objects with same value but different references would
    // continuously trigger onSelect, causing infinite re-renders
    const isSameDate =
      selectedDate === value ||
      (!!selectedDate &&
        !!value &&
        selectedDate.getTime() === value.getTime())
    if (!isSameDate) {
      onSelect?.(selectedDate)
    }
  }, [dayPickerProps.selected, onSelect, value])

  return (
    <div className={className}>
      {label && (
        <Label htmlFor={id} className="mb-1">
          {label}
          {required && (
            <span className="text-destructive ml-1">*</span>
          )}
          {helper && (
            <span className="text-muted-foreground ml-2 text-sm">
              {helper}
            </span>
          )}
        </Label>
      )}
      <Popover
        open={datePickerOpen}
        onOpenChange={(open) => {
          setDatePickerOpen(open)
          if (!open) {
            inputRef.current?.focus()
          }
        }}
      >
        <PopoverTrigger asChild>
          <div
            className={cn(
              'relative flex items-center w-full rounded-md border px-3 text-sm transition-all h-9',
              'bg-input hover:border-input focus-within:ring-2 focus-within:ring-ring focus-within:border-ring',
              {
                'border-destructive focus-within:ring-destructive':
                  error,
                'border-input': !error,
                'opacity-50 cursor-not-allowed': props.disabled,
              },
              inputFocused && 'ring-2 ring-ring border-ring'
            )}
          >
            {iconLeading && (
              <div className="absolute left-3 flex items-center text-muted-foreground z-10">
                {iconLeading}
              </div>
            )}
            <input
              id={id}
              aria-required={required}
              aria-invalid={ariaInvalid}
              aria-describedby={hint ? `${id}__hint` : undefined}
              aria-label={
                !label
                  ? inputProps.value
                    ? 'Change date'
                    : 'Choose date'
                  : undefined
              }
              className={cn(
                'h-full w-full flex-shrink bg-transparent focus:outline-none focus:ring-0 focus:ring-offset-0 disabled:pointer-events-none placeholder:text-muted-foreground disabled:text-muted-foreground/50 border-none px-0 text-sm',
                iconLeading && 'pl-10',
                iconTrailing && 'pr-10'
              )}
              ref={inputRef}
              onChange={(e) => {
                inputProps.onChange?.(e)
                /**
                 * Hard assuming that if you provide an onSelect, you're
                 * going to handle date state yourself
                 */
                if (onSelect) {
                  onSelect(new Date(e.target.value))
                } else {
                  setSelected(new Date(e.target.value))
                }
              }}
              onFocus={() => setInputFocused(true)}
              onBlurCapture={() => setInputFocused(false)}
              onKeyDown={(e) => {
                if (e.key === 'Tab') {
                  setDatePickerOpen(false)
                }
                if (e.key === 'Enter') {
                  e.preventDefault()
                  setDatePickerOpen(true)
                }
              }}
              placeholder={placeholder}
              disabled={props.disabled}
              {...inputProps}
            />
            {iconTrailing && (
              <div className="absolute right-3 flex items-center text-muted-foreground z-10">
                {iconTrailing}
              </div>
            )}
          </div>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto px-5 py-8 border border-stroke-strong"
          align="end"
          sideOffset={12}
        >
          {mode === 'single' ? (
            <Calendar
              mode="single"
              onDayFocus={() => setInputFocused(true)}
              onDayBlur={() => {
                setInputFocused(false)
              }}
              onSelect={(date) => {
                onSelect?.(date)
              }}
              disabled={disabledMatchers}
              className="group"
              initialFocus
              {...dayPickerProps}
            />
          ) : (
            <></>
          )}
        </PopoverContent>
      </Popover>
      {hint && (
        <p
          id={`${id}__hint`}
          className={cn('mt-1 text-sm', {
            'text-destructive': error,
            'text-muted-foreground': !error,
            'text-muted-foreground/50': props.disabled,
          })}
        >
          {hint}
        </p>
      )}
    </div>
  )
}

interface DateRangePickerProps
  extends Omit<DatePickerProps, 'onSelect'> {
  fromDate: Date
  toDate?: Date
  onSelect: (range?: DateRange) => void
  mode: 'range'
}

export const DateRangePicker = ({
  error,
  value,
  onSelect,
  format = 'PP',
  iconLeading,
  iconTrailing,
  label,
  helper,
  required,
  hint,
  showHintIcon = false,
  className,
  placeholder,
  mode = 'range',
  fromDate,
  toDate,
  minDate,
  maxDate,
  ...props
}: UseInputOptions & DateRangePickerProps) => {
  const generatedId = React.useId()
  const id = props.id || generatedId
  const inputRef = useRef<HTMLInputElement>(null)
  const [datePickerOpen, setDatePickerOpen] = React.useState(false)
  const disabledMatchers: Matcher[] = []
  if (minDate) {
    disabledMatchers.push({ before: minDate })
  }
  if (maxDate) {
    disabledMatchers.push({ after: maxDate })
  }
  return (
    <div className={className}>
      {label && (
        <Label htmlFor={id} className="mb-1">
          {label}
          {required && (
            <span className="text-destructive ml-1">*</span>
          )}
          {helper && (
            <span className="text-muted-foreground ml-2 text-sm">
              {helper}
            </span>
          )}
        </Label>
      )}
      <Popover
        open={datePickerOpen}
        onOpenChange={(open) => {
          setDatePickerOpen(open)
          if (!open) {
            inputRef.current?.focus()
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            iconLeading={<CalendarIcon size={16} />}
            iconTrailing={<ChevronDown size={16} strokeWidth={2} />}
            variant="outline"
            color="primary"
            size="sm"
          >
            {core.formatDate(fromDate)} -{' '}
            {toDate ? core.formatDate(toDate) : 'Present'}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto px-5 py-8 border border-stroke-strong"
          align="end"
          sideOffset={12}
        >
          <Calendar
            mode="range"
            selected={{ from: fromDate, to: toDate }}
            onSelect={(range) => {
              onSelect(range)
            }}
            disabled={disabledMatchers}
            className="group"
            initialFocus
          />
        </PopoverContent>
      </Popover>
      {hint && (
        <p
          id={`${id}__hint`}
          className={cn('mt-1 text-sm', {
            'text-destructive': error,
            'text-muted-foreground': !error,
            'text-muted-foreground/50': props.disabled,
          })}
        >
          {hint}
        </p>
      )}
    </div>
  )
}

export default Datepicker
