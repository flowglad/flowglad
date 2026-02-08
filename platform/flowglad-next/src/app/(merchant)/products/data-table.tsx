'use client'

import {
  type ColumnFiltersState,
  type ColumnSizingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { trpc } from '@/app/_trpc/client'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'
import { useSearchDebounce } from '@/app/hooks/useSearchDebounce'
import {
  DataTableFilterPopover,
  type FilterSection,
} from '@/components/ui/data-table-filter-popover'
import { DataTablePagination } from '@/components/ui/data-table-pagination'
import { DataTableToolbar } from '@/components/ui/data-table-toolbar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { columns, type ProductRow } from './columns'

export enum FocusedTab {
  All = 'all',
  Active = 'active',
  Archived = 'archived',
}

export interface ProductsTableFilters {
  active?: boolean
  organizationId?: string
  pricingModelId?: string
  excludeProductsWithNoPrices?: boolean
}

/**
 * Filter state for the products filter popover.
 */
interface ProductFilterValues {
  [key: string]: string
  status: string
}

/**
 * Default filter values - what the filter starts with.
 * Defaults to "Active" to match the previous Tabs implementation.
 */
const defaultFilterValues: ProductFilterValues = {
  status: 'active',
}

/**
 * Neutral filter values - represents "no filter applied" state.
 */
const neutralFilterValues: ProductFilterValues = {
  status: 'all',
}

const statusFilterOptions = [
  { value: 'all', label: 'All Products' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
]

interface ProductsDataTableProps {
  /** Optional external filters (e.g., organizationId, pricingModelId) */
  externalFilters?: Pick<
    ProductsTableFilters,
    | 'organizationId'
    | 'pricingModelId'
    | 'excludeProductsWithNoPrices'
  >
  onCreateProduct?: () => void
  buttonVariant?:
    | 'default'
    | 'outline'
    | 'ghost'
    | 'link'
    | 'secondary'
    | 'destructive'
  hiddenColumns?: string[]
}

export function ProductsDataTable({
  externalFilters = {},
  onCreateProduct,
  buttonVariant = 'secondary',
  hiddenColumns = [],
}: ProductsDataTableProps) {
  const router = useRouter()

  // Server-side search with debounce
  const { inputValue, setInputValue, searchQuery } =
    useSearchDebounce(300)

  // Page size state for server-side pagination
  const [currentPageSize, setCurrentPageSize] = React.useState(10)

  // Filter state for status (active/archived)
  const [filterValues, setFilterValues] =
    React.useState<ProductFilterValues>(defaultFilterValues)

  // Build filter sections for the popover
  const filterSections: FilterSection[] = React.useMemo(
    () => [
      {
        id: 'status',
        label: 'Status',
        type: 'single-select' as const,
        options: statusFilterOptions,
      },
    ],
    []
  )

  // Derive server filters from UI filter state
  // Logic inversion: status === 'archived' → active: false, status === 'active' → active: true
  const derivedFilters = React.useMemo((): ProductsTableFilters => {
    const filters: ProductsTableFilters = {
      ...externalFilters,
    }

    // Apply status filter
    if (filterValues.status === 'active') {
      filters.active = true
    } else if (filterValues.status === 'archived') {
      filters.active = false
    }
    // 'all' means no active filter

    return filters
  }, [filterValues, externalFilters])

  const {
    pageIndex,
    pageSize,
    handlePaginationChange,
    goToFirstPage,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<ProductRow, ProductsTableFilters>({
    initialCurrentCursor: undefined,
    pageSize: currentPageSize,
    filters: derivedFilters,
    searchQuery: searchQuery,
    useQuery: trpc.products.getTableRows.useQuery,
  })

  // Reset to first page when filters change
  // Use JSON.stringify to get stable comparison of filter object
  const filtersKey = JSON.stringify(derivedFilters)
  React.useEffect(() => {
    goToFirstPage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey])

  // Reset to first page when debounced search changes
  React.useEffect(() => {
    goToFirstPage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  // Client-side features (Shadcn patterns)
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] =
    React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(() =>
      Object.fromEntries(hiddenColumns.map((col) => [col, false]))
    )
  const [columnSizing, setColumnSizing] =
    React.useState<ColumnSizingState>({})

  const table = useReactTable({
    data: data?.items || [],
    columns,
    enableColumnResizing: true,
    columnResizeMode: 'onEnd',
    defaultColumn: {
      size: 150,
      minSize: 50,
      maxSize: 500,
    },
    manualPagination: true, // Server-side pagination
    manualSorting: false, // Client-side sorting on current page
    manualFiltering: false, // Client-side filtering on current page
    pageCount: Math.ceil((data?.total || 0) / currentPageSize),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnSizingChange: setColumnSizing,
    onPaginationChange: (updater) => {
      const newPagination =
        typeof updater === 'function'
          ? updater({ pageIndex, pageSize: currentPageSize })
          : updater

      if (newPagination.pageSize !== currentPageSize) {
        setCurrentPageSize(newPagination.pageSize)
        goToFirstPage()
      } else if (newPagination.pageIndex !== pageIndex) {
        handlePaginationChange(newPagination.pageIndex)
      }
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      columnSizing,
      pagination: { pageIndex, pageSize: currentPageSize },
    },
  })

  // Calculate if any filter deviates from neutral (for pagination display)
  const hasActiveFilters =
    filterValues.status !== neutralFilterValues.status

  return (
    <div className="w-full">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 pt-1 pb-2 px-6">
        <DataTableToolbar
          search={{
            value: inputValue,
            onChange: setInputValue,
            placeholder: 'Search products...',
          }}
          actionButton={
            onCreateProduct
              ? {
                  onClick: onCreateProduct,
                  text: 'Create Product',
                  variant: buttonVariant,
                }
              : undefined
          }
          isLoading={isLoading}
          isFetching={isFetching}
        >
          <DataTableFilterPopover
            sections={filterSections}
            values={filterValues}
            onChange={setFilterValues}
            defaultValues={defaultFilterValues}
            neutralValues={neutralFilterValues}
            disabled={isLoading}
            triggerLabel={
              statusFilterOptions.find(
                (opt) => opt.value === filterValues.status
              )?.label ?? 'All Products'
            }
            triggerVariant="secondary"
            triggerIcon="chevron"
            excludeFromBadgeCount={['status']}
          />
        </DataTableToolbar>
      </div>

      {/* Table */}
      <Table className="w-full" style={{ tableLayout: 'fixed' }}>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow
              key={headerGroup.id}
              className="hover:bg-transparent"
            >
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead
                    key={header.id}
                    style={{ width: header.getSize() }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-muted-foreground"
              >
                Loading...
              </TableCell>
            </TableRow>
          ) : table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => {
              const isArchived = !row.original.product.active
              return (
                <TableRow
                  key={row.id}
                  className={`cursor-pointer ${isFetching ? 'opacity-50' : ''} ${isArchived ? 'text-muted-foreground' : ''}`}
                  onClick={(e) => {
                    const target = e.target as HTMLElement
                    if (
                      target.closest('button') ||
                      target.closest('[role="checkbox"]') ||
                      target.closest('input[type="checkbox"]') ||
                      target.closest('[data-radix-collection-item]')
                    ) {
                      return
                    }
                    router.push(
                      `/products/${row.original.product.id}`
                    )
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      style={{ width: cell.column.getSize() }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              )
            })
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-muted-foreground"
              >
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Enhanced pagination with proper spacing */}
      <div className="py-2 px-6">
        <DataTablePagination
          table={table}
          totalCount={data?.total}
          isFiltered={hasActiveFilters || !!searchQuery}
          filteredCount={data?.total}
          entityName="product"
        />
      </div>
    </div>
  )
}
