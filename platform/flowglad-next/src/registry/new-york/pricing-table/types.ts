export interface PricingFeature {
  text: string
  included: boolean
  tooltip?: string
}

// Price object containing all pricing-related information
export interface Price {
  unitAmount: number
  currency: string
  intervalUnit: 'day' | 'week' | 'month' | 'year'
  intervalCount: number
}

// Product represents a sellable item (what was previously called a "tier")
export interface PricingTableProduct {
  slug: string
  name: string
  price: Price
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
  products: PricingTableProduct[]
}

export interface PricingTableProps {
  productGroups: PricingProductGroup[]
  currentGroupSlug?: string
  onProductSelect?: (productSlug: string, groupSlug: string) => void
  showToggle?: boolean
  className?: string
}