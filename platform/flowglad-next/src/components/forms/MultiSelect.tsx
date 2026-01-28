'use client'

import { Command as CommandPrimitive, useCommandState } from 'cmdk'
import { X } from 'lucide-react'
import * as React from 'react'
import { forwardRef, useEffect } from 'react'

import { Badge } from '@/components/ui/badge'
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { FormDescription, FormMessage } from '@/components/ui/form'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export interface Option {
  value: string
  label: string
  disable?: boolean
  /** fixed option that can't be removed. */
  fixed?: boolean
  /** Group the options by providing key. */
  [key: string]: string | boolean | undefined
}
interface GroupOption {
  [key: string]: Option[]
}

interface MultipleSelectorProps {
  id?: string
  label?: string
  /** Helper text, to the right of the label */
  helper?: string
  /** Hint/description below the input  */
  hint?: string
  /** Display hint icon to the left of the hint
   * @default false
   */
  showHintIcon?: boolean
  /** Display required mark to the right of the label */
  required?: boolean
  value?: Option[]
  defaultOptions?: Option[]
  /** manually controlled options */
  options?: Option[]
  placeholder?: string
  /** Loading component. */
  loadingIndicator?: React.ReactNode
  /** Empty component. */
  emptyIndicator?: React.ReactNode
  /** Debounce time for async search. Only work with `onSearch`. */
  delay?: number
  /**
   * Only work with `onSearch` prop. Trigger search when `onFocus`.
   * For example, when user click on the input, it will trigger the search to get initial options.
   **/
  triggerSearchOnFocus?: boolean
  /** async search */
  onSearch?: (value: string) => Promise<Option[]>
  /**
   * sync search. This search will not showing loadingIndicator.
   * The rest props are the same as async search.
   * i.e.: creatable, groupBy, delay.
   **/
  onSearchSync?: (value: string) => Option[]
  onChange?: (options: Option[]) => void
  /** Limit the maximum number of selected options. */
  maxSelected?: number
  /** When the number of selected options exceeds the limit, the onMaxSelected will be called. */
  onMaxSelected?: (maxLimit: number) => void
  /** Hide the placeholder when there are options selected. */
  hidePlaceholderWhenSelected?: boolean
  disabled?: boolean
  /** Group the options base on provided key. */
  groupBy?: string
  className?: string
  badgeClassName?: string
  /**
   * First item selected is a default behavior by cmdk. That is why the default is true.
   * This is a workaround solution by add a dummy item.
   *
   * @reference: https://github.com/pacocoursey/cmdk/issues/171
   */
  selectFirstItem?: boolean
  /** Allow user to create option when there is no option matched. */
  creatable?: boolean
  /** Props of `Command` */
  commandProps?: React.ComponentPropsWithoutRef<typeof Command>
  /** Props of `CommandInput` */
  inputProps?: Omit<
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>,
    'value' | 'placeholder' | 'disabled'
  >
  /** Display the input with an error state */
  error?: boolean | string
  /** hide the clear all button. */
  hideClearAllButton?: boolean
}

export interface MultipleSelectorRef {
  selectedValue: Option[]
  input: HTMLInputElement
  focus: () => void
  reset: () => void
}

export function useDebounce<T>(value: T, delay?: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedValue(value),
      delay || 500
    )

    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])

  return debouncedValue
}

function transToGroupOption(options: Option[], groupBy?: string) {
  if (options.length === 0) {
    return {}
  }
  if (!groupBy) {
    return {
      '': options,
    }
  }

  const groupOption: GroupOption = {}
  options.forEach((option) => {
    const key = (option[groupBy] as string) || ''
    if (!groupOption[key]) {
      groupOption[key] = []
    }
    groupOption[key].push(option)
  })
  return groupOption
}

