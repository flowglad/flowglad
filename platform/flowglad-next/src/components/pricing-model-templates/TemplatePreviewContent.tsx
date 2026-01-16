'use client'

import { ArrowLeft, Check, ChevronDown, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { IntervalUnit, PriceType } from '@/types'
import type { PricingModelTemplate } from '@/types/pricingModelTemplates'
import { formatCurrency } from '@/utils/pricingModelTemplates'

interface TemplatePreviewContentProps {
  template: PricingModelTemplate
  onBack: () => void
  onConfirm: ({ isDefault }: { isDefault: boolean }) => void
  isCreating: boolean
}

interface ProductGroup {
  groupKey: string
  displayName: string
  products: Array<PricingModelTemplate['input']['products'][0]>
}

export function TemplatePreviewContent({
  template,
  onBack,
  onConfirm,
  isCreating,
}: TemplatePreviewContentProps) {
  const [expandedProducts, setExpandedProducts] = useState<
    Set<string>
  >(new Set())

  // Reset expanded products when template changes
  useEffect(() => {
    setExpandedProducts(new Set())
  }, [template])

  const toggleProduct = (groupKey: string) => {
    const newExpanded = new Set(expandedProducts)
    if (newExpanded.has(groupKey)) {
      newExpanded.delete(groupKey)
    } else {
      newExpanded.add(groupKey)
    }
    setExpandedProducts(newExpanded)
  }

  // Group products by displayGroup (or slug if no displayGroup)
  const productGroups = useMemo((): ProductGroup[] => {
    const groupMap = new Map<string, ProductGroup>()

    // Filter out hidden products. PriceType.Usage prices are required to create usage events
    // even when overages aren't desired, so we hide them to avoid confusion
    // in plans where the intent is to disallow overages.
    template.input.products
      .filter((product) => product.displayGroup !== 'hidden')
      .forEach((product) => {
        // Determine the grouping key: use displayGroup if set, otherwise fall back to product slug
        const groupKey = product.displayGroup || product.product.slug

        // Create a new group entry if this is the first product in this group
        // The groupMap organizes products into display groups for the UI,
        // allowing multiple products to be shown together under a single group header
        if (!groupMap.has(groupKey)) {
          groupMap.set(groupKey, {
            groupKey,
            displayName: product.product.name,
            products: [],
          })
        }

        // Add the current product to its corresponding group
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
  }, [template.input.products])

  // Get the default price for each product (monthly if available)
  const getDefaultPrice = (
    product: (typeof template.input.products)[0]
  ) => {
    return product.price
  }

  // Get the appropriate suffix for a price based on its type and product labels
  // Note: Product prices are only subscription or single payment.
  // Usage prices are nested under usageMeters[].prices.
  const getPriceSuffix = (
    price: (typeof template.input.products)[0]['price'],
    _product: (typeof template.input.products)[0]
  ) => {
    if (price.type === PriceType.SinglePayment) {
      return ''
    }

    // For subscriptions, show interval
    if (price.intervalUnit === IntervalUnit.Month) {
      return '/mo'
    }
    if (price.intervalUnit === IntervalUnit.Year) {
      return '/yr'
    }

    return ''
  }

  const [isDefault, setIsDefault] = useState(true)

  return (
    <div className="flex flex-col justify-between items-start max-h-[calc(90vh-2rem)] overflow-clip h-full isolate">
      {/* Top Section - Scrollable content */}
      <div className="flex flex-col gap-4 items-start w-full overflow-y-auto min-h-0 z-[2]">
        {/* Header */}
        <div className="flex flex-col gap-1.5 items-start px-3 pt-2 pb-0 w-full">
          <h2 className="text-lg" aria-hidden="true">
            {template.metadata.title}
          </h2>
          <p className="text-sm text-muted-foreground">
            Confirm your subscription-based plans. You can change this
            later
          </p>
        </div>

        {/* Products Section */}
        <div className="flex flex-col gap-2 items-start w-full">
          <div className="flex flex-col gap-2 items-start w-full">
            {productGroups.map((group) => {
              // Get the first product's default price for display
              const firstProduct = group.products[0]
              const defaultPrice = getDefaultPrice(firstProduct)
              const isExpanded = expandedProducts.has(group.groupKey)

              return (
                <button
                  key={group.groupKey}
                  onClick={() => toggleProduct(group.groupKey)}
                  className="group bg-accent text-secondary-foreground hover:bg-[hsl(0_0%_0%/10%)] dark:bg-accent dark:hover:bg-[hsl(0_0%_100%/15%)] rounded-[4px] transition-colors w-full cursor-pointer text-left"
                >
                  {/* Product Card Header */}
                  <div className="p-3 flex items-center w-full">
                    {/* Product Name & Price Wrapper */}
                    <div className="flex items-center gap-2">
                      {/* Product Name */}
                      <div className="flex gap-2 items-center px-2 py-0">
                        <h3 className="text-md font-semibold whitespace-nowrap font-sans">
                          {group.displayName}
                        </h3>
                      </div>

                      {/* Price */}
                      <div className="flex items-start px-2 py-0">
                        <div className="flex gap-1.5 items-center">
                          <div className="flex items-end justify-center whitespace-nowrap">
                            <span className="text-md font-semibold">
                              {formatCurrency(
                                defaultPrice.unitPrice
                              ).replace('.00', '')}
                            </span>
                            <span className="text-base font-medium text-muted-foreground">
                              {getPriceSuffix(
                                defaultPrice,
                                firstProduct
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Features Dropdown */}
                    <div className="flex-1 min-w-0 flex gap-1 items-end justify-end px-2 py-0">
                      <div className="flex items-center gap-1 text-base text-muted-foreground group-hover:text-foreground transition-colors truncate">
                        <span>Features</span>
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="px-6 pb-3 flex flex-col gap-2.5">
                      {/* Prices List - Show price from each product in the group */}
                      {group.products.map((product) => {
                        const price = product.price
                        return (
                          <div
                            key={price.slug}
                            className="flex gap-2.5 items-start w-full"
                          >
                            <div className="flex gap-2.5 items-center py-0.5 px-0">
                              <Check className="h-3.5 w-3.5 text-accent-foreground flex-shrink-0" />
                            </div>
                            <span className="flex-1 min-w-0 text-sm text-accent-foreground">
                              {formatCurrency(
                                price.unitPrice
                              ).replace('.00', '')}
                              {getPriceSuffix(price, product)}
                            </span>
                          </div>
                        )
                      })}

                      {/* Features List - Use features from first product (all products in group should have same features) */}
                      {firstProduct.features.map(
                        (featureSlug: string) => {
                          const feature =
                            template.input.features.find(
                              (f) => f.slug === featureSlug
                            )

                          // Format feature name with amount if it's a usage credit grant
                          let displayName =
                            feature?.name || featureSlug

                          // Only prepend amount if the name doesn't already start with a number
                          const startsWithNumber = /^\d/.test(
                            feature?.name || ''
                          )

                          if (
                            feature &&
                            'amount' in feature &&
                            feature.amount &&
                            !startsWithNumber
                          ) {
                            // Remove plan-specific suffix (e.g., " - Hobby", " - Pro")
                            const baseName = feature.name.replace(
                              /\s*-\s*\w+\+?$/,
                              ''
                            )
                            // Format amount with K notation for thousands
                            let formattedAmount
                            if (feature.amount >= 1000) {
                              const thousands = feature.amount / 1000
                              formattedAmount =
                                thousands % 1 === 0
                                  ? `${thousands}K`
                                  : `${thousands.toFixed(1)}K`
                            } else {
                              formattedAmount =
                                feature.amount.toString()
                            }
                            displayName = `${formattedAmount} ${baseName}`
                          }

                          return (
                            <div
                              key={featureSlug}
                              className="flex gap-2.5 items-start w-full"
                            >
                              <div className="flex gap-2.5 items-center py-0.5 px-0">
                                <Check className="h-3.5 w-3.5 text-accent-foreground flex-shrink-0" />
                              </div>
                              <span className="flex-1 min-w-0 text-sm text-accent-foreground">
                                {displayName}
                              </span>
                            </div>
                          )
                        }
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-2 px-3 pt-4">
        <Switch
          id="is-default"
          checked={isDefault}
          onCheckedChange={setIsDefault}
        />
        <div className="grid gap-1.5 leading-none">
          <label
            htmlFor="is-default"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
          >
            Make Default
          </label>
          <p className="text-sm text-muted-foreground">
            New customers will be assigned to this pricing model by
            default.
          </p>
        </div>
      </div>
      {/* Bottom Section - Footer */}
      <div className="flex flex-col items-start w-full shrink-0 z-[1]">
        {/* Action Buttons */}
        <div className="flex items-start justify-between w-full gap-4 pt-4">
          <Button
            variant="secondary"
            size="icon"
            onClick={onBack}
            className="rounded-[4px]"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button
            onClick={() => onConfirm({ isDefault })}
            disabled={isCreating}
            variant="default"
            className="rounded-[4px]"
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
  )
}
