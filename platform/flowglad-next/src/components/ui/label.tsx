'use client'

import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/utils/core'

const labelVariants = cva(
  'text-sm font-medium leading-none text-secondary peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
)

interface LabelProps
  extends React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>,
    VariantProps<typeof labelVariants> {
  /** Helper text to display to the right of the label */
  helper?: string
  /** Display required mark to the right of the label */
  required?: boolean
  /** Whether the label is disabled */
  disabled?: boolean
  /** Description below the label */
  description?: string
  /** HTML ID of the description element */
  descriptionId?: string
  /** Classname of the label container (use this to position the label) */
  className?: string
  /** Classname of the label (use this to restyle the label) */
  labelClassName?: string
}

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  LabelProps
>(
  (
    {
      className,
      helper,
      required,
      disabled,
      description,
      descriptionId,
      labelClassName,
      children,
      ...props
    },
    ref
  ) => (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center gap-2">
        <LabelPrimitive.Root
          ref={ref}
          className={cn(
            labelVariants(),
            disabled && 'opacity-50',
            labelClassName
          )}
          {...props}
        >
          {children}
          {required && (
            <span className="text-destructive ml-1">*</span>
          )}
        </LabelPrimitive.Root>
        {helper && (
          <span
            className={cn(
              'text-xs text-muted-foreground',
              disabled && 'opacity-50'
            )}
          >
            ({helper})
          </span>
        )}
      </div>
      {description && (
        <p
          id={descriptionId}
          className={cn(
            'text-sm text-muted-foreground',
            disabled && 'opacity-50'
          )}
        >
          {description}
        </p>
      )}
    </div>
  )
)
Label.displayName = LabelPrimitive.Root.displayName

export { Label }
