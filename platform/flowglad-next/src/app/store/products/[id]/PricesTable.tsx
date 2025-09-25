'use client'

import {
  PricesDataTable,
  PricesTableFilters,
} from './prices/data-table'
import { PriceType } from '@/types'

// Backward compatibility wrapper - maintains same interface for existing imports
const PaginatedPricesTable = ({
  filters = {},
  productId,
}: {
  productId: string
  filters?: PricesTableFilters
}) => {
  return <PricesDataTable productId={productId} filters={filters} />
}

// Re-export interface and new component for direct use
export type { PricesTableFilters }
export { PricesDataTable }
export default PaginatedPricesTable