function removePickedOption(
  groupOption: GroupOption,
  picked: Option[]
) {
  const cloneOption = JSON.parse(
    JSON.stringify(groupOption)
  ) as GroupOption

  for (const [key, value] of Object.entries(cloneOption)) {
    cloneOption[key] = value.filter(
      (val) => !picked.find((p) => p.value === val.value)
    )
  }
  return cloneOption
}

function isOptionsExist(
  groupOption: GroupOption,
  targetOption: Option[]
) {
  for (const [, value] of Object.entries(groupOption)) {
    if (
      value.some((option) =>
        targetOption.find((p) => p.value === option.value)
      )
    ) {
      return true
    }
  }
  return false
}

/**
 * The `CommandEmpty` of shadcn/ui will cause the cmdk empty not rendering correctly.
 * So we create one and copy the `Empty` implementation from `cmdk`.
 *
 * @reference: https://github.com/hsuanyi-chou/shadcn-ui-expansions/issues/34#issuecomment-1949561607
 **/
const CommandEmpty = forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof CommandPrimitive.Empty>
>(({ className, ...props }, forwardedRef) => {
  const render = useCommandState(
    (state) => state.filtered.count === 0
  )

  if (!render) return null

  return (
    <div
      ref={forwardedRef}
      className={cn('py-6 text-center text-sm', className)}
      cmdk-empty=""
      role="presentation"
      {...props}
    />
  )
})

CommandEmpty.displayName = 'CommandEmpty'

const MultipleSelector = React.forwardRef<
  MultipleSelectorRef,
  MultipleSelectorProps
