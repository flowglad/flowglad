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
 * @fileoverview A customizable calendar component built on react-day-picker.
 *
 * ## Architecture Overview
 *
 * This calendar uses a **dual-layer styling system** to achieve smooth, connected
 * visual effects for date range selections:
 *
 * ### Layer 1: Cell Container (the `<td>` element)
 * - Controlled by `rangeClassNames` in `buildCalendarClassNames()`
 * - Creates the continuous background strip that visually connects range days
 * - Applies `bg-accent` to create the "highlight bar" effect
 * - Handles border-radius at row boundaries (first/last cells)
 *
 * ### Layer 2: Day Button (the `<button>` inside each cell)
 * - Controlled by `dayButtonSelectionStyles` and `dayButtonBorderRadiusStyles`
 * - Applies via data attributes set in `CalendarDayButton`
 * - Range endpoints (start/end) get `bg-primary` to stand out from the strip
 * - Range middle days get `bg-accent` to blend with the cell background
 * - Handles border-radius for individual day buttons
 *
 * ### Why Two Layers?
 *
 * ```
 * Visual result of a 5-day range selection:
 *
 * Cell layer:    [accent][accent][accent][accent][accent]  ← continuous strip
 * Button layer:  [PRIMARY][ - ][ - ][ - ][PRIMARY]         ← endpoints highlighted
 *
 * Combined:      [■■■■■][░░░░░][░░░░░][░░░░░][■■■■■]
 *                 start  middle middle middle  end
 * ```
 *
 * The cell layer provides the connected background, while the button layer
 * adds emphasis to the endpoints. This separation allows for:
 * - Smooth visual connection between days (no gaps in the highlight)
 * - Clear indication of range boundaries
 * - Proper hover effects on individual days without breaking the strip
 *
 * ## Pre-Selected / Initial Ranges
 *
 * When a date range is passed via the `selected` prop at mount time, the same
 * styling system applies automatically. react-day-picker provides `modifiers`
 * (range_start, range_middle, range_end) for each day based on the selection,
 * and our styling responds to these modifiers identically whether the range
 * was just clicked or was pre-selected.
 *
 * @example
 * ```tsx
 * // Pre-selected range - styling is applied immediately on render
 * <Calendar
 *   mode="range"
 *   selected={{ from: new Date('2024-01-15'), to: new Date('2024-01-20') }}
 *   onSelect={setDateRange}
 * />
 * ```
 *
 * ## Data Attribute System
 *
 * Rather than computing class names conditionally in JavaScript, we set data
 * attributes on buttons and use CSS attribute selectors. This approach:
 * - Keeps styling logic in CSS (easier to customize via classNames prop)
 * - Reduces JavaScript computation on selection changes
 * - Makes the styling rules inspectable in browser dev tools
 *
 * @see CalendarDayButton for the data attribute implementation
 * @see dayButtonSelectionStyles for the CSS attribute selectors
 */

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Centralized design tokens for easy customization.
 * These values control sizing, spacing, and visual properties throughout the calendar.
 */

/** CSS variable name for cell size (used throughout the calendar) */
const CELL_SIZE_VAR = '--cell-size'

/** Default cell size value (36px) */
const DEFAULT_CELL_SIZE = '2.25rem'

/** Border radius for range selection corners */
export const RANGE_BORDER_RADIUS = '6px'

/** Size of navigation chevron icons */
const CHEVRON_ICON_SIZE = 'size-4'

// ═══════════════════════════════════════════════════════════════════════════════
// DAY BUTTON STYLES (Layer 2 of dual-layer system)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Day button style constants - Layer 2 of the dual-layer styling system.
 *
 * These styles are applied to the `<button>` element inside each day cell.
 * They work in conjunction with `rangeClassNames` (Layer 1) to create the
 * complete range selection visual effect.
 *
 * @see rangeClassNames in buildCalendarClassNames() for Layer 1 (cell container)
 */

/** Layout and typography styles for day buttons */
const dayButtonBaseStyles = [
  `flex aspect-square h-auto w-full min-w-[${CELL_SIZE_VAR}] flex-col gap-1`,
  'font-normal leading-none',
  '!transition-none',
].join(' ')

/**
 * Selection state styles for day buttons - the key part of Layer 2.
 *
 * These use CSS attribute selectors to style buttons based on data attributes
 * set by CalendarDayButton. The data attributes are derived from react-day-picker's
 * modifiers, which are computed from the `selected` prop (whether user-clicked
 * or pre-selected at mount).
 *
 * Color scheme:
 * - `bg-primary`: Used for single selections and range endpoints (start/end)
 * - `bg-accent`: Used for range middle days (blends with cell background)
 *
 * @see CalendarDayButton for how data attributes are set
 * @see rangeClassNames for the cell-level styling (Layer 1)
 */
