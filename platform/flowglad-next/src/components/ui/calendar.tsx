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
 * Calendar design tokens - centralized magic values for easy customization.
 */

/** CSS variable name for cell size (used throughout the calendar) */
const CELL_SIZE_VAR = '--cell-size'

/** Default cell size value */
const DEFAULT_CELL_SIZE = '2.25rem'

/** Border radius for range selection corners */
const RANGE_BORDER_RADIUS = '6px'

/** Size of navigation chevron icons */
const CHEVRON_ICON_SIZE = 'size-4'

/**
 * Day button style constants broken into logical groups for maintainability.
 * These styles control the appearance of individual day cells in the calendar.
 */

/** Layout and typography styles for day buttons */
const dayButtonBaseStyles = [
  `flex aspect-square h-auto w-full min-w-[${CELL_SIZE_VAR}] flex-col gap-1`,
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
  `hover:!rounded-[${RANGE_BORDER_RADIUS}]`,
  // Range start: round left, keep right square
  `data-[range-start=true]:!rounded-l-[${RANGE_BORDER_RADIUS}]`,
  'data-[range-start=true]:!rounded-r-none',
  `data-[range-start=true]:hover:!rounded-l-[${RANGE_BORDER_RADIUS}]`,
  'data-[range-start=true]:hover:!rounded-r-none',
  // Range end (but not also start): round right, keep left square
  `data-[range-end=true]:data-[range-start=false]:!rounded-r-[${RANGE_BORDER_RADIUS}]`,
  'data-[range-end=true]:data-[range-start=false]:!rounded-l-none',
  `data-[range-end=true]:data-[range-start=false]:hover:!rounded-r-[${RANGE_BORDER_RADIUS}]`,
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

/**
 * Builds the classNames object for DayPicker, organized by functional area.
 * This separation makes it easier to understand, modify, and extend specific parts.
 */
function buildCalendarClassNames(
  defaultClassNames: ReturnType<typeof getDefaultClassNames>,
  buttonVariant: React.ComponentProps<typeof Button>['variant'],
  captionLayout: React.ComponentProps<
    typeof DayPicker
  >['captionLayout']
) {
  // ─────────────────────────────────────────────────────────────────────────────
  // Layout: Root container and month grid structure
  // ─────────────────────────────────────────────────────────────────────────────
  const layoutClassNames = {
    root: cn('w-fit', defaultClassNames.root),
    months: cn(
      'relative flex flex-row gap-4',
      defaultClassNames.months
    ),
    month: cn('flex w-full flex-col gap-4', defaultClassNames.month),
    table: 'w-full border-collapse',
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Navigation: Previous/next month buttons
  // ─────────────────────────────────────────────────────────────────────────────
  const navClassNames = {
    nav: cn(
      'absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1',
      defaultClassNames.nav
    ),
    button_previous: cn(
      buttonVariants({ variant: buttonVariant }),
      `h-[${CELL_SIZE_VAR}] w-[${CELL_SIZE_VAR}] select-none p-0 aria-disabled:opacity-50`,
      defaultClassNames.button_previous
    ),
    button_next: cn(
      buttonVariants({ variant: buttonVariant }),
      `h-[${CELL_SIZE_VAR}] w-[${CELL_SIZE_VAR}] select-none p-0 aria-disabled:opacity-50`,
      defaultClassNames.button_next
    ),
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Caption: Month/year header and dropdowns
  // ─────────────────────────────────────────────────────────────────────────────
  const captionClassNames = {
    month_caption: cn(
      `flex h-[${CELL_SIZE_VAR}] w-full items-center justify-center px-[${CELL_SIZE_VAR}]`,
      defaultClassNames.month_caption
    ),
    dropdowns: cn(
      `flex h-[${CELL_SIZE_VAR}] w-full items-center justify-center gap-1.5 text-sm font-medium`,
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
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Week Grid: Weekday headers and week rows
  // ─────────────────────────────────────────────────────────────────────────────
  const weekGridClassNames = {
    weekdays: cn('flex mb-2', defaultClassNames.weekdays),
    weekday: cn(
      'text-muted-foreground flex-1 select-none rounded-md text-[0.75rem] font-normal',
      defaultClassNames.weekday
    ),
    week: cn('flex w-full', defaultClassNames.week),
    week_number_header: cn(
      `w-[${CELL_SIZE_VAR}] select-none`,
      defaultClassNames.week_number_header
    ),
    week_number: cn(
      'text-muted-foreground select-none text-[0.8rem]',
      defaultClassNames.week_number
    ),
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Day Cell: Individual day container styling
  // ─────────────────────────────────────────────────────────────────────────────
  const dayCellClassNames = {
    day: cn(
      `group/day relative aspect-square h-full w-full select-none p-0 text-center [&:first-child[data-selected=true]_button]:rounded-l-[${RANGE_BORDER_RADIUS}] [&:last-child[data-selected=true]_button]:rounded-r-[${RANGE_BORDER_RADIUS}]`,
      defaultClassNames.day
    ),
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Range Selection: Styling for date range start/middle/end
  // ─────────────────────────────────────────────────────────────────────────────
  const rangeClassNames = {
    range_start: cn(
      `bg-accent rounded-l-[${RANGE_BORDER_RADIUS}]`,
      defaultClassNames.range_start
    ),
    range_middle: cn('rounded-none', defaultClassNames.range_middle),
    range_end: cn(
      `bg-accent rounded-r-[${RANGE_BORDER_RADIUS}]`,
      defaultClassNames.range_end
    ),
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Day States: Today, outside month, disabled, hidden
  // ─────────────────────────────────────────────────────────────────────────────
  const dayStateClassNames = {
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
  }

  return {
    ...layoutClassNames,
    ...navClassNames,
    ...captionClassNames,
    ...weekGridClassNames,
    ...dayCellClassNames,
    ...rangeClassNames,
    ...dayStateClassNames,
  }
}

/**
 * A customizable calendar component built on react-day-picker.
 *
 * Supports single date selection, date ranges, and multiple date selection modes.
 * Styling is handled via CSS custom properties and data attributes for flexibility.
 *
 * @example
 * ```tsx
 * // Single date selection
 * <Calendar mode="single" selected={date} onSelect={setDate} />
 *
 * // Date range selection
 * <Calendar mode="range" selected={dateRange} onSelect={setDateRange} />
 * ```
 *
 * @param showOutsideDays - Whether to show days from adjacent months (default: true)
 * @param captionLayout - Layout of the month/year caption: 'label' | 'dropdown' | 'dropdown-months' | 'dropdown-years'
 * @param buttonVariant - Variant for navigation buttons (default: 'ghost')
 */
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
  const calendarClassNames = buildCalendarClassNames(
    defaultClassNames,
    buttonVariant,
    captionLayout
  )

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        `group/calendar p-3 [${CELL_SIZE_VAR}:${DEFAULT_CELL_SIZE}]`,
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
        ...calendarClassNames,
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
                className={cn(CHEVRON_ICON_SIZE, className)}
                {...props}
              />
            )
          }

          if (orientation === 'right') {
            return (
              <ChevronRightIcon
                className={cn(CHEVRON_ICON_SIZE, className)}
                {...props}
              />
            )
          }

          return (
            <ChevronDownIcon
              className={cn(CHEVRON_ICON_SIZE, className)}
              {...props}
            />
          )
        },
        DayButton: CalendarDayButton,
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div
                className={`flex size-[${CELL_SIZE_VAR}] items-center justify-center text-center`}
              >
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

/**
 * Custom day button component that handles selection styling via data attributes.
 *
 * This component uses data attributes instead of conditional class application
 * to enable CSS-only styling based on selection state. This approach:
 * - Keeps styling logic in CSS (see dayButtonStyles constants)
 * - Allows for easier theming and customization
 * - Reduces JavaScript re-renders on selection changes
 *
 * ## Data Attributes
 *
 * The following data attributes are set based on react-day-picker modifiers:
 *
 * - `data-day` - The localized date string for accessibility/testing
 * - `data-selected-single` - `true` when day is selected but NOT part of a range
 *   (i.e., single date selection mode or a one-day range)
 * - `data-range-start` - `true` for the first day of a selected range
 * - `data-range-end` - `true` for the last day of a selected range
 * - `data-range-middle` - `true` for days between range start and end
 *
 * ## Selection State Logic
 *
 * ```
 * Single selection:  [selected-single=true]
 * Range (1 day):     [range-start=true][range-end=true]
 * Range (multi):     [range-start] ... [range-middle] ... [range-end]
 * ```
 */
function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames()

  const ref = React.useRef<HTMLButtonElement>(null)

  // Sync focus state from react-day-picker's keyboard navigation
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  /**
   * Determines if this is a single-day selection (not part of a range).
   * This is true when: selected AND NOT (range_start OR range_end OR range_middle)
   */
  const isSelectedSingle =
    modifiers.selected &&
    !modifiers.range_start &&
    !modifiers.range_end &&
    !modifiers.range_middle

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={isSelectedSingle}
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
