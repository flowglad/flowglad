export interface PricingFeature {
  text: string
  included: boolean
  tooltip?: string
}

export interface PricingTier {
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

export interface PricingProduct {
  name: string
  slug: string
  tiers: PricingTier[]
}

export interface PricingTableProps {
  products: PricingProduct[]
  currentProductSlug?: string
  onTierSelect?: (tierId: string, productSlug: string) => void
  showToggle?: boolean
  className?: string
}