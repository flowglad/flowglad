'use client'

import { PaymentsDataTable, PaymentsTableFilters } from './data-table'

// Backward compatibility wrapper - maintains same interface for existing imports
const PaymentsTable = ({
  filters = {},
}: {
  filters?: PaymentsTableFilters
}) => {
  return <PaymentsDataTable filters={filters} />
}

// Re-export interface for backward compatibility
export type { PaymentsTableFilters }

export default PaymentsTable
