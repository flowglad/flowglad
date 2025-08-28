import * as React from 'react'
import { cn } from '@/utils/core'
import { Badge } from '@/components/ui/badge'
import type { Price } from '../types'

interface PricingHeaderProps {
  name: string
  price: Price
  description: string
  popular?: boolean
  className?: string
}

export function PricingHeader({
  name,
  price,
  description,
  popular,
  className
}: PricingHeaderProps) {
  const currencySymbol = price.currency === 'USD' ? '$' : price.currency
  
  // Format the interval display (e.g., "month", "3 months", "year")
  const intervalDisplay = price.intervalCount === 1 
    ? price.intervalUnit 
    : `${price.intervalCount} ${price.intervalUnit}s`

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-semibold text-foreground">{name}</h3>
        {popular && (
          <Badge 
            variant="secondary"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            POPULAR
          </Badge>
        )}
      </div>
      
      <div className="flex items-baseline gap-1">
        <span className="text-xl text-muted-foreground">{currencySymbol}</span>
        <span className="text-5xl font-normal tracking-tight text-foreground">{price.unitAmount}</span>
        <div className="ml-1 text-xs text-muted-foreground">
          <div>{price.currency} /</div>
          <div>{intervalDisplay}</div>
        </div>
      </div>
      
      <p className="text-base font-medium min-h-[48px] text-muted-foreground">{description}</p>
    </div>
  )
}