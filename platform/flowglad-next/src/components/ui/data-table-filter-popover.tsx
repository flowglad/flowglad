'use client'

import { Filter, Loader2 } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group'
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
  /** Default values - used for reset and badge calculation */
  defaultValues: T
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
 * Single-select filter section using radio buttons
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
    <div className="space-y-3">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {section.label}
      </Label>
      <RadioGroup
        value={value}
        onValueChange={onChange}
        disabled={section.disabled}
        className="gap-1"
      >
        {section.options.map((option) => (
          <div
            key={option.value}
            className="flex items-center space-x-2"
          >
            <RadioGroupItem
              value={option.value}
              id={`${section.id}-${option.value}`}
            />
            <Label
              htmlFor={`${section.id}-${option.value}`}
              className="text-sm font-normal cursor-pointer"
            >
              {option.label}
            </Label>
          </div>
        ))}
      </RadioGroup>
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

  React.useEffect(() => {
    if (isOpen && !hasLoaded) {
      setIsLoading(true)
      section
        .loadOptions()
        .then((loadedOptions) => {
          setOptions(loadedOptions)
          setHasLoaded(true)
        })
        .catch(() => {
          setOptions([])
        })
        .finally(() => {
          setIsLoading(false)
        })
    }
  }, [isOpen, hasLoaded, section])

  return (
    <div className="space-y-3">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {section.label}
      </Label>
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="size-4 animate-spin" />
          <span>Loading...</span>
        </div>
      ) : (
        <RadioGroup
          value={value}
          onValueChange={onChange}
          disabled={section.disabled}
          className="gap-1"
        >
          {options.map((option) => (
            <div
              key={option.value}
              className="flex items-center space-x-2"
            >
              <RadioGroupItem
                value={option.value}
                id={`${section.id}-${option.value}`}
              />
              <Label
                htmlFor={`${section.id}-${option.value}`}
                className="text-sm font-normal cursor-pointer"
              >
                {option.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      )}
    </div>
  )
}

/**
 * Reusable filter popover component for data tables.
 *
 * Supports single-select (radio buttons), toggle (switch), and async-select filter types.
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
  disabled,
  triggerLabel = 'Filter',
  showBadge = true,
}: DataTableFilterPopoverProps<T>): React.ReactElement {
  const [isOpen, setIsOpen] = React.useState(false)

  const activeFilterCount = React.useMemo(
    () => calculateActiveFilterCount(values, defaultValues),
    [values, defaultValues]
  )

  const handleReset = () => {
    onChange(defaultValues)
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
          className={cn(
            'h-9 gap-1',
            activeFilterCount > 0 && 'border-primary'
          )}
        >
          <Filter className="size-4" />
          <span>{triggerLabel}</span>
          {showBadge && activeFilterCount > 0 && (
            <span className="ml-1 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-0"
        sideOffset={8}
      >
        <div className="flex flex-col">
          {sections.map((section, index) => (
            <React.Fragment key={section.id}>
              {index > 0 && <Separator />}
              <div className="p-4">
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
              <div className="p-3 flex justify-end">
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
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
