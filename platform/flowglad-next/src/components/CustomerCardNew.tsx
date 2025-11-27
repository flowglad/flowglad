'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

const customerCardVariants = cva(
  // Base styles
  'box-border flex items-center w-full transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'gap-3 p-4 border border-border rounded-lg hover:shadow-md',
        simple:
          'gap-2 px-3 py-1 border border-border rounded-[6px] hover:bg-secondary hover:border-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface CustomerCardNewProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof customerCardVariants> {
  /** Customer's display name */
  name: string
  /** Customer's email address */
  email: string
  /** Optional avatar image URL */
  avatarUrl?: string | null
}

/**
 * Gets the first letter of the name for avatar fallback
 * Per Figma design: single letter display
 */
const getFirstLetter = (name: string) => {
  const trimmed = name.trim()
  return trimmed[0]?.toUpperCase() || 'U'
}

/**
 * CustomerCardNew component
 *
 * A customer card with two variants:
 * - default: Standard card with more padding and shadow hover
 * - simple: Compact card with background/border hover states
 */
const CustomerCardNew = React.forwardRef<HTMLDivElement, CustomerCardNewProps>(
  ({ className, variant, name, email, avatarUrl, onClick, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={
          onClick
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onClick(e as unknown as React.MouseEvent<HTMLDivElement>)
                }
              }
            : undefined
        }
        className={cn(
          customerCardVariants({ variant }),
          onClick && 'cursor-pointer',
          className
        )}
        {...props}
      >
        {/* Avatar - 40px with border, bg-muted fallback with first letter */}
        <Avatar
          className={cn(
            'h-10 w-10 shrink-0 border border-border transition-colors',
            variant === 'simple' && '[div:hover>&]:border-muted-foreground'
          )}
        >
          {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
          <AvatarFallback className="bg-muted text-sm font-normal leading-5 text-foreground">
            {getFirstLetter(name)}
          </AvatarFallback>
        </Avatar>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Name: 16px medium, line-height 24px */}
          <p className="truncate text-base font-medium leading-6 text-card-foreground">
            {name}
          </p>
          {/* Email: 14px regular, line-height 20px */}
          <p
            className={cn(
              'truncate text-sm font-normal leading-5 text-muted-foreground transition-colors',
              variant === 'simple' && '[div:hover>&]:text-foreground'
            )}
          >
            {email}
          </p>
        </div>
      </div>
    )
  }
)
CustomerCardNew.displayName = 'CustomerCardNew'

export { CustomerCardNew, customerCardVariants }