const dayButtonSelectionStyles = [
  // Single day selection (not part of a range) - stands out with primary color
  'data-[selected-single=true]:bg-primary',
  'data-[selected-single=true]:text-primary-foreground',
  // Range start - primary color to mark the boundary
  'data-[range-start=true]:bg-primary',
  'data-[range-start=true]:text-primary-foreground',
  // Range middle - accent color to blend with cell background strip
  'data-[range-middle=true]:bg-accent',
  'data-[range-middle=true]:text-accent-foreground',
  // Range end - primary color to mark the boundary
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

// ═══════════════════════════════════════════════════════════════════════════════
// CLASS NAME BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Builds the classNames object for DayPicker, organized by functional area.
 *
 * This function generates Layer 1 of the dual-layer styling system (cell containers).
 * Layer 2 (button styling) is handled separately via `dayButtonStyles` applied
 * in `CalendarDayButton`.
 *
 * The classNames are organized into logical groups:
 * - **Layout**: Root container and month grid structure
 * - **Navigation**: Previous/next month buttons
 * - **Caption**: Month/year header and dropdowns
 * - **Week Grid**: Weekday headers and week rows
 * - **Day Cell**: Individual day container (affects all days)
 * - **Range Selection**: Range-specific cell styling (Layer 1) ← dual-layer system
 * - **Day States**: Today, outside month, disabled, hidden
 *
 * @param defaultClassNames - Default class names from react-day-picker
 * @param buttonVariant - Variant for navigation buttons
 * @param captionLayout - Layout mode for the caption ('label' | 'dropdown' | etc.)
 * @returns ClassNames object compatible with DayPicker's classNames prop
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
    month: cn(
      'flex w-full flex-col gap-4',
      'last:border-r-0 last:pr-0 border-r border-dashed border-border pr-4',
      '-my-4 py-4', // Negative margin + padding to extend border to edges
      defaultClassNames.month
    ),
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
  // Range Selection: Cell container styling (Layer 1 of dual-layer system)
  // ─────────────────────────────────────────────────────────────────────────────
  //
  // These classes are applied to the DAY CELL CONTAINERS (not the buttons).
  // They create the continuous background strip that visually connects range days.
  //
  // Why both cell AND button need range styling:
  // - Cell (here): Creates the unbroken `bg-accent` strip across the row
  // - Button (dayButtonSelectionStyles): Highlights endpoints with `bg-primary`
  //
  // This separation allows the highlight bar to flow seamlessly while still
  // making range boundaries visually distinct.
  //
  // These styles apply identically to:
  // - User-clicked ranges (during interaction)
  // - Pre-selected ranges (passed via `selected` prop at mount)
  //
  // @see dayButtonSelectionStyles for the button layer (Layer 2)
  // ─────────────────────────────────────────────────────────────────────────────
  const rangeClassNames = {
    /** Range start cell: accent background, rounded left edge */
    range_start: cn(
      `bg-accent rounded-l-[${RANGE_BORDER_RADIUS}]`,
      defaultClassNames.range_start
    ),
    /** Range middle cells: accent background, square corners for seamless connection */
    range_middle: cn('rounded-none', defaultClassNames.range_middle),
    /** Range end cell: accent background, rounded right edge */
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

// ═══════════════════════════════════════════════════════════════════════════════
// CALENDAR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A customizable calendar component built on react-day-picker.
 *
 * Supports single date selection, date ranges, and multiple date selection modes.
 * Styling is handled via CSS custom properties and data attributes for flexibility.
 *
 * ## Styling Architecture
 *
 * This component uses a dual-layer styling system for range selections:
 * - **Layer 1** (Cell): `buildCalendarClassNames()` → `rangeClassNames`
 * - **Layer 2** (Button): `CalendarDayButton` → data attributes → `dayButtonStyles`
 *
 * See the file-level JSDoc for a detailed explanation.
 *
 * ## Pre-Selected Ranges
 *
 * Ranges passed via the `selected` prop are styled identically to user-selected
 * ranges. The styling system responds to react-day-picker's modifiers, which are
 * computed from the selection state regardless of how it was set.
 *
 * @example
 * ```tsx
 * // Single date selection
 * <Calendar mode="single" selected={date} onSelect={setDate} />
 *
 * // Date range selection
 * <Calendar mode="range" selected={dateRange} onSelect={setDateRange} />
 *
 * // Pre-selected range (e.g., editing an existing booking)
 * <Calendar
 *   mode="range"
 *   selected={{ from: new Date('2024-01-15'), to: new Date('2024-01-20') }}
 *   onSelect={setDateRange}
 * />
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
        `group/calendar p-4 [${CELL_SIZE_VAR}:${DEFAULT_CELL_SIZE}]`,
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
 * Custom day button component - Layer 2 of the dual-layer styling system.
 *
 * This component handles selection styling via data attributes, enabling CSS-only
 * styling based on selection state. The modifiers come from react-day-picker and
 * reflect the current selection state, whether from user interaction or from a
 * pre-selected range passed via the `selected` prop.
 *
 * ## Why Data Attributes?
 *
 * Using data attributes instead of conditional class application:
 * - Keeps styling logic in CSS (see `dayButtonStyles` constants)
 * - Allows for easier theming via the `classNames` prop
 * - Makes selection state inspectable in browser dev tools
 * - Reduces JavaScript computation on selection changes
 *
 * ## Data Attributes
 *
 * The following data attributes are set based on react-day-picker modifiers:
 *
 * | Attribute              | When Set                                           |
 * |------------------------|----------------------------------------------------|
 * | `data-day`             | Always (localized date string for a11y/testing)    |
 * | `data-selected-single` | Selected but NOT part of a range                   |
 * | `data-range-start`     | First day of a selected range                      |
 * | `data-range-middle`    | Days between range start and end                   |
 * | `data-range-end`       | Last day of a selected range                       |
 *
 * ## Selection State Examples
 *
 * ```
 * Single selection:  [selected-single=true]
 * Range (1 day):     [range-start=true][range-end=true]
 * Range (multi):     [range-start] ... [range-middle] ... [range-end]
 * ```
 *
 * ## Pre-Selected Ranges
 *
 * When a range is passed via the `selected` prop (e.g., for editing an existing
 * date range), react-day-picker automatically sets the appropriate modifiers on
 * mount. This component's data attributes will reflect that state immediately,
 * causing the correct styling to be applied without any user interaction.
 *
 * @see dayButtonSelectionStyles for the CSS that targets these data attributes
 * @see rangeClassNames in buildCalendarClassNames() for the cell-level styling
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
