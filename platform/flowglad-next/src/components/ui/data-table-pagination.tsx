import React from 'react'
import { Table } from '@tanstack/react-table'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface DataTablePaginationProps<TData> {
  table: Table<TData>
  totalCount?: number // For server-side pagination
  isFiltered?: boolean // Whether search/filter is active
  filteredCount?: number // Count of filtered results (when different from totalCount)
}

export function DataTablePagination<TData>({
  table,
  totalCount,
  isFiltered = false,
  filteredCount,
}: DataTablePaginationProps<TData>) {
  // Determine the correct count to display
  // Priority: filteredCount (when filtered) > totalCount (server-side) > client-side count
  const totalRows = React.useMemo(() => {
    if (isFiltered && typeof filteredCount === 'number') {
      return filteredCount
    }
    if (typeof totalCount === 'number') {
      return totalCount
    }
    // Fallback to client-side count (only accurate for client-side pagination)
    return table.getFilteredRowModel().rows.length
  }, [isFiltered, filteredCount, totalCount, table])

  const shouldHidePagination = totalRows <= 10

  return (
    <div className="flex items-center justify-between px-2">
      <div className="text-muted-foreground flex-1 text-sm">
        {totalRows} results
      </div>
      {!shouldHidePagination && (
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <p className="text-sm font-normal text-muted-foreground">
              Rows per page
            </p>
            <Select
              value={`${table.getState().pagination.pageSize}`}
              onValueChange={(value) => {
                table.setPageSize(Number(value))
              }}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue
                  placeholder={table.getState().pagination.pageSize}
                />
              </SelectTrigger>
              <SelectContent side="top">
                {[10, 20, 25, 30, 40, 50].map((pageSize) => (
                  <SelectItem key={pageSize} value={`${pageSize}`}>
                    {pageSize}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">Go to previous page</span>
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">Go to next page</span>
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
