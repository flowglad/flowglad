'use client'

import * as React from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/utils/core'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/registry/base/skeleton/skeleton'
import { CustomerCard } from './components/customer-card'
import type { CustomerSelectorProps } from './types'

export function CustomerSelector({
  customers,
  onSelect,
  selectedCustomerId,
  loading = false,
  searchable = true,
  className,
  emptyStateMessage = 'No customers found',
  gridCols = 3,
}: CustomerSelectorProps) {
  const [searchQuery, setSearchQuery] = React.useState('')

  const filteredCustomers = React.useMemo(() => {
    if (!searchQuery) return customers

    const query = searchQuery.toLowerCase()
    return customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(query) ||
        customer.email.toLowerCase().includes(query) ||
        customer.organizationName?.toLowerCase().includes(query)
    )
  }, [customers, searchQuery])

  const gridClassName = cn('grid gap-4', {
    'grid-cols-1': gridCols === 1,
    'grid-cols-1 sm:grid-cols-2': gridCols === 2,
    'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3': gridCols === 3,
    'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4':
      gridCols === 4,
  })

  if (loading) {
    return (
      <div className={cn('space-y-6', className)}>
        {searchable && <Skeleton className="h-10 w-full max-w-sm" />}
        <div className={gridClassName}>
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (customers.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center justify-center py-12',
          className
        )}
      >
        <p className="text-muted-foreground">{emptyStateMessage}</p>
      </div>
    )
  }

  return (
    <div className={cn('space-y-6', className)}>
      {searchable && customers.length > 1 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search customers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {filteredCustomers.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">
            No customers match your search
          </p>
        </div>
      ) : (
        <div className={gridClassName}>
          {filteredCustomers.map((customer) => (
            <CustomerCard
              key={customer.id}
              customer={customer}
              isSelected={customer.id === selectedCustomerId}
              onClick={() => onSelect(customer.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
