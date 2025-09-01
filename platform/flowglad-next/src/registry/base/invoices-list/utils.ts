export function formatDate(
  date: Date | string,
  locale: string = 'en-US',
  options?: Intl.DateTimeFormatOptions
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date

  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  }

  return new Intl.DateTimeFormat(locale, defaultOptions).format(
    dateObj
  )
}

export function formatCurrency(
  amount: number,
  currency: string,
  locale: string = 'en-US'
): string {
  // Convert from cents to dollars (or equivalent for other currencies)
  const displayAmount = amount / 100

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(displayAmount)
}

export function getInvoiceStatusColor(status: string): string {
  const statusColors: Record<string, string> = {
    paid: 'text-green-600 bg-green-50',
    open: 'text-yellow-600 bg-yellow-50',
    void: 'text-gray-600 bg-gray-50',
    uncollectible: 'text-red-600 bg-red-50',
    draft: 'text-blue-600 bg-blue-50',
  }

  return statusColors[status] || 'text-gray-600 bg-gray-50'
}

export function sortInvoices<T extends Record<string, any>>(
  invoices: T[],
  sortBy: keyof T,
  direction: 'asc' | 'desc' = 'desc'
): T[] {
  return [...invoices].sort((a, b) => {
    const aValue = a[sortBy] as any
    const bValue = b[sortBy] as any

    if (aValue === null || aValue === undefined) return 1
    if (bValue === null || bValue === undefined) return -1

    let comparison = 0

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      comparison = aValue.localeCompare(bValue)
    } else if (aValue instanceof Date && bValue instanceof Date) {
      comparison = aValue.getTime() - bValue.getTime()
    } else if (
      typeof aValue === 'object' &&
      aValue &&
      'getTime' in aValue &&
      typeof bValue === 'object' &&
      bValue &&
      'getTime' in bValue
    ) {
      // Handle date-like objects
      comparison = aValue.getTime() - bValue.getTime()
    } else {
      if (aValue < bValue) comparison = -1
      if (aValue > bValue) comparison = 1
    }

    return direction === 'asc' ? comparison : -comparison
  })
}
