export interface PricingFeature {
  text: string
  included: boolean
  tooltip?: string
}

// Price object containing all pricing-related information
export interface PricingTablePrice {
  /**
   * The price amount in the smallest countable integer for the currency.
   * For example, cents for USD/EUR (100 = $1.00), or the whole amount for
   * zero-decimal currencies like JPY (100 = ¥100).
   */
  unitAmount: number
  currency: string
  intervalUnit: 'day' | 'week' | 'month' | 'year'
  intervalCount: number
}

// Product represents a sellable item (what was previously called a "tier")
export interface PricingTableProduct {
  slug: string
  name: string
  price: PricingTablePrice
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
  onProductSelect?: ({ productSlug, groupSlug }: { productSlug: string; groupSlug: string }) => void
  showToggle?: boolean
  className?: string
}