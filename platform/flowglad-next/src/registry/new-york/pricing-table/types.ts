export interface PricingFeature {
  text: string
  included: boolean
  tooltip?: string
}

// Product represents a sellable item (what was previously called a "tier")
export interface PricingProduct {
  id: string
  name: string
  price: number
  currency: string
  period: 'month' | 'year'
  description: string
  features: PricingFeature[]
  cta: {
    text: string
    variant?: 'default' | 'outline' | 'secondary' | 'ghost'
    disabled?: boolean
  }
  popular?: boolean
  current?: boolean
  footnote?: string
}

// ProductGroup is a localized grouping concept (e.g., "Personal" vs "Business")
export interface PricingProductGroup {
  name: string
  slug: string
  products: PricingProduct[]
}

export interface PricingTableProps {
  productGroups: PricingProductGroup[]
  currentGroupSlug?: string
  onProductSelect?: (productId: string, groupSlug: string) => void
  showToggle?: boolean
  className?: string
}