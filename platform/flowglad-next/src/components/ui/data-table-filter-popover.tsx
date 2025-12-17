'use client'

import {
  AlertCircle,
  Check,
  Loader2,
  Settings2,
  X,
} from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

// Filter section types - extensible for future needs

interface BaseFilterSection {
  id: string
  label: string
  disabled?: boolean
}

interface SingleSelectFilterSection extends BaseFilterSection {
  type: 'single-select'
  options: { value: string; label: string }[]
}

interface ToggleFilterSection extends BaseFilterSection {
  type: 'toggle'
  description?: string
}

interface AsyncSelectFilterSection extends BaseFilterSection {
  type: 'async-select'
  loadOptions: () => Promise<{ value: string; label: string }[]>
  placeholder?: string
}

export type FilterSection =
  | SingleSelectFilterSection
  | ToggleFilterSection
  | AsyncSelectFilterSection

// Main component props
export interface DataTableFilterPopoverProps<
  T extends Record<string, unknown>,
> {
  /** Filter sections to render */
  sections: FilterSection[]
  /** Current filter values */
  values: T
  /** Called when any filter value changes */
  onChange: (values: T) => void
  /** Default values - used for reset */
  defaultValues: T
  /**
   * Neutral values representing "no filter applied" state (typically "all" options).
   * Used for badge calculation and the "Reset filters" action.
   * If not provided, defaults to defaultValues for both purposes.
   * This allows defaulting to a filtered state (e.g., "Paid Only") while still
   * showing the badge count since a filter is technically applied, and resetting
   * to the unfiltered state (e.g., "All plans") when the user clicks reset.
   */
  neutralValues?: T
  /** Disabled state */
  disabled?: boolean
  /** Custom trigger label (default: "Filter") */
  triggerLabel?: string
  /** Whether to show active filter count badge (default: true) */
  showBadge?: boolean
}

/**
 * Calculates how many filter values differ from their defaults
 */
function calculateActiveFilterCount<
  T extends Record<string, unknown>,
>(values: T, defaultValues: T): number {
  let count = 0
  for (const key of Object.keys(defaultValues)) {
    if (values[key] !== defaultValues[key]) {
      count++
    }
  }
  return count
}

/**
 * Selectable option item with checkmark indicator
 */
function SelectableOptionItem({
  label,
  isSelected,
  onClick,
  disabled,
}: {
  label: string
  isSelected: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'relative flex w-full cursor-default select-none items-center rounded py-1.5 pl-8 pr-2 text-sm outline-none transition-colors',
        'hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground',
        disabled && 'pointer-events-none opacity-50'
      )}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        {isSelected && <Check className="h-4 w-4" />}
      </span>
      {label}
    </button>
  )
}

/**
 * Single-select filter section using button options with checkmarks
 */
