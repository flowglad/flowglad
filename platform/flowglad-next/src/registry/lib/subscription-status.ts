export type SubscriptionStatus =
  | 'active'
  | 'canceled'
  | 'past_due'
  | 'trialing'

export function getStatusColor(status: SubscriptionStatus): string {
  switch (status) {
    case 'active':
      return 'text-green-600 bg-green-50 border-green-200'
    case 'trialing':
      return 'text-blue-600 bg-blue-50 border-blue-200'
    case 'past_due':
      return 'text-red-600 bg-red-50 border-red-200'
    case 'canceled':
      return 'text-gray-600 bg-gray-50 border-gray-200'
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200'
  }
}

export function getStatusBadgeVariant(
  status: SubscriptionStatus
): 'default' | 'destructive' | 'secondary' | 'outline' {
  switch (status) {
    case 'active':
      return 'default'
    case 'trialing':
      return 'secondary'
    case 'past_due':
      return 'destructive'
    case 'canceled':
      return 'outline'
    default:
      return 'outline'
  }
}

export function getStatusLabel(status: SubscriptionStatus): string {
  switch (status) {
    case 'active':
      return 'Active'
    case 'trialing':
      return 'Trial'
    case 'past_due':
      return 'Past Due'
    case 'canceled':
      return 'Canceled'
    default:
      return status
  }
}
