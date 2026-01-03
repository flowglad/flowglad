'use client'

import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import type { Price } from '@/db/schema/prices'
import { cn } from '@/lib/utils'
import { getCurrencyParts } from '@/utils/stripe'

/**
 * UsagePriceCard variants configuration
 */
const usagePriceCardVariants = cva(
  'relative box-border rounded-[6px] border transition-all duration-200 w-full',
  {
    variants: {
      state: {
        default: 'bg-card-muted border-border shadow-realistic-sm',
        hover: 'bg-card border-muted-foreground shadow-realistic-sm',
      },
    },
    defaultVariants: {
      state: 'default',
    },
  }
)

export interface UsagePriceCardProps
  extends Omit<React.HTMLAttributes<HTMLElement>, 'onClick'>,
    VariantProps<typeof usagePriceCardVariants> {
  /** The usage price to display */
  price: Price.ClientRecord
  /** Callback when card is clicked */
  onClick?: () => void
}

/**
 * Format the usage price rate for display
 */
function formatUsagePriceRate(price: Price.ClientRecord): {
  currencySymbol: string
  unitPrice: string
  eventsPerUnit: number
} {
  const { symbol, value } = getCurrencyParts(
    price.currency,
    price.unitPrice,
    { hideZeroCents: true }
  )

  return {
    currencySymbol: symbol,
    unitPrice: value,
    eventsPerUnit:
      price.type === 'usage' ? (price.usageEventsPerUnit ?? 1) : 1,
  }
}

/**
 * UsagePriceCard component
 *
 * Displays usage price information including slug, rate, and active status.
 * Designed for the Usage Meter details page Prices section.
 */
const UsagePriceCard = React.forwardRef<
  HTMLElement,
  UsagePriceCardProps
>(({ className, state, price, onClick, ...props }, forwardedRef) => {
  const [isHovered, setIsHovered] = React.useState(false)

  // Callback ref that forwards to the parent ref with proper typing
  const setRef = React.useCallback(
    (element: HTMLDivElement | null) => {
      if (typeof forwardedRef === 'function') {
        forwardedRef(element)
      } else if (forwardedRef) {
        forwardedRef.current = element
      }
    },
    [forwardedRef]
  )

  const currentState = isHovered ? 'hover' : state
  const isClickable = Boolean(onClick)
  const { currencySymbol, unitPrice, eventsPerUnit } =
    formatUsagePriceRate(price)

  const content = (
    <div className="flex flex-col gap-4 px-3 py-2.5">
      {/* Card Header */}
      <div className="flex flex-col gap-0.5 w-full">
        {/* Slug */}
        <p className="font-sans font-medium text-base leading-6 text-card-foreground whitespace-nowrap">
          {price.slug || price.id}
        </p>
        {/* Active/Inactive status */}
        <p className="font-sans font-normal text-sm leading-none text-muted-foreground whitespace-nowrap">
          {price.active ? 'Active' : 'Inactive'}
        </p>
      </div>

      {/* Price Rate */}
      <div className="flex items-center leading-none w-full whitespace-nowrap">
        <span className="font-heading font-medium text-2xl leading-none text-card-foreground">
          {currencySymbol}
          {unitPrice}
        </span>
        <span className="font-sans font-medium text-base leading-6 text-muted-foreground">
          /
        </span>
        <span className="font-sans font-medium text-base leading-6 text-muted-foreground">
          {eventsPerUnit === 1 ? 'event' : `${eventsPerUnit} events`}
        </span>
      </div>
    </div>
  )

  const cardClassName = cn(
    usagePriceCardVariants({
      state: currentState,
    }),
    isClickable && 'cursor-pointer',
    className
  )

  const commonProps = {
    'data-slot': 'usage-price-card',
    'data-state': currentState,
    onMouseEnter: () => setIsHovered(true),
    onMouseLeave: () => setIsHovered(false),
  }

  // If onClick is provided, make it a button-like div
  if (onClick) {
    return (
      <div
        ref={setRef}
        className={cardClassName}
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick()
          }
        }}
        {...commonProps}
        {...props}
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
      {...commonProps}
      {...props}
    >
      {content}
    </div>
  )
})
UsagePriceCard.displayName = 'UsagePriceCard'

export { UsagePriceCard, usagePriceCardVariants }
