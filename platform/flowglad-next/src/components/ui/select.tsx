
'use client'
import { Check, ChevronDown } from 'lucide-react'
import * as SelectPrimitive from '@radix-ui/react-select'
import clsx from 'clsx'
import * as React from 'react'
import { twMerge } from 'tailwind-merge'

import Hint from '@/components/ion/Hint'
import Label from '@/components/ion/Label'

const SelectBase = SelectPrimitive.Root

const SelectGroup = SelectPrimitive.Group

const SelectValue = SelectPrimitive.Value

/* ---------------------------------- Component --------------------------------- */

export const selectTriggerClassName = (error?: boolean | string) =>
  twMerge(
    clsx(
      'bg-background-input focus:border-stroke-primary focus:primary-focus focus-within:border-stroke-primary group flex min-h-9 w-full items-center justify-between rounded-radius-sm border border-stroke px-3 py-2 text-sm data-[placeholder]:text-subtle transition-all',
      'disabled:border-stroke-disabled disabled:pointer-events-none disabled:bg-disabled disabled:text-on-disabled disabled:data-[placeholder]:text-on-disabled',
      {
        'border-danger': error,
      }
    )
  )
const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & {
    iconLeading?: React.ReactNode
    error?: boolean | string
  }
>(({ className, children, iconLeading, error, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={twMerge(
      clsx(selectTriggerClassName(error), className)
    )}
    {...props}
  >
    <span className="flex items-center gap-3">
      {iconLeading && (
        <span className="group-disabled:text-on-disabled text-foreground">
          {iconLeading}
        </span>
      )}{' '}
      {children}
    </span>
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="ml-3 h-4 w-4 transition-transform duration-200 ease-in group-data-[state=open]:rotate-180" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

/* ---------------------------------- Component --------------------------------- */

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={clsx(
        'relative z-50 min-w-[8rem] overflow-hidden rounded-radius border border-stroke-subtle bg-background text-on-background shadow-medium',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        position === 'popper' &&
          'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
        className
      )}
      position={position}
      {...props}
    >
      <SelectPrimitive.Viewport
        className={clsx(
          'p-2',
          position === 'popper' &&
            'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]'
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

/* ---------------------------------- Component --------------------------------- */
const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={clsx('px-3 py-2 text-sm', className)}
    {...props}
  />
))
SelectLabel.displayName = SelectPrimitive.Label.displayName

/* ---------------------------------- Component --------------------------------- */

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> & {
    description?: string
    iconLeading?: React.ReactNode
    suffix?: React.ReactNode
  }
>(
  (
    {
      className,
      children,
      iconLeading,
      description,
      suffix,
      ...props
    },
    ref
  ) => (
    <SelectPrimitive.Item
      ref={ref}
      className={clsx(
        'group relative flex w-full cursor-default select-none items-center gap-1 rounded-radius-xs p-2 text-sm font-semibold text-on-background outline-none focus:bg-container hover:bg-container data-[disabled]:pointer-events-none data-[state=checked]:pr-8 data-[state=open]:pr-8 data-[disabled]:text-on-disabled',
        className
      )}
      {...props}
    >
      <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-4 w-4 text-secondary data-[disabled]:text-on-disabled" />
        </SelectPrimitive.ItemIndicator>
      </span>
      {iconLeading}
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      {description && (
        <p className="font-normal text-subtle group-data-[disabled]:text-on-disabled ml-1">
          {description}
        </p>
      )}
      <span className="ml-auto font-normal text-subtle">
        {suffix}
      </span>
    </SelectPrimitive.Item>
  )
)
SelectItem.displayName = SelectPrimitive.Item.displayName

/* ---------------------------------- Component --------------------------------- */

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={clsx('bg-muted -mx-1 my-1 h-px', className)}
    {...props}
  />
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

/* ---------------------------------- Type --------------------------------- */

export interface Option {
  label: string
  value: string
  iconLeading?: React.ReactNode
  suffix?: React.ReactNode
  description?: string
  disabled?: boolean
  className?: string
}

export interface SelectProps extends SelectPrimitive.SelectProps {
  /** HTML ID of the input */
  id?: string
  /** Select options */
  options: Option[]
  /** Placeholder of the select */
  placeholder?: string
  /** Leading icon of the select */
  iconLeading?: React.ReactNode
  /** Label of the select */
  label?: string
  /** Helper text, to the right of the label */
  helper?: string
  /** Hint text, below the select */
  hint?: string
  /** Display hint icon to the left of the hint
   * @default false
   */
  showHintIcon?: boolean
  /** Display the select with an error state */
  error?: boolean | string
  /** Dispaly required mark to the right of the label */
  required?: boolean
  /** Classname for the select container (use this to position the select) */
  className?: string
  /** Classname for the select trigger (use this to restyle the select) */
  triggerClassName?: string
}

/* ---------------------------------- Component --------------------------------- */
const Select = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Root> &
    SelectProps
>(
  (
    {
      className,
      triggerClassName,
      options,
      required,
      error,
      showHintIcon = false,
      placeholder,
      iconLeading,
      helper,
      hint,
      label,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId()
    const id = props.id ?? generatedId
    const ariaInvalid = !!error
    const [selectedOption, setSelectedOption] = React.useState<
      Option | undefined
    >(undefined)

    return (
      <div className={twMerge(clsx('w-full', className))}>
        <SelectBase
          {...props}
          onValueChange={(value) => {
            setSelectedOption(
              options.find((option) => option.value === value)
            )
            props.onValueChange?.(value)
          }}
        >
          {label && (
            <Label
              id={`${id}__label`}
              required={required}
              disabled={props.disabled}
              helper={helper}
              className="mb-1"
            >
              {label}
            </Label>
          )}
          <SelectTrigger
            id={id}
            aria-required={required}
            aria-invalid={ariaInvalid}
            aria-describedby={hint ? `${id}__hint` : undefined}
            iconLeading={selectedOption?.iconLeading ?? iconLeading}
            error={error}
            ref={ref}
            className={triggerClassName}
          >
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          {hint && (
            <Hint
              id={`${id}__hint`}
              showIcon={showHintIcon}
              disabled={props.disabled}
              error={error}
              className="mt-1"
            >
              {hint}
            </Hint>
          )}
          <SelectContent className="max-h-96" align="end">
            {options.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                iconLeading={option.iconLeading}
                description={option.description}
                suffix={option.suffix}
                className={option.className}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </SelectBase>
      </div>
    )
  }
)

Select.displayName = SelectPrimitive.Root.displayName
export default Select
export {
  Select,
  SelectBase,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
