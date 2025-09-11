'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/registry/lib/cn'
import { Button } from '@/components/ui/button'
import { PricingToggle } from './pricing-toggle'
import { PricingColumn } from './pricing-column'
import type { PricingTableProps } from './types'

export function PricingTable({
  productGroups,
  currentGroupSlug = 'personal',
  onProductSelect,
  showToggle = true,
  className,
}: PricingTableProps) {
  const [selectedGroupSlug, setSelectedGroupSlug] =
    React.useState(currentGroupSlug)
  const [isOpen, setIsOpen] = React.useState(true)

  const currentGroup =
    productGroups.find((g) => g.slug === selectedGroupSlug) ||
    productGroups[0]
  const groupOptions = productGroups.map((g) => ({
    name: g.name,
    slug: g.slug,
  }))

  const handleProductSelect = (productSlug: string) => {
    if (onProductSelect) {
      onProductSelect({ productSlug, groupSlug: selectedGroupSlug })
    }
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className={cn('relative w-full', className)}>
      <div className="bg-muted/50 rounded-t-lg">
        <div className="relative px-6 py-4 sm:py-6 lg:py-8">
          <div className="flex flex-col items-center space-y-6">
            <h2 className="text-2xl sm:text-3xl font-normal text-center text-foreground">
              Upgrade your plan
            </h2>

            {showToggle && productGroups.length > 1 && (
              <PricingToggle
                options={groupOptions.map((g) => g.name)}
                selected={currentGroup?.name || ''}
                onChange={(name) => {
                  const group = groupOptions.find(
                    (g) => g.name === name
                  )
                  if (group) setSelectedGroupSlug(group.slug)
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
          <div
            className={cn(
              'grid gap-6',
              'grid-cols-1',
              'lg:grid-cols-3',
              'max-w-6xl mx-auto'
            )}
          >
            {currentGroup?.products.map((product) => (
              <PricingColumn
                key={product.slug}
                product={product}
                onSelect={handleProductSelect}
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
            <a href="#" className="underline font-normal">
              ChatGPT Enterprise
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
