'use client'

import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from 'lucide-react'
import * as React from 'react'
import {
  type DayButton,
  DayPicker,
  getDefaultClassNames,
} from 'react-day-picker'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Day button style constants broken into logical groups for maintainability.
 * These styles control the appearance of individual day cells in the calendar.
 */

/** Layout and typography styles for day buttons */
const dayButtonBaseStyles = [
  'flex aspect-square h-auto w-full min-w-[--cell-size] flex-col gap-1',
  'font-normal leading-none',
  '!transition-none',
].join(' ')

/** Styles for selected states (single selection and range endpoints) */
const dayButtonSelectionStyles = [
  // Single day selection (not part of a range)
  'data-[selected-single=true]:bg-primary',
  'data-[selected-single=true]:text-primary-foreground',
  // Range start
  'data-[range-start=true]:bg-primary',
  'data-[range-start=true]:text-primary-foreground',
  // Range middle
  'data-[range-middle=true]:bg-accent',
  'data-[range-middle=true]:text-accent-foreground',
  // Range end
  'data-[range-end=true]:bg-primary',
  'data-[range-end=true]:text-primary-foreground',
].join(' ')

/**
 * Border radius styles for range selection.
 * - Default: square corners, rounded on hover
 * - Range start: rounded left corners only
 * - Range end: rounded right corners only (unless also range start)
 * - Range middle: always square corners
 */
const dayButtonBorderRadiusStyles = [
  // Default behavior
  '!rounded-none',
  'hover:!rounded-[6px]',
  // Range start: round left, keep right square
  'data-[range-start=true]:!rounded-l-[6px]',
  'data-[range-start=true]:!rounded-r-none',
  'data-[range-start=true]:hover:!rounded-l-[6px]',
  'data-[range-start=true]:hover:!rounded-r-none',
  // Range end (but not also start): round right, keep left square
  'data-[range-end=true]:data-[range-start=false]:!rounded-r-[6px]',
  'data-[range-end=true]:data-[range-start=false]:!rounded-l-none',
  'data-[range-end=true]:data-[range-start=false]:hover:!rounded-r-[6px]',
  'data-[range-end=true]:data-[range-start=false]:hover:!rounded-l-none',
  // Range middle: always square
  'data-[range-middle=true]:!rounded-none',
  'data-[range-middle=true]:hover:!rounded-none',
].join(' ')

/** Styles for child span elements within day buttons */
const dayButtonChildStyles = '[&>span]:text-xs [&>span]:opacity-70'

/** Combined day button styles */
const dayButtonStyles = [
  dayButtonBaseStyles,
  dayButtonSelectionStyles,
  dayButtonBorderRadiusStyles,
  dayButtonChildStyles,
].join(' ')

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = 'label',
  buttonVariant = 'ghost',
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>['variant']
}) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        'group/calendar p-3 [--cell-size:2.25rem]',
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString('default', { month: 'short' }),
        formatWeekdayName: (date) =>
          date.toLocaleString('default', { weekday: 'short' }),
        ...formatters,
      }}
      classNames={{
        root: cn('w-fit', defaultClassNames.root),
        months: cn(
          'relative flex flex-row gap-4',
          defaultClassNames.months
        ),
        month: cn(
          'flex w-full flex-col gap-4',
          defaultClassNames.month
        ),
        nav: cn(
          'absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1',
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          'h-[--cell-size] w-[--cell-size] select-none p-0 aria-disabled:opacity-50',
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          'h-[--cell-size] w-[--cell-size] select-none p-0 aria-disabled:opacity-50',
          defaultClassNames.button_next
        ),
        month_caption: cn(
          'flex h-[--cell-size] w-full items-center justify-center px-[--cell-size]',
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          'flex h-[--cell-size] w-full items-center justify-center gap-1.5 text-sm font-medium',
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          'has-focus:border-ring border-input shadow-xs has-focus:ring-ring/50 has-focus:ring-[3px] relative rounded-md border',
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          'bg-popover absolute inset-0 opacity-0',
          defaultClassNames.dropdown
        ),
        caption_label: cn(
          'select-none font-medium',
          captionLayout === 'label'
            ? 'text-sm'
            : '[&>svg]:text-muted-foreground flex h-8 items-center gap-1 rounded-md pl-2 pr-1 text-sm [&>svg]:size-3.5',
          defaultClassNames.caption_label
        ),
        table: 'w-full border-collapse',
        weekdays: cn('flex mb-2', defaultClassNames.weekdays),
        weekday: cn(
          'text-muted-foreground flex-1 select-none rounded-md text-[0.75rem] font-normal',
          defaultClassNames.weekday
        ),
        week: cn('flex w-full', defaultClassNames.week),
        week_number_header: cn(
          'w-[--cell-size] select-none',
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          'text-muted-foreground select-none text-[0.8rem]',
          defaultClassNames.week_number
        ),
        day: cn(
          'group/day relative aspect-square h-full w-full select-none p-0 text-center [&:first-child[data-selected=true]_button]:rounded-l-[6px] [&:last-child[data-selected=true]_button]:rounded-r-[6px]',
          defaultClassNames.day
        ),
        range_start: cn(
          'bg-accent rounded-l-[6px]',
          defaultClassNames.range_start
        ),
        range_middle: cn(
          'rounded-none',
          defaultClassNames.range_middle
        ),
        range_end: cn(
          'bg-accent rounded-r-[6px]',
          defaultClassNames.range_end
        ),
        today: cn(
          'underline underline-offset-4 decoration-primary',
          defaultClassNames.today
        ),
        outside: cn(
          'text-muted-foreground aria-selected:text-muted-foreground',
          defaultClassNames.outside
        ),
        disabled: cn(
          'text-muted-foreground opacity-50',
          defaultClassNames.disabled
        ),
        hidden: cn('invisible', defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          )
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === 'left') {
            return (
              <ChevronLeftIcon
                className={cn('size-4', className)}
                {...props}
              />
            )
          }

          if (orientation === 'right') {
            return (
              <ChevronRightIcon
                className={cn('size-4', className)}
                {...props}
              />
            )
          }

          return (
            <ChevronDownIcon
              className={cn('size-4', className)}
              {...props}
            />
          )
        },
        DayButton: CalendarDayButton,
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-[--cell-size] items-center justify-center text-center">
                {children}
              </div>
            </td>
          )
        },
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames()

  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        dayButtonStyles,
        defaultClassNames.day,
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