function SingleSelectSection({
  section,
  value,
  onChange,
}: {
  section: SingleSelectFilterSection
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide pl-5">
        {section.label}
      </Label>
      <div className="flex flex-col mx-0">
        {section.options.map((option) => (
          <SelectableOptionItem
            key={option.value}
            label={option.label}
            isSelected={value === option.value}
            onClick={() => onChange(option.value)}
            disabled={section.disabled}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Toggle filter section using switch component
 */
function ToggleSection({
  section,
  value,
  onChange,
}: {
  section: ToggleFilterSection
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <Label
          htmlFor={section.id}
          className="text-sm font-normal cursor-pointer"
        >
          {section.label}
        </Label>
        {section.description && (
          <p className="text-xs text-muted-foreground">
            {section.description}
          </p>
        )}
      </div>
      <Switch
        id={section.id}
        checked={value}
        onCheckedChange={onChange}
        disabled={section.disabled}
      />
    </div>
  )
}

/**
 * Async-select filter section that loads options dynamically
 */
function AsyncSelectSection({
  section,
  value,
  onChange,
  isOpen,
}: {
  section: AsyncSelectFilterSection
  value: string
  onChange: (value: string) => void
  isOpen: boolean
}) {
  const [options, setOptions] = React.useState<
    { value: string; label: string }[]
  >([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [hasLoaded, setHasLoaded] = React.useState(false)
  const [hasError, setHasError] = React.useState(false)

  // Extract loadOptions to avoid depending on the entire section object
  const { loadOptions } = section

  // Reset hasLoaded when loadOptions changes so options are reloaded
  React.useEffect(() => {
    setHasLoaded(false)
    setHasError(false)
  }, [loadOptions])

  const fetchOptions = React.useCallback(() => {
    setIsLoading(true)
    setHasError(false)
    loadOptions()
      .then((loadedOptions) => {
        setOptions(loadedOptions)
        setHasLoaded(true)
      })
      .catch((error: unknown) => {
        console.error(
          `Failed to load options for filter "${section.label}":`,
          error
        )
        setOptions([])
        setHasError(true)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [loadOptions, section.label])

  React.useEffect(() => {
    if (isOpen && !hasLoaded && !hasError) {
      fetchOptions()
    }
  }, [isOpen, hasLoaded, hasError, fetchOptions])

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide pl-5">
        {section.label}
      </Label>
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2 pl-2">
          <Loader2 className="size-4 animate-spin" />
          <span>Loading...</span>
        </div>
      ) : hasError ? (
        <div className="flex items-center gap-2 text-sm text-destructive py-2 pl-2">
          <AlertCircle className="size-4 flex-shrink-0" />
          <span>Failed to load.</span>
          <button
            type="button"
            onClick={fetchOptions}
            className="text-primary hover:underline focus:outline-none"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="flex flex-col mx-0">
          {options.map((option) => (
            <SelectableOptionItem
              key={option.value}
              label={option.label}
              isSelected={value === option.value}
              onClick={() => onChange(option.value)}
              disabled={section.disabled}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Reusable filter popover component for data tables.
 *
 * Supports single-select (button options with checkmarks), toggle (switch), and async-select filter types.
 * Shows a badge with the count of active filters that differ from defaults.
 * Includes a "Reset filters" link to restore all filters to their default values.
 */
export function DataTableFilterPopover<
  T extends Record<string, unknown>,
>({
  sections,
  values,
  onChange,
  defaultValues,
  neutralValues,
  disabled,
  triggerLabel = 'Filter',
  showBadge = true,
}: DataTableFilterPopoverProps<T>): React.ReactElement {
  const [isOpen, setIsOpen] = React.useState(false)

  // Badge count: how many filters differ from neutral (no filter) state
  const activeFilterCount = React.useMemo(
    () =>
      calculateActiveFilterCount(
        values,
        neutralValues ?? defaultValues
      ),
    [values, neutralValues, defaultValues]
  )

  const handleReset = () => {
    onChange(neutralValues ?? defaultValues)
  }

  const handleValueChange = (
    sectionId: string,
    newValue: unknown
  ) => {
    onChange({
      ...values,
      [sectionId]: newValue,
    })
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-9 gap-1 text-sm"
        >
          <Settings2 className="size-4" />
          <span>{triggerLabel}</span>
          {showBadge && activeFilterCount > 0 && (
            <span className="ml-1 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0" sideOffset={8}>
        <div className="flex flex-col">
          {sections.map((section, index) => (
            <React.Fragment key={section.id}>
              {index > 0 && <Separator />}
              <div className="p-1">
                {section.type === 'single-select' && (
                  <SingleSelectSection
                    section={section}
                    value={values[section.id] as string}
                    onChange={(newValue) =>
                      handleValueChange(section.id, newValue)
                    }
                  />
                )}
                {section.type === 'toggle' && (
                  <ToggleSection
                    section={section}
                    value={values[section.id] as boolean}
                    onChange={(newValue) =>
                      handleValueChange(section.id, newValue)
                    }
                  />
                )}
                {section.type === 'async-select' && (
                  <AsyncSelectSection
                    section={section}
                    value={values[section.id] as string}
                    onChange={(newValue) =>
                      handleValueChange(section.id, newValue)
                    }
                    isOpen={isOpen}
                  />
                )}
              </div>
            </React.Fragment>
          ))}

          {/* Reset link - only shows when filters differ from defaults */}
          {activeFilterCount > 0 && (
            <>
              <Separator />
              <div className="p-1">
                <button
                  type="button"
                  onClick={handleReset}
                  className="relative flex w-full cursor-default select-none items-center rounded py-1.5 pl-8 pr-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
                >
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    <X className="h-4 w-4" />
                  </span>
                  Reset filters
                </button>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
