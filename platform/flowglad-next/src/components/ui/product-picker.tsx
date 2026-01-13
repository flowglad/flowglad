'use client'

import { Check } from 'lucide-react'
import * as React from 'react'
import { trpc } from '@/app/_trpc/client'
import { ChevronDown } from '@/components/icons/navigation'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface ProductPickerProps {
  /** Currently selected product ID, or null for "All Products" */
  value: string | null
  /** Callback when the selection changes */
  onValueChange: (value: string | null) => void
  /** Optional className for the root container */
  className?: string
  /** Whether the picker is disabled */
  disabled?: boolean
}

/**
 * A dropdown picker for filtering dashboard data by product.
 *
 * Features:
 * - "All Products" option (value: null) to show aggregate data
 * - Only shows active products
 * - Search functionality to filter products by name
 * - Uses Command + Popover combobox pattern
 * - 15-minute cache (products change rarely)
 *
 * @example
 * const [productId, setProductId] = useState<string | null>(null)
 *
 * <ProductPicker
 *   value={productId}
 *   onValueChange={setProductId}
 * />
 */
export function ProductPicker({
  value,
  onValueChange,
  className,
  disabled = false,
}: ProductPickerProps) {
  const [open, setOpen] = React.useState(false)

  // Fetch only active products with longer cache time (products change rarely)
  const { data: productsData, isLoading } =
    trpc.products.getTableRows.useQuery(
      { pageSize: 100, filters: { active: true } },
      {
        staleTime: 15 * 60 * 1000, // 15 minutes
        refetchOnWindowFocus: false,
      }
    )

  // Sort products by revenue (highest first), then by creation date (newest first)
  const products = React.useMemo(() => {
    const items = productsData?.items ?? []

    return [...items].sort((a, b) => {
      // 1. Revenue (desc) - products making money appear first
      const revDiff = (b.totalRevenue ?? 0) - (a.totalRevenue ?? 0)
      if (revDiff !== 0) return revDiff

      // 2. Creation date tiebreaker (newer first)
      return b.product.createdAt - a.product.createdAt
    })
  }, [productsData?.items])

  // Find selected product name (note: nested structure - item.product.id NOT item.id)
  const selectedProduct = value
    ? products.find((p) => p.product.id === value)
    : null

  const displayText = selectedProduct?.product.name ?? 'All Products'

  // Reset selection if selected product no longer exists (e.g., deleted)
  React.useEffect(() => {
    if (value && !isLoading && products.length > 0) {
      const productExists = products.some(
        (p) => p.product.id === value
      )
      if (!productExists) {
        onValueChange(null)
      }
    }
  }, [value, products, isLoading, onValueChange])

  const handleSelect = (productId: string | null) => {
    onValueChange(productId)
    setOpen(false)
  }

  // Handle empty products state
  if (!isLoading && products.length === 0) {
    return (
      <div className={cn('grid gap-2', className)}>
        <Button variant="ghost" className="text-foreground" disabled>
          No Products
          <ChevronDown className="ml-auto h-4 w-4 opacity-50" />
        </Button>
      </div>
    )
  }

  return (
    <div className={cn('grid gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            role="combobox"
            aria-expanded={open}
            className="text-foreground"
            disabled={disabled || isLoading}
          >
            {isLoading ? 'Loading...' : displayText}
            <ChevronDown className="ml-auto h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search products..." />
            <CommandList className="max-h-64 overflow-auto">
              <CommandEmpty>No products found.</CommandEmpty>
              <CommandGroup>
                {/* All Products option */}
                <CommandItem
                  value="all-products"
                  onSelect={() => handleSelect(null)}
                  className="cursor-pointer"
                >
                  All Products
                  <Check
                    className={cn(
                      'ml-auto h-4 w-4',
                      value === null ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                </CommandItem>
                {/* Product options - note nested structure */}
                {products.map(({ product }) => (
                  <CommandItem
                    key={product.id}
                    value={`${product.id} ${product.name}`}
                    keywords={[product.name]}
                    onSelect={() => handleSelect(product.id)}
                    className="cursor-pointer"
                  >
                    <span className="truncate">{product.name}</span>
                    <Check
                      className={cn(
                        'ml-auto h-4 w-4',
                        value === product.id
                          ? 'opacity-100'
                          : 'opacity-0'
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
