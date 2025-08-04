import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/utils/core"
import DisabledTooltip from "@/components/ui/disabled-tooltip"

const buttonVariants = cva(
  [
    'flex',
    'items-center',
    'justify-center',
    'disabled:pointer-events-none',
    'whitespace-nowrap',
    'border',
    'h-fit',
    'w-fit',
    'disabled:text-on-disabled',
    'disabled:bg-disabled',
    'transition-shadows',
    'transition-colors',
  ],
  {
    variants: {
      variant: {
        filled: 'disabled:bg-disabled border-transparent',
        outline: 'disabled:border-stroke-disabled',
        soft: 'disabled:bg-transparent disabled:border-stroke-disabled border-transparent',
        gradient: 'disabled:bg-disabled border-none',
        ghost: 'focus:bg-opacity-0 border-transparent',
        link: 'border-none disabled:text-disabled',
      },
      color: {
        primary: 'focus-visible:primary-focus',
        neutral: 'focus-visible:neutral-focus',
        danger: 'focus-visible:danger-focus',
      },
      size: {
        sm: 'gap-x-1 px-2 text-sm h-7 rounded-radius-xs',
        md: 'gap-x-1 px-3 text-sm h-8 rounded-radius-sm',
        lg: 'gap-x-2 px-4 text-base h-10 rounded-radius',
        'icon-sm': 'h-7 w-7 rounded-radius-xs p-0',
        'icon-md': 'h-8 w-8 rounded-radius-sm p-0',
        'icon-lg': 'h-10 w-10 rounded-radius p-0',
        'link-sm': 'text-sm',
        'link-md': 'text-base',
        'link-lg': 'text-lg',
      },
    },
    compoundVariants: [
      ...(['primary', 'neutral', 'danger'] as const).flatMap(
        (color) => [
          {
            variant: 'filled' as const,
            color: color,
            className: [
              `bg-${color}`,
              `text-on-${color}`,
              `hover:bg-${color}-hover`,
              `active:bg-${color}-pressed`,
            ],
          },
          {
            variant: 'outline' as const,
            color: color,
            className: [
              `text-${color}`,
              color === 'neutral' ? 'border-stroke' : `border-stroke-${color}`,
              `hover:bg-${color}-accent`,
              `active:bg-${color}-container`,
              `active:text-on-${color}-container`,
              'bg-background',
            ],
          },
          {
            variant: 'soft' as const,
            color: color,
            className: [
              `bg-${color}-container`,
              `text-on-${color}-container`,
              `hover:border-${color}-sub`,
              `active:bg-${color}-accent`,
            ],
          },
          {
            variant: 'ghost' as const,
            color: color,
            className: [
              `text-${color}`,
              `hover:bg-${color}-accent`,
              `active:bg-${color}-container`,
              `active:text-on-${color}-container`,
            ],
          },
          {
            variant: 'link' as const,
            color: color,
            className: [
              `text-${color}`,
              `hover:text-${color}-hover`,
              `active:text-${color}-pressed`,
              'p-0 pr-1',
            ],
          },
          {
            variant: 'gradient' as const,
            color: color,
            className: [
              'bg-blend-overlay bg-gradient-to-r from-white/40 to-white/0',
              `bg-${color}`,
              `text-on-${color}`,
              `hover:bg-${color}-hover`,
              `active:bg-${color}-pressed`,
            ],
          },
        ]
      ),
    ],
    defaultVariants: {
      variant: 'filled',
      color: 'primary',
      size: 'md',
    },
  }
)

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Icon to the left of the button text */
  iconLeading?: React.ReactNode
  /** Icon to the right of the button text */
  iconTrailing?: React.ReactNode
  /** Render as div instead of button */
  asDiv?: boolean
  /** Tooltip message when button is disabled */
  disabledTooltip?: string
  /** Show loading state */
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ 
    className, 
    variant, 
    size, 
    color, 
    asChild = false, 
    iconLeading,
    iconTrailing,
    asDiv,
    disabledTooltip,
    loading,
    disabled,
    children,
    ...props 
  }, ref) => {
    // Determine the actual size based on icons and variant
    const baseSize = size || 'md'
    let actualSize = baseSize
    
    // Only modify size if it's a basic size (sm, md, lg) and we need special handling
    if (baseSize === 'sm' || baseSize === 'md' || baseSize === 'lg') {
      if ((iconLeading || iconTrailing) && !children) {
        actualSize = `icon-${baseSize}` as const
      } else if (variant === 'link') {
        actualSize = `link-${baseSize}` as const
      }
    }

    const buttonClassName = cn(
      buttonVariants({ variant, size: actualSize, color }),
      className
    )

    const buttonContent = (
      <>
        {iconLeading}
        {children}
        {iconTrailing}
      </>
    )

    // Render as div if asDiv is true
    if (asDiv) {
      const divElement = (
        <div
          className={buttonClassName}
          ref={ref as React.Ref<HTMLDivElement>}
        >
          {buttonContent}
        </div>
      )

      if (disabled && disabledTooltip) {
        return (
          <DisabledTooltip message={disabledTooltip}>
            {divElement}
          </DisabledTooltip>
        )
      }

      return divElement
    }

    const Comp = asChild ? Slot : "button"
    const buttonElement = (
      <Comp
        className={buttonClassName}
        ref={ref}
        disabled={disabled}
        {...props}
      >
        {buttonContent}
      </Comp>
    )

    if (disabled && disabledTooltip) {
      return (
        <DisabledTooltip message={disabledTooltip}>
          {buttonElement}
        </DisabledTooltip>
      )
    }

    return buttonElement
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
