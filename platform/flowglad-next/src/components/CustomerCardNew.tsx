'use client'

import * as React from 'react'
import Link from 'next/link'
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
          'gap-3 px-4 py-2 border border-border rounded-[6px] bg-card-50 hover:bg-card shadow-xs hover:shadow-sm',
        simple:
          'gap-2 px-3 py-2 border border-border rounded-[6px] bg-card-50 hover:bg-card hover:border-muted-foreground shadow-xs hover:shadow-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface CustomerCardNewProps
  extends VariantProps<typeof customerCardVariants> {
  /** Customer's display name */
  name: string
  /** Customer's email address */
  email: string
  /** Optional avatar image URL */
  avatarUrl?: string | null
  /** Optional href to make the card a link (preferred for navigation) */
  href?: string
  /** Click/activate handler (mouse or keyboard activation) */
  onClick?: (
    event:
      | React.MouseEvent<HTMLDivElement>
      | React.KeyboardEvent<HTMLDivElement>
  ) => void
  /** Optional additional keydown handler */
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void
  /** Optional className */
  className?: string
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
const CustomerCardNew = React.forwardRef<HTMLElement, CustomerCardNewProps>(
  (
    { className, variant, name, email, avatarUrl, href, onClick, onKeyDown },
    forwardedRef
  ) => {
    // Callback ref that forwards to the parent ref with proper typing
    const setRef = React.useCallback(
      (element: HTMLDivElement | HTMLAnchorElement | null) => {
        if (typeof forwardedRef === 'function') {
          forwardedRef(element)
        } else if (forwardedRef) {
          forwardedRef.current = element
        }
      },
      [forwardedRef]
    )

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (onClick && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        onClick(e)
      }
      onKeyDown?.(e)
    }

    const isClickable = Boolean(href || onClick)

    const content = (
      <>
        {/* Avatar - 40px, bg-muted fallback with first letter */}
        <Avatar
          className="h-10 w-10 shrink-0"
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
      </>
    )

    const cardClassName = cn(
      customerCardVariants({ variant }),
      isClickable && 'cursor-pointer',
      className
    )

    // If href is provided, wrap in Link
    if (href) {
      return (
        <Link
          href={href}
          ref={setRef}
          className={cardClassName}
        >
          {content}
        </Link>
      )
    }

    // If onClick is provided, make it a button-like div
    if (onClick) {
      return (
        <div
          ref={setRef}
          role="button"
          tabIndex={0}
          onClick={onClick}
          onKeyDown={handleKeyDown}
          className={cardClassName}
        >
          {content}
        </div>
      )
    }

    // Default: non-interactive card
    return (
      <div
        ref={setRef}
        className={cardClassName}
      >
        {content}
      </div>
    )
  }
)
CustomerCardNew.displayName = 'CustomerCardNew'

export { CustomerCardNew, customerCardVariants }

