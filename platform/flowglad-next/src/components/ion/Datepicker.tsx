// Generated with Ion on 10/11/2024, 4:12:37 AM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=3690:18567
// ion/DatePicker: Generated with Ion on 10/11/2024, 4:12:34 AM
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
import Hint from '@/components/ion/Hint'
import {
  inputClassNames,
  inputContainerClasses,
} from '@/components/ion/Input'
import Label from '@/components/ion/Label'
import { Popover, PopoverContent, PopoverTrigger } from './Popover'
import Button from './Button'
import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react'
import core from '@/utils/core'

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
    if (dayPickerProps.selected !== value) {
      onSelect?.(dayPickerProps.selected)
    }
  }, [dayPickerProps.selected, onSelect])

  return (
    <div className={className}>
      {label && (
        <Label
          id={`${id}__label`}
          htmlFor={id}
          required={required}
          helper={helper}
          disabled={props.disabled}
          className="mb-1"
        >
          {label}
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
          <span
            className={twMerge(
              clsx(
                inputContainerClasses({
                  error,
                  disabled: props.disabled,
                }),
                'bg-background-input group-focus-within:primary-focus group-focus:primary-focus',
                inputFocused && 'primary-focus'
              )
            )}
          >
            {iconLeading}
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
              className={inputClassNames}
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
            {iconTrailing}
          </span>
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
        <Hint
          id={`${id}__hint`}
          error={error}
          className="mt-1"
          showIcon={showHintIcon}
          disabled={props.disabled}
        >
          {hint}
        </Hint>
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
        <Label
          id={`${id}__label`}
          htmlFor={id}
          required={required}
          helper={helper}
          disabled={props.disabled}
          className="mb-1"
        >
          {label}
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
            // onClick={jan2024Dec2024ClickHandler}
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
        <Hint
          id={`${id}__hint`}
          error={error}
          className="mt-1"
          showIcon={showHintIcon}
          disabled={props.disabled}
        >
          {hint}
        </Hint>
      )}
    </div>
  )
}

export default Datepicker
