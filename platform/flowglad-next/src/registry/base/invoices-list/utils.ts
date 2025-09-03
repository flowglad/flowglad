export { formatDate } from '@/registry/lib/date'

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

const toTimestamp = (value: unknown): number | null => {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string' || typeof value === 'number') {
    const ms = new Date(value as any).getTime()
    return Number.isNaN(ms) ? null : ms
  }
  return null
}

export function sortInvoices<T extends Record<string, any>>(params: {
  invoices: T[]
  sortColumn: keyof T
  sortDirection: 'asc' | 'desc'
}): T[] {
  const { invoices, sortColumn, sortDirection } = params

  return [...invoices].sort((a, b) => {
    const aValue = a[sortColumn]
    const bValue = b[sortColumn]

    if (aValue === null || aValue === undefined) return 1
    if (bValue === null || bValue === undefined) return -1

    let comparison = 0

    switch (sortColumn) {
      case 'created': {
        const aTime = toTimestamp(aValue)
        const bTime = toTimestamp(bValue)
        if (aTime === null && bTime === null) comparison = 0
        else if (aTime === null) comparison = 1
        else if (bTime === null) comparison = -1
        else comparison = aTime - bTime
        break
      }
      case 'amountDue': {
        const aNum =
          typeof aValue === 'number' ? aValue : Number(aValue)
        const bNum =
          typeof bValue === 'number' ? bValue : Number(bValue)
        if (Number.isNaN(aNum) && Number.isNaN(bNum)) comparison = 0
        else if (Number.isNaN(aNum)) comparison = 1
        else if (Number.isNaN(bNum)) comparison = -1
        else comparison = aNum - bNum
        break
      }
      default: {
        const aStr = String(aValue)
        const bStr = String(bValue)
        comparison = aStr.localeCompare(bStr, undefined, {
          numeric: true,
          sensitivity: 'base',
        })
      }
    }

    if (comparison === 0) {
      const aId = (a as any).id
      const bId = (b as any).id
      if (aId != null && bId != null) {
        comparison = String(aId).localeCompare(
          String(bId),
          undefined,
          {
            numeric: true,
            sensitivity: 'base',
          }
        )
      }
    }

    return sortDirection === 'asc' ? comparison : -comparison
  })
}
