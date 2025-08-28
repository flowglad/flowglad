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
        <h3 className="text-2xl font-semibold">{name}</h3>
        {popular && (
          <Badge 
            variant="secondary"
            className="bg-blue-100 text-blue-600 hover:bg-blue-100"
          >
            POPULAR
          </Badge>
        )}
      </div>
      
      <div className="flex items-baseline gap-1">
        <span className="text-xl text-muted-foreground">{currencySymbol}</span>
        <span className="text-5xl font-normal tracking-tight">{price}</span>
        <div className="ml-1 text-xs text-muted-foreground">
          <div>{currency} /</div>
          <div>{period}</div>
        </div>
      </div>
      
      <p className="text-base font-medium min-h-[48px]">{description}</p>
    </div>
  )
}