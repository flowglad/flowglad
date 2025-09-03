export interface CustomerProfile {
  id: string
  name: string
  email: string
  organizationId: string
  organizationName?: string
  createdAt: Date | string
  avatarUrl?: string
  metadata?: Record<string, any>
}

export interface CustomerSelectorProps {
  customers: CustomerProfile[]
  onSelect: (customerId: string) => void
  selectedCustomerId?: string
  loading?: boolean
  searchable?: boolean
  className?: string
  emptyStateMessage?: string
  gridCols?: 1 | 2 | 3 | 4
}

export interface CustomerCardProps {
  customer: CustomerProfile
  isSelected?: boolean
  onClick: () => void
  className?: string
}

export interface CustomerAvatarProps {
  name: string
  avatarUrl?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}