>(
  (
    {
      value,
      onChange,
      placeholder,
      defaultOptions: arrayDefaultOptions = [],
      options: arrayOptions,
      delay,
      onSearch,
      onSearchSync,
      loadingIndicator,
      emptyIndicator,
      maxSelected = Number.MAX_SAFE_INTEGER,
      onMaxSelected,
      hidePlaceholderWhenSelected,
      disabled,
      groupBy,
      className,
      badgeClassName,
      selectFirstItem = true,
      creatable = false,
      triggerSearchOnFocus = false,
      commandProps,
      inputProps,
      hideClearAllButton = false,
      label,
      helper,
      hint,
      showHintIcon = false,
      required,
      error,
      id: providedId,
    }: MultipleSelectorProps,
    ref: React.Ref<MultipleSelectorRef>
  ) => {
    const inputRef = React.useRef<HTMLInputElement>(null)
    const [open, setOpen] = React.useState(false)
    const [onScrollbar, setOnScrollbar] = React.useState(false)
    const [isLoading, setIsLoading] = React.useState(false)
    const dropdownRef = React.useRef<HTMLDivElement>(null)

    const [selected, setSelected] = React.useState<Option[]>([])
    const [options, setOptions] = React.useState<GroupOption>(
      transToGroupOption(arrayDefaultOptions, groupBy)
    )
    const [inputValue, setInputValue] = React.useState('')
    const debouncedSearchTerm = useDebounce(inputValue, delay || 500)

    React.useImperativeHandle(
      ref,
      () => ({
        selectedValue: [...selected],
        input: inputRef.current as HTMLInputElement,
        focus: () => inputRef?.current?.focus(),
        reset: () => setSelected([]),
      }),
      [selected]
    )

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
        inputRef.current.blur()
      }
    }

    const handleUnselect = React.useCallback(
      (option: Option) => {
        const newOptions = selected.filter(
          (s) => s.value !== option.value
        )
        setSelected(newOptions)
        onChange?.(newOptions)
      },
      [onChange, selected]
    )

    const handleKeyDown = React.useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        const input = inputRef.current
        if (input) {
          if (e.key === 'Delete' || e.key === 'Backspace') {
            if (input.value === '' && selected.length > 0) {
              const lastSelectOption = selected[selected.length - 1]
              // If last item is fixed, we should not remove it.
              if (!lastSelectOption.fixed) {
                handleUnselect(selected[selected.length - 1])
              }
            }
          }
          // This is not a default behavior of the <input /> field
          if (e.key === 'Escape') {
            input.blur()
          }
        }
      },
      [handleUnselect, selected]
    )

    useEffect(() => {
      if (open) {
        document.addEventListener('mousedown', handleClickOutside)
        document.addEventListener('touchend', handleClickOutside)
      } else {
        document.removeEventListener('mousedown', handleClickOutside)
        document.removeEventListener('touchend', handleClickOutside)
      }

      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
        document.removeEventListener('touchend', handleClickOutside)
      }
    }, [open])

    useEffect(() => {
      if (value) {
        const newSelected = value.map((opt: Option) => {
          // Ensure label and value are strings, falling back to String() conversion
          // This trusts that opt is an Option, but its label/value might be other types
          const finalLabel =
            typeof opt.label === 'string'
              ? opt.label
              : String(opt.label)
          const finalValue =
            typeof opt.value === 'string'
              ? opt.value
              : String(opt.value)

          return {
            ...opt,
            label: finalLabel,
            value: finalValue,
          }
        })
        setSelected(newSelected)
      } else {
        setSelected([])
      }
    }, [value])

    useEffect(() => {
      /** If `onSearch` is provided, do not trigger options updated. */
      if (!arrayOptions || onSearch) {
        return
      }
      const newOption = transToGroupOption(
        arrayOptions || [],
        groupBy
      )
      if (JSON.stringify(newOption) !== JSON.stringify(options)) {
        setOptions(newOption)
      }
    }, [
      arrayDefaultOptions,
      arrayOptions,
      groupBy,
      onSearch,
      options,
    ])

    useEffect(() => {
      /** sync search */

      const doSearchSync = () => {
        const res = onSearchSync?.(debouncedSearchTerm)
        setOptions(transToGroupOption(res || [], groupBy))
      }

      const exec = async () => {
        if (!onSearchSync || !open) return

        if (triggerSearchOnFocus) {
          doSearchSync()
        }

        if (debouncedSearchTerm) {
          doSearchSync()
        }
      }

      void exec()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedSearchTerm, groupBy, open, triggerSearchOnFocus])

    useEffect(() => {
      /** async search */

      const doSearch = async () => {
        setIsLoading(true)
        const res = await onSearch?.(debouncedSearchTerm)
        setOptions(transToGroupOption(res || [], groupBy))
        setIsLoading(false)
      }

      const exec = async () => {
        if (!onSearch || !open) return

        if (triggerSearchOnFocus) {
          await doSearch()
        }

        if (debouncedSearchTerm) {
          await doSearch()
        }
      }

      void exec()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedSearchTerm, groupBy, open, triggerSearchOnFocus])

    const CreatableItem = () => {
      if (!creatable) return undefined
      if (
        isOptionsExist(options, [
          { value: inputValue, label: inputValue },
        ]) ||
        selected.find((s) => s.value === inputValue)
      ) {
        return undefined
      }

      const Item = (
        <CommandItem
          value={inputValue}
          className="cursor-pointer"
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onSelect={(value: string) => {
            if (selected.length >= maxSelected) {
              onMaxSelected?.(selected.length)
              return
            }
            setInputValue('')
            const newOptions = [...selected, { value, label: value }]
            setSelected(newOptions)
            onChange?.(newOptions)
          }}
        >
          {`Create "${inputValue}"`}
        </CommandItem>
      )

      // For normal creatable
      if (!onSearch && inputValue.length > 0) {
        return Item
      }

      // For async search creatable. avoid showing creatable item before loading at first.
      if (onSearch && debouncedSearchTerm.length > 0 && !isLoading) {
        return Item
      }

      return undefined
    }

    const EmptyItem = React.useCallback(() => {
      if (!emptyIndicator) return undefined

      // For async search that showing emptyIndicator
      if (
        onSearch &&
        !creatable &&
        Object.keys(options).length === 0
      ) {
        return (
          <CommandItem value="-" disabled>
            {emptyIndicator}
          </CommandItem>
        )
      }

      return <CommandEmpty>{emptyIndicator}</CommandEmpty>
    }, [creatable, emptyIndicator, onSearch, options])

    const selectables = React.useMemo<GroupOption>(
      () => removePickedOption(options, selected),
      [options, selected]
    )

    /** Avoid Creatable Selector freezing or lagging when paste a long string. */
    const commandFilter = React.useCallback(() => {
      if (commandProps?.filter) {
        return commandProps.filter
      }

      if (creatable) {
        return (value: string, search: string) => {
          return value.toLowerCase().includes(search.toLowerCase())
            ? 1
            : -1
        }
      }
      // Using default filter in `cmdk`. We don't have to provide it.
      return undefined
    }, [creatable, commandProps?.filter])
    const generatedId = React.useId()
    const id = providedId ?? generatedId
    const resolvedError = typeof error === 'string' ? !!error : error

    return (
      <div>
        {label && (
          <div className="mb-0.5">
            <Label id={`${id}__label`} htmlFor={id}>
              {label}
              {required && (
                <span className="text-destructive ml-1">*</span>
              )}
              {helper && (
                <span className="text-xs text-muted-foreground ml-2">
                  ({helper})
                </span>
              )}
            </Label>
          </div>
        )}
        <Command
          ref={dropdownRef}
          {...commandProps}
          onKeyDown={(e) => {
            handleKeyDown(e)
            commandProps?.onKeyDown?.(e)
          }}
          className={cn(
            'h-auto overflow-visible bg-transparent',
            commandProps?.className
          )}
          shouldFilter={
            commandProps?.shouldFilter !== undefined
              ? commandProps.shouldFilter
              : !onSearch
          } // When onSearch is provided, we don't want to filter the options. You can still override it.
          filter={commandFilter()}
        >
          <div
            className={cn(
              'flex items-center w-full rounded border border-input bg-input-bg px-3 py-2 text-sm text-foreground shadow-xs transition-colors min-h-10 h-auto overflow-hidden',
              {
                'focus-within:outline-none focus-within:ring-2 focus-within:ring-foreground/20 focus-within:border-foreground cursor-text':
                  !disabled && !resolvedError,
                'bg-muted border-input opacity-50 cursor-not-allowed pointer-events-none':
                  disabled,
                'border-destructive focus-within:border-destructive cursor-text':
                  resolvedError && !disabled,
              },
              className
            )}
            onClick={() => {
              if (disabled) return
              inputRef?.current?.focus()
            }}
          >
            <div className="flex flex-wrap gap-1 items-center w-full">
              {selected.map((option) => {
                return (
                  <Badge
                    key={option.value}
                    className={cn(
                      'py-1 rounded bg-accent text-foreground border-transparent hover:bg-accent/80 shadow-none',
                      'data-[disabled]:bg-muted-foreground data-[disabled]:text-muted data-[disabled]:hover:bg-muted-foreground',
                      'data-[fixed]:bg-muted-foreground data-[fixed]:text-muted data-[fixed]:hover:bg-muted-foreground',
                      badgeClassName
                    )}
                    data-fixed={option.fixed}
                    data-disabled={disabled || undefined}
                  >
                    {String(option.label)}
                    <button
                      type="button"
                      className={cn(
                        'ml-1 rounded outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2',
                        (disabled || option.fixed) && 'hidden'
                      )}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleUnselect(option)
                        }
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                      }}
                      onClick={() => handleUnselect(option)}
                    >
                      <X className="h-3 w-3 text-foreground hover:text-foreground/80" />
                    </button>
                  </Badge>
                )
              })}
              <CommandPrimitive.Input
                {...inputProps}
                ref={inputRef}
                value={inputValue}
                disabled={disabled}
                onValueChange={(value) => {
                  setInputValue(value)
                  inputProps?.onValueChange?.(value)
                }}
                onBlur={(event) => {
                  if (!onScrollbar) {
                    setOpen(false)
                  }
                  inputProps?.onBlur?.(event)
                }}
                onFocus={(event) => {
                  setOpen(true)
                  inputProps?.onFocus?.(event)
                }}
                placeholder={
                  hidePlaceholderWhenSelected && selected.length !== 0
                    ? ''
                    : placeholder
                }
                className={cn(
                  'flex-1 bg-transparent outline-none border-none focus:ring-0 text-sm placeholder:text-muted-foreground',
                  'py-0.5',
                  'disabled:text-on-disabled disabled:placeholder:text-on-disabled disabled:pointer-events-none',
                  {
                    'w-full':
                      hidePlaceholderWhenSelected &&
                      selected.length > 0,
                    'ml-0':
                      selected.length !== 0 &&
                      (!hidePlaceholderWhenSelected ||
                        selected.length > 0),
                    'pl-2':
                      selected.length === 0 &&
                      (!hidePlaceholderWhenSelected ||
                        selected.length === 0),
                  },
                  inputProps?.className
                )}
              />
              <button
                type="button"
                onClick={() => {
                  setSelected(selected.filter((s) => s.fixed))
                  onChange?.(selected.filter((s) => s.fixed))
                }}
                className={cn(
                  'absolute right-0 h-6 w-6 p-0',
                  'hidden'
                )}
              >
                <X />
              </button>
            </div>
          </div>
          <div className="relative">
            {open && (
              <CommandList
                className="absolute top-1 z-10 w-full rounded border bg-popover p-1 text-popover-foreground shadow-md outline-none animate-in"
                onMouseLeave={() => {
                  setOnScrollbar(false)
                }}
                onMouseEnter={() => {
                  setOnScrollbar(true)
                }}
                onMouseUp={() => {
                  inputRef?.current?.focus()
                }}
              >
                {isLoading ? (
                  <>{loadingIndicator}</>
                ) : (
                  <>
                    {EmptyItem()}
                    {CreatableItem()}
                    {!selectFirstItem && (
                      <CommandItem value="-" className="hidden" />
                    )}
                    {Object.entries(selectables).map(
                      ([key, dropdowns]) => (
                        <CommandGroup
                          key={key}
                          heading={key}
                          className="h-full overflow-auto"
                        >
                          <>
                            {dropdowns.map((option) => {
                              return (
                                <CommandItem
                                  key={option.value}
                                  value={option.label}
                                  disabled={option.disable}
                                  onMouseDown={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                  }}
                                  onSelect={() => {
                                    if (
                                      selected.length >= maxSelected
                                    ) {
                                      onMaxSelected?.(selected.length)
                                      return
                                    }
                                    setInputValue('')
                                    const newOptions = [
                                      ...selected,
                                      {
                                        label: option.label,
                                        value: option.value,
                                      },
                                    ]
                                    setSelected(newOptions)
                                    onChange?.(newOptions)
                                  }}
                                  className={cn(
                                    'cursor-pointer',
                                    option.disable &&
                                      'cursor-default text-muted-foreground'
                                  )}
                                >
                                  {option.label}
                                </CommandItem>
                              )
                            })}
                          </>
                        </CommandGroup>
                      )
                    )}
                  </>
                )}
              </CommandList>
            )}
          </div>
        </Command>
        {hint && (
          <div
            id={`${id}__hint`}
            className={`text-xs mt-1 ${disabled ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}
          >
            {hint}
          </div>
        )}
        {error && (
          <div
            id={`${id}__error`}
            className={`mt-1 text-destructive text-xs ${disabled ? 'opacity-60' : ''}`}
          >
            {typeof error === 'string'
              ? error
              : 'This field has an error'}
          </div>
        )}
      </div>
    )
  }
)

MultipleSelector.displayName = 'MultipleSelector'
export default MultipleSelector
