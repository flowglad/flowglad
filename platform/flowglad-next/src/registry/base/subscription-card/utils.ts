import { SubscriptionStatus, SubscriptionItem } from './types'

export function formatCurrency(
  amount: number,
  currency: string = 'USD'
): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount / 100) // Convert from cents to dollars
}

export function formatDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(dateObj)
}

export function formatBillingInterval(
  interval?: string,
  intervalCount?: number
): string {
  if (!interval) return ''

  const count = intervalCount || 1
  if (count === 1) {
    return `per ${interval}`
  }
  return `every ${count} ${interval}s`
}

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

export function calculateTotalAmount(
  items: SubscriptionItem[]
): number {
  return items.reduce((total, item) => {
    const amount = item.unitAmount * item.quantity
    return total + amount
  }, 0)
}

export function getDaysUntilDate(date: Date | string): number {
  const targetDate = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffTime = targetDate.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays
}

export function formatDaysRemaining(date: Date | string): string {
  const days = getDaysUntilDate(date)

  if (days < 0) {
    return 'Expired'
  } else if (days === 0) {
    return 'Expires today'
  } else if (days === 1) {
    return '1 day remaining'
  } else if (days <= 30) {
    return `${days} days remaining`
  } else {
    const months = Math.floor(days / 30)
    if (months === 1) {
      return '1 month remaining'
    }
    return `${months} months remaining`
  }
}
