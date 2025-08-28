'use client'

import * as React from 'react'
import { cn } from '@/utils/core'
import { Button } from '@/components/ui/button'
import { Card } from './card'
import { PricingHeader } from './pricing-header'
import { PricingFeature } from './pricing-feature'
import type { PricingProduct } from '../types'

interface PricingColumnProps {
  product: PricingProduct
  onSelect?: (productId: string) => void
  className?: string
}

export function PricingColumn({
  product,
  onSelect,
  className
}: PricingColumnProps) {
  const handleSelect = () => {
    if (onSelect && !product.current) {
      onSelect(product.id)
    }
  }

  return (
    <Card 
      className={cn(
        "relative flex flex-col p-6 h-full",
        product.popular && "bg-accent/20 border-accent",
        className
      )}
    >
      <PricingHeader
        name={product.name}
        price={product.price}
        currency={product.currency}
        period={product.period}
        description={product.description}
        popular={product.popular}
      />

      <div className="mt-6 mb-8">
        <Button
          className={cn(
            "w-full",
            product.popular && !product.current && "bg-primary hover:bg-primary/90 text-primary-foreground",
            product.popular && product.current && "bg-primary/50 text-primary-foreground",
            !product.popular && !product.current && "",
            product.current && "opacity-50"
          )}
          variant={product.current ? "outline" : product.popular ? "default" : "default"}
          disabled={product.current || product.cta.disabled}
          onClick={handleSelect}
        >
          {product.current ? "Your current plan" : product.cta.text}
        </Button>
      </div>

      <div className="flex-1">
        <div className="space-y-4">
          {product.features.map((feature, index) => (
            <PricingFeature
              key={index}
              text={feature.text}
              included={feature.included}
              tooltip={feature.tooltip}
            />
          ))}
        </div>
      </div>

      {product.footnote && (
        <div className="mt-6 pt-4 border-t">
          <p className="text-xs text-muted-foreground">
            {product.footnote}
          </p>
        </div>
      )}
    </Card>
  )
}