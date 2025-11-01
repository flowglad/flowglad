'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Check, ChevronDown, Loader2 } from 'lucide-react'
import type { PricingModelTemplate } from '@/types/pricingModelTemplates'
import { formatCurrency } from '@/utils/pricingModelTemplates'
import { IntervalUnit } from '@/types'

interface TemplatePreviewModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  template: PricingModelTemplate | null
  onConfirm: () => void
  isCreating: boolean
}

interface ProductGroup {
  groupKey: string
  displayName: string
  products: Array<PricingModelTemplate['input']['products'][0]>
}

export function TemplatePreviewModal({
  isOpen,
  setIsOpen,
  template,
  onConfirm,
  isCreating,
}: TemplatePreviewModalProps) {
  const [expandedProducts, setExpandedProducts] = useState<
    Set<string>
  >(new Set())

  // Reset expanded products when template changes or modal opens
  useEffect(() => {
    setExpandedProducts(new Set())
  }, [template, isOpen])

  // Group products by displayGroup (or slug if no displayGroup)
  const productGroups = useMemo((): ProductGroup[] => {
    if (!template) return []

    const groupMap = new Map<string, ProductGroup>()

    template.input.products.forEach((product) => {
      const groupKey = product.displayGroup || product.product.slug

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          groupKey,
          displayName: product.product.name,
          products: [],
        })
      }

      groupMap.get(groupKey)!.products.push(product)
    })

    // Sort products within each group by displayOrder
    groupMap.forEach((group) => {
      group.products.sort((a, b) => {
        const orderA = a.displayOrder ?? 999
        const orderB = b.displayOrder ?? 999
        return orderA - orderB
      })
    })

    return Array.from(groupMap.values())
  }, [template])

  if (!template) return null

  const toggleProduct = (groupKey: string) => {
    const newExpanded = new Set(expandedProducts)
    if (newExpanded.has(groupKey)) {
      newExpanded.delete(groupKey)
    } else {
      newExpanded.add(groupKey)
    }
    setExpandedProducts(newExpanded)
  }

  // Get the default price for each product (monthly if available)
  const getDefaultPrice = (
    product: (typeof template.input.products)[0]
  ) => {
    // Try to find monthly price first, then default price, then first price
    const monthlyPrice = product.prices.find(
      (p) =>
        p.intervalUnit === IntervalUnit.Month && p.intervalCount === 1
    )
    const defaultPrice = product.prices.find((p) => p.isDefault)
    return monthlyPrice || defaultPrice || product.prices[0]
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="w-[calc(100vw-32px)] sm:max-w-[600px] p-4 sm:p-4 gap-0 overflow-clip">
        <DialogTitle className="sr-only">
          {template.metadata.title}
        </DialogTitle>
        {/* Main container */}
        <div className="flex flex-col justify-between items-start max-h-[calc(90vh-2rem)] overflow-clip h-full isolate">
          {/* Top Section - Scrollable content */}
          <div className="flex flex-col gap-4 items-start w-full overflow-y-auto min-h-0 z-[2]">
            {/* Header */}
            <div className="flex flex-col gap-1 items-start px-6 pt-2 pb-0 w-full">
              <h2
                className="text-2xl font-semibold"
                aria-hidden="true"
              >
                {template.metadata.title}
              </h2>
              <p className="text-base text-muted-foreground opacity-80">
                Confirm your subscription-based plans. You can change
                this later
              </p>
            </div>

            {/* Products Section */}
            <div className="flex flex-col gap-2 items-start w-full">
              <div className="flex flex-col gap-2 items-start w-full">
                {productGroups.map((group) => {
                  const firstProduct = group.products[0]
                  const defaultPrice = getDefaultPrice(firstProduct)
                  const isExpanded = expandedProducts.has(
                    group.groupKey
                  )

                  return (
                    <div
                      key={group.groupKey}
                      className="flex flex-col gap-2 w-full"
                    >
                      {/* Product Card */}
                      <div className="bg-accent p-3 rounded-2xl flex items-center w-full">
                        {/* Product Name */}
                        <div className="flex-1 min-w-0 flex gap-2 items-center px-2 py-0">
                          <h3 className="text-md font-semibold whitespace-nowrap">
                            {group.displayName}
                          </h3>
                        </div>

                        {/* Price */}
                        <div className="flex-1 min-w-0 flex items-start justify-end px-2 py-0">
                          <div className="flex-1 flex gap-1.5 items-center">
                            <div className="flex items-end justify-center whitespace-nowrap">
                              <span className="text-md font-semibold">
                                {formatCurrency(
                                  defaultPrice.unitPrice
                                ).replace('.00', '')}
                              </span>
                              <span className="text-base font-medium text-muted-foreground">
                                /mo
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Features Dropdown */}
                        <div className="flex-1 min-w-0 flex gap-1 items-end justify-end px-2 py-0">
                          <button
                            onClick={() =>
                              toggleProduct(group.groupKey)
                            }
                            className="flex items-center gap-1 text-base text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap overflow-ellipsis overflow-hidden"
                          >
                            <span>Features</span>
                            <ChevronDown
                              className={`h-4 w-4 transition-transform ${
                                isExpanded ? 'rotate-180' : ''
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="px-3 pb-2 flex flex-col gap-2">
                          {/* All Prices - Show all prices from all products in group */}
                          <div className="flex flex-col gap-1">
                            <h4 className="text-sm font-semibold">
                              Prices
                            </h4>
                            {group.products.flatMap((product) =>
                              product.prices.map(
                                (
                                  price: (typeof product.prices)[0]
                                ) => (
                                  <div
                                    key={price.slug}
                                    className="text-sm text-muted-foreground flex justify-between"
                                  >
                                    <span>
                                      {price.intervalUnit ===
                                      IntervalUnit.Month
                                        ? 'Monthly'
                                        : price.intervalUnit ===
                                            IntervalUnit.Year
                                          ? 'Yearly'
                                          : price.name}
                                    </span>
                                    <span>
                                      {formatCurrency(
                                        price.unitPrice
                                      )}
                                    </span>
                                  </div>
                                )
                              )
                            )}
                          </div>

                          {/* Features - Use features from first product */}
                          {firstProduct.features.length > 0 && (
                            <div className="flex flex-col gap-1">
                              <h4 className="text-sm font-semibold">
                                Features
                              </h4>
                              <div className="flex flex-wrap gap-1">
                                {firstProduct.features.map(
                                  (featureSlug: string) => {
                                    const feature =
                                      template.input.features.find(
                                        (f) => f.slug === featureSlug
                                      )
                                    return (
                                      <span
                                        key={featureSlug}
                                        className="text-xs text-muted-foreground bg-secondary/50 px-2 py-1 rounded"
                                      >
                                        {feature?.name || featureSlug}
                                      </span>
                                    )
                                  }
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Bottom Section - Footer */}
          <div className="flex flex-col items-start w-full shrink-0 z-[1]">
            {/* Action Buttons */}
            <div className="flex items-start justify-between w-full">
              <Button
                variant="secondary"
                size="icon"
                onClick={() => setIsOpen(false)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button
                onClick={onConfirm}
                disabled={isCreating}
                variant="default"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Use Template
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
