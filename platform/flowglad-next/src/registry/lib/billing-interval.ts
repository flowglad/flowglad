export function formatBillingInterval(
  interval?: 'month' | 'year' | 'week' | 'day',
  intervalCount?: number
): string {
  if (!interval) return ''

  const count = intervalCount || 1
  if (count === 1) {
    return `per ${interval}`
  }
  return `every ${count} ${interval}s`
}

export function getDaysUntilDate(date: Date | string): number {
  const targetDate = typeof date === 'string' ? new Date(date) : date

  // Check for invalid date
  if (isNaN(targetDate.getTime())) {
    return 0
  }

  const now = new Date()
  const diffTime = targetDate.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays
}

export function formatDaysRemaining(date: Date | string): string {
  const targetDate = typeof date === 'string' ? new Date(date) : date

  // Check for invalid date
  if (isNaN(targetDate.getTime())) {
    return 'Invalid date'
  }

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
