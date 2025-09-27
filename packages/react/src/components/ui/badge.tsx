import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'flowglad-inline-flex flowglad-items-center flowglad-justify-center flowglad-rounded-md flowglad-border flowglad-px-2 flowglad-py-0.5 flowglad-text-xs flowglad-font-medium flowglad-w-fit flowglad-whitespace-nowrap flowglad-shrink-0 [&>svg]:flowglad-size-3 flowglad-gap-1 [&>svg]:flowglad-pointer-events-none flowglad-focus-visible:border-ring flowglad-focus-visible:ring-ring/50 flowglad-focus-visible:ring-[3px] flowglad-aria-invalid:ring-destructive/20 flowglad-dark:aria-invalid:ring-destructive/40 flowglad-aria-invalid:border-destructive flowglad-transition-[color,box-shadow] flowglad-overflow-hidden',
  {
    variants: {
      variant: {
        default:
          'flowglad-border-transparent flowglad-bg-primary flowglad-text-primary-foreground',
        secondary:
          'flowglad-border-transparent flowglad-bg-secondary flowglad-text-secondary-foreground',
        destructive:
          'flowglad-border-transparent flowglad-bg-destructive flowglad-text-white flowglad-focus-visible:ring-destructive/20 flowglad-dark:focus-visible:ring-destructive/40',
        outline: 'flowglad-text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span'

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
