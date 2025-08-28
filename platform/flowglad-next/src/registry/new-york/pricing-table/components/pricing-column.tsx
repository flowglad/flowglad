'use client'

import * as React from 'react'
import { cn } from '@/utils/core'
import { Button } from '@/components/ui/button'
import { Card } from './card'
import { PricingHeader } from './pricing-header'
import { PricingFeature } from './pricing-feature'
import type { PricingTier } from '../types'

interface PricingColumnProps {
  tier: PricingTier
  onSelect?: (tierId: string) => void
  className?: string
}

export function PricingColumn({
  tier,
  onSelect,
  className
}: PricingColumnProps) {
  const handleSelect = () => {
    if (onSelect && !tier.current) {
      onSelect(tier.id)
    }
  }

  return (
    <Card 
      className={cn(
        "relative flex flex-col p-6 h-full",
        tier.popular && "bg-accent/20 border-accent",
        className
      )}
    >
      <PricingHeader
        name={tier.name}
        price={tier.price}
        currency={tier.currency}
        period={tier.period}
        description={tier.description}
        popular={tier.popular}
      />

      <div className="mt-6 mb-8">
        <Button
          className={cn(
            "w-full",
            tier.popular && !tier.current && "bg-primary hover:bg-primary/90 text-primary-foreground",
            tier.popular && tier.current && "bg-primary/50 text-primary-foreground",
            !tier.popular && !tier.current && "",
            tier.current && "opacity-50"
          )}
          variant={tier.current ? "outline" : tier.popular ? "default" : "default"}
          disabled={tier.current || tier.cta.disabled}
          onClick={handleSelect}
        >
          {tier.current ? "Your current plan" : tier.cta.text}
        </Button>
      </div>

      <div className="flex-1">
        <div className="space-y-4">
          {tier.features.map((feature, index) => (
            <PricingFeature
              key={index}
              text={feature.text}
              included={feature.included}
              tooltip={feature.tooltip}
            />
          ))}
        </div>
      </div>

      {tier.footnote && (
        <div className="mt-6 pt-4 border-t">
          <p className="text-xs text-muted-foreground">
            {tier.footnote}
          </p>
        </div>
      )}
    </Card>
  )
}