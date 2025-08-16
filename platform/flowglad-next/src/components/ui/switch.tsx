'use client'

import * as React from 'react'
import * as SwitchPrimitives from '@radix-ui/react-switch'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/utils/core'
import { Label } from '@/components/ui/label'

const switchVariants = cva(
  'peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-secondary',
  {
    variants: {
      size: {
        sm: 'h-4 w-8',
        md: 'h-5 w-9',
        lg: 'h-6 w-12',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
)

const thumbVariants = cva(
  'pointer-events-none block rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=unchecked]:translate-x-0',
  {
    variants: {
      size: {
        sm: 'h-3 w-3 data-[state=checked]:translate-x-4',
        md: 'h-4 w-4 data-[state=checked]:translate-x-4',
        lg: 'h-5 w-5 data-[state=checked]:translate-x-6',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
)

interface SwitchProps
  extends React.ComponentPropsWithoutRef<
      typeof SwitchPrimitives.Root
    >,
    VariantProps<typeof switchVariants> {
  /** Label for the switch */
  label?: React.ReactNode
  /** Description, under the label, of the switch */
  description?: string
  /** Helper text, to the right of the label */
  helper?: string
  /** Custom class name for the thumb */
  thumbClassName?: string
  /** Custom class name for when the thumb is checked */
  checkedClassName?: string
  /** Custom class name for the label */
  labelClassName?: string
}

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  SwitchProps
>(
  (
    {
      className,
      size = 'md',
      required,
      label,
      description,
      helper,
      thumbClassName,
      labelClassName,
      checkedClassName,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId()
    const id = props.id || generatedId

    return (
      <span className="flex items-center gap-2 text-sm">
        <SwitchPrimitives.Root
          id={id}
          ref={ref}
          aria-required={required}
          aria-describedby={
            description ? `${id}__description` : undefined
          }
          className={cn(
            switchVariants({ size }),
            checkedClassName,
            className
          )}
          {...props}
        >
          <SwitchPrimitives.Thumb
            className={cn(thumbVariants({ size }), thumbClassName)}
          />
        </SwitchPrimitives.Root>
        {label && (
          <Label
            id={`${id}__label`}
            htmlFor={id}
            required={required}
            helper={helper}
            description={description}
            descriptionId={
              description ? `${id}__description` : undefined
            }
            className={labelClassName}
          >
            {label}
          </Label>
        )}
      </span>
    )
  }
)
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
