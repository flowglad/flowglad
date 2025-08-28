import * as React from 'react'
import { cn } from '@/utils/core'
import { Badge } from '@/components/ui/badge'

interface PricingHeaderProps {
  name: string
  price: number
  currency: string
  period: 'month' | 'year'
  description: string
  popular?: boolean
  className?: string
}

export function PricingHeader({
  name,
  price,
  currency,
  period,
  description,
  popular,
  className
}: PricingHeaderProps) {
  const currencySymbol = currency === 'USD' ? '$' : currency

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
        <span className="text-5xl font-normal tracking-tight text-foreground">{price}</span>
        <div className="ml-1 text-xs text-muted-foreground">
          <div>{currency} /</div>
          <div>{period}</div>
        </div>
      </div>
      
      <p className="text-base font-medium min-h-[48px] text-muted-foreground">{description}</p>
    </div>
  )
}