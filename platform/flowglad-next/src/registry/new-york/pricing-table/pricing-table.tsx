'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/utils/core'
import { Button } from '@/components/ui/button'
import { PricingToggle } from './components/pricing-toggle'
import { PricingColumn } from './components/pricing-column'
import type { PricingTableProps } from './types'

export function PricingTable({
  products,
  currentProductSlug = 'personal',
  onTierSelect,
  showToggle = true,
  className
}: PricingTableProps) {
  const [selectedProductSlug, setSelectedProductSlug] = React.useState(currentProductSlug)
  const [isOpen, setIsOpen] = React.useState(true)

  const currentProduct = products.find(p => p.slug === selectedProductSlug) || products[0]
  const productOptions = products.map(p => ({ name: p.name, slug: p.slug }))

  const handleTierSelect = (tierId: string) => {
    if (onTierSelect) {
      onTierSelect(tierId, selectedProductSlug)
    }
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className={cn("relative w-full", className)}>
      <div className="bg-muted/50 rounded-t-lg">
        <div className="relative px-6 py-4 sm:py-6 lg:py-8">
          <div className="flex flex-col items-center space-y-6">
            <h2 className="text-2xl sm:text-3xl font-medium text-center text-foreground">
              Upgrade your plan
            </h2>
            
            {showToggle && products.length > 1 && (
              <PricingToggle
                options={productOptions.map(p => p.name)}
                selected={currentProduct?.name || ''}
                onChange={(name) => {
                  const product = productOptions.find(p => p.name === name)
                  if (product) setSelectedProductSlug(product.slug)
                }}
              />
            )}
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-4"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-4 sm:px-6 pb-6 sm:pb-8">
          <div className={cn(
            "grid gap-6",
            "grid-cols-1",
            "lg:grid-cols-3",
            "max-w-6xl mx-auto"
          )}>
            {currentProduct?.tiers.map((tier) => (
              <PricingColumn
                key={tier.id}
                tier={tier}
                onSelect={handleTierSelect}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="bg-muted/50 rounded-b-lg px-6 py-8 text-center border-t border-border">
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-1">
            <span className="text-2xl">🏢</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Need more capabilities for your business?
          </p>
          <p className="text-sm text-muted-foreground">
            See{' '}
            <a href="#" className="underline font-medium">
              ChatGPT Enterprise
            </a>
          </p>
        </div>
        
        <div className="absolute bottom-4 right-4">
          <Button variant="outline" size="sm" className="text-xs">
            United States
            <svg
              className="ml-2 h-3 w-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </Button>
        </div>
      </div>
    </div>
  )
}