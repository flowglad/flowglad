import type { Table } from '@tanstack/react-table'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
} from 'lucide-react'
import React from 'react'

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
  onExport?: () => void | Promise<void>
  exportDisabled?: boolean
  exportLoading?: boolean
  exportLabel?: string
}

export function DataTablePagination<TData>({
  table,
  totalCount,
  isFiltered = false,
  filteredCount,
  onExport,
  exportDisabled = false,
  exportLoading = false,
  exportLabel = 'Export CSV',
}: DataTablePaginationProps<TData>) {
  // Determine the correct count to display
  // Priority: filteredCount (when filtered) > totalCount (server-side) > client-side count
  const rows = table.getFilteredRowModel().rows
  const totalRows = React.useMemo(() => {
    if (isFiltered && typeof filteredCount === 'number') {
      return filteredCount
    }
    if (typeof totalCount === 'number') {
      return totalCount
    }
    // Fallback to client-side count (only accurate for client-side pagination)
    return rows.length
  }, [isFiltered, filteredCount, totalCount, rows])

  const shouldHidePagination = totalRows <= 10
  const showExportButton =
    typeof onExport === 'function' && totalRows > 0

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-muted-foreground flex-1 text-sm font-mono">
        {totalRows} {totalRows === 1 ? 'result' : 'results'}
      </div>
      {(showExportButton || !shouldHidePagination) && (
        <div className="flex items-center">
          {showExportButton && (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => onExport()}
              disabled={exportDisabled || exportLoading}
              aria-label={
                exportLoading ? 'Exporting...' : exportLabel
              }
            >
              {exportLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {exportLoading ? 'Exporting...' : exportLabel}
            </Button>
          )}
          {!shouldHidePagination && (
            <div className="flex items-center space-x-2">
              <div className="hidden">
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
                      placeholder={
                        table.getState().pagination.pageSize
                      }
                    />
                  </SelectTrigger>
                  <SelectContent side="top">
                    {[10, 20, 25, 30, 40, 50].map((pageSize) => (
                      <SelectItem
                        key={pageSize}
                        value={`${pageSize}`}
                      >
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
      )}
    </div>
  )
}
