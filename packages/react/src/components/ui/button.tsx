import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../../lib/utils'

const buttonVariants = cva(
  "flowglad-inline-flex flowglad-items-center flowglad-justify-center flowglad-gap-2 flowglad-whitespace-nowrap flowglad-rounded-md flowglad-text-sm flowglad-font-medium flowglad-transition-[color,box-shadow] flowglad-disabled:pointer-events-none flowglad-disabled:opacity-50 [&_svg]:flowglad-pointer-events-none [&_svg:not([class*='size-'])]:flowglad-size-4 flowglad-shrink-0 [&_svg]:flowglad-shrink-0 flowglad-outline-none flowglad-focus-visible:border-ring flowglad-focus-visible:ring-ring/50 flowglad-focus-visible:ring-[3px] flowglad-aria-invalid:ring-destructive/20 flowglad-dark:aria-invalid:ring-destructive/40 flowglad-aria-invalid:border-destructive hover:flowglad-cursor-pointer",
  {
    variants: {
      variant: {
        default:
          'flowglad-bg-primary flowglad-text-primary-foreground flowglad-shadow-xs hover:flowglad-bg-primary/90',
        destructive:
          'flowglad-bg-destructive flowglad-text-white flowglad-shadow-xs hover:flowglad-bg-destructive/90 flowglad-focus-visible:ring-destructive/20 flowglad-dark:focus-visible:ring-destructive/40',
        outline:
          'flowglad-border flowglad-border-input flowglad-bg-background flowglad-shadow-xs hover:flowglad-bg-accent hover:flowglad-text-accent-foreground',
        secondary:
          'flowglad-bg-secondary flowglad-text-secondary-foreground flowglad-shadow-xs hover:flowglad-bg-secondary/80',
        ghost:
          'hover:flowglad-bg-accent hover:flowglad-text-accent-foreground',
        link: 'flowglad-text-primary flowglad-underline-offset-4 hover:flowglad-underline',
      },
      size: {
        default:
          'flowglad-h-9 flowglad-px-4 flowglad-py-2 has-[>svg]:flowglad-px-3',
        sm: 'flowglad-h-8 flowglad-rounded-md flowglad-gap-1.5 flowglad-px-3 has-[>svg]:flowglad-px-2.5',
        lg: 'flowglad-h-10 flowglad-rounded-md flowglad-px-6 has-[>svg]:flowglad-px-4',
        icon: 'flowglad-size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
