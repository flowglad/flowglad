'use client'

import { PaymentsDataTable, PaymentsTableFilters } from './data-table'

// Backward compatibility wrapper - maintains same interface for existing imports
const PaymentsTable = ({
  filters = {},
  filterOptions,
  activeFilter,
  onFilterChange,
}: {
  filters?: PaymentsTableFilters
  filterOptions?: { value: string; label: string }[]
  activeFilter?: string
  onFilterChange?: (value: string) => void
}) => {
  return (
    <PaymentsDataTable
      filters={filters}
      filterOptions={filterOptions}
      activeFilter={activeFilter}
      onFilterChange={onFilterChange}
    />
  )
}

// Re-export interface for backward compatibility
export type { PaymentsTableFilters }

export default PaymentsTable
