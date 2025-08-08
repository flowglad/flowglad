import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/utils/core'
import DisabledTooltip from '@/components/ion/DisabledTooltip'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow hover:bg-primary-hover',
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline:
          'border border-input bg-background-input text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground',
        secondary:
          'bg-background-input text-foreground shadow-sm hover:bg-neutral-container',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Icon to the left of the button text */
  iconLeading?: React.ReactNode
  /** Icon to the right of the button text */
  iconTrailing?: React.ReactNode
  /** Loading state - currently not implemented(just like in ion) but accepted to prevent React warnings */
  loading?: boolean
  /** Tooltip message to show when button is disabled and hovered */
  disabledTooltip?: string
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      iconLeading,
      iconTrailing,
      children,
      disabled,
      disabledTooltip,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button'
    const buttonClassName = cn(
      buttonVariants({ variant, size, className }),
      disabledTooltip && 'group relative'
    )

    return (
      <Comp
        className={buttonClassName}
        ref={ref}
        disabled={disabled}
        {...props}
      >
        {iconLeading}
        {children}
        {iconTrailing}
        {disabled && disabledTooltip && (
          <DisabledTooltip message={disabledTooltip} />
        )}
      </Comp>
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
