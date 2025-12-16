'use client'

import {
  type ColumnSizingState,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { trpc } from '@/app/_trpc/client'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'
import { useSearchDebounce } from '@/app/hooks/useSearchDebounce'
import { Button } from '@/components/ui/button'
import { CollapsibleSearch } from '@/components/ui/collapsible-search'
import {
  DataTableFilterPopover,
  type FilterSection,
} from '@/components/ui/data-table-filter-popover'
import { DataTablePagination } from '@/components/ui/data-table-pagination'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Subscription } from '@/db/schema/subscriptions'
import { SubscriptionStatus } from '@/types'
import { columns } from './columns'

export interface SubscriptionsTableFilters {
  status?: SubscriptionStatus
  customerId?: string
  organizationId?: string
  productName?: string
  isFreePlan?: boolean
}

interface SubscriptionFilterState {
  planType: 'all' | 'paid' | 'free'
  status: SubscriptionStatus | 'all'
  productName: string // Empty string means "All products"
  [key: string]: string // Index signature for Record<string, unknown> compatibility
}

const defaultFilterState: SubscriptionFilterState = {
  planType: 'paid', // DEFAULT: Paid only
  status: 'all',
  productName: '', // Empty string = "All products" (matches option value)
}

// Neutral state = no filters applied (all options showing everything)
// Used for badge calculation - shows count of active filters vs "show all"
const neutralFilterState: SubscriptionFilterState = {
  planType: 'all',
  status: 'all',
  productName: '',
}

interface SubscriptionsDataTableProps {
  /** Optional external filters (e.g., from a customer detail page) */
  externalFilters?: Pick<
    SubscriptionsTableFilters,
    'customerId' | 'organizationId'
  >
  title?: string
  onCreateSubscription?: () => void
}

export function SubscriptionsDataTable({
  externalFilters = {},
  title,
  onCreateSubscription,
}: SubscriptionsDataTableProps) {
  const router = useRouter()

  // Page size state for server-side pagination
  const [currentPageSize, setCurrentPageSize] = React.useState(10)
  const { inputValue, setInputValue, searchQuery } =
    useSearchDebounce(300)

  // Filter state with "Paid only" as default
  const [filterState, setFilterState] =
    React.useState<SubscriptionFilterState>(defaultFilterState)

  // Derive server filters from UI state
  const derivedFilters =
    React.useMemo((): SubscriptionsTableFilters => {
      const filters: SubscriptionsTableFilters = {
        ...externalFilters,
      }

      if (filterState.planType === 'paid') {
        filters.isFreePlan = false
      } else if (filterState.planType === 'free') {
        filters.isFreePlan = true
      }

      if (filterState.status !== 'all') {
        filters.status = filterState.status
      }

      // Only set productName filter if a specific product is selected
      if (filterState.productName) {
        filters.productName = filterState.productName
      }

      return filters
    }, [filterState, externalFilters])

  const {
    pageIndex,
    pageSize,
    handlePaginationChange,
    goToFirstPage,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<
    Subscription.TableRowData,
    SubscriptionsTableFilters
  >({
    initialCurrentCursor: undefined,
    pageSize: currentPageSize,
    filters: derivedFilters,
    searchQuery,
    useQuery: trpc.subscriptions.getTableRows.useQuery,
  })

  // Global product options (independent of current page/search)
  const { data: allProductOptions } =
    trpc.subscriptions.listDistinctSubscriptionProductNames.useQuery(
      {},
      { staleTime: 5 * 60 * 1000 }
    )

  // Reset to first page when filters change
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

  // Client-side sorting/filtering removed; handled server-side
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})
  const [columnSizing, setColumnSizing] =
    React.useState<ColumnSizingState>({})

  const table = useReactTable({
    data: data?.items || [],
    columns,
    enableColumnResizing: true,
    columnResizeMode: 'onEnd',
    defaultColumn: {
      size: 150,
      minSize: 20,
      maxSize: 500,
    },
    enableSorting: false,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    pageCount: Math.ceil((data?.total || 0) / currentPageSize),
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: (updater) => {
      const newPagination =
        typeof updater === 'function'
          ? updater({ pageIndex, pageSize: currentPageSize })
          : updater

      // Handle page size changes
      if (newPagination.pageSize !== currentPageSize) {
        setCurrentPageSize(newPagination.pageSize)
        goToFirstPage()
      }
      // Handle page index changes (page navigation)
      else if (newPagination.pageIndex !== pageIndex) {
        handlePaginationChange(newPagination.pageIndex)
      }
    },
    getCoreRowModel: getCoreRowModel(),
    state: {
      columnVisibility,
      columnSizing,
      pagination: { pageIndex, pageSize: currentPageSize },
    },
  })

  // Build filter sections for the popover
  const filterSections: FilterSection[] = React.useMemo(
    () => [
      {
        id: 'planType',
        type: 'single-select' as const,
        label: 'Plan Type',
        options: [
          { value: 'all', label: 'All plans' },
          { value: 'paid', label: 'Paid only' },
          { value: 'free', label: 'Free only' },
        ],
      },
      {
        id: 'status',
        type: 'single-select' as const,
        label: 'Status',
        options: [
          { value: 'all', label: 'All' },
          { value: SubscriptionStatus.Active, label: 'Active' },
          { value: SubscriptionStatus.Trialing, label: 'Trialing' },
          {
            value: SubscriptionStatus.CancellationScheduled,
            label: 'Cancellation Scheduled',
          },
          { value: SubscriptionStatus.Canceled, label: 'Canceled' },
          { value: SubscriptionStatus.Paused, label: 'Paused' },
          { value: SubscriptionStatus.PastDue, label: 'Past Due' },
          {
            value: SubscriptionStatus.Incomplete,
            label: 'Incomplete',
          },
        ],
      },
      {
        id: 'productName',
        type: 'async-select' as const,
        label: 'Product',
        loadOptions: async () => {
          // Uses existing listDistinctSubscriptionProductNames query data
          return [
            { value: '', label: 'All products' },
            ...(allProductOptions ?? []).map((p: string) => ({
              value: p,
              label: p,
            })),
          ]
        },
      },
    ],
    [allProductOptions]
  )

  // Calculate if any filter deviates from defaults (for pagination display)
  const hasActiveFilters =
    filterState.planType !== defaultFilterState.planType ||
    filterState.status !== defaultFilterState.status ||
    filterState.productName !== defaultFilterState.productName

  return (
    <div className="w-full">
      {/* Enhanced toolbar */}
      <div className="flex flex-wrap items-center justify-between pt-4 pb-3 gap-4 min-w-0">
        {/* Title on the left */}
        <div className="flex items-center gap-4 min-w-0 flex-shrink overflow-hidden">
          {title && <h3 className="text-lg truncate">{title}</h3>}
        </div>

        {/* View options and filters */}
        <div className="flex items-center gap-2 flex-wrap flex-shrink-0 justify-end">
          <CollapsibleSearch
            value={inputValue}
            onChange={setInputValue}
            placeholder="Customer or sub_id..."
            isLoading={isFetching}
          />
          <DataTableFilterPopover
            sections={filterSections}
            values={filterState}
            onChange={setFilterState}
            defaultValues={defaultFilterState}
            neutralValues={neutralFilterState}
          />
          {onCreateSubscription && (
            <Button onClick={onCreateSubscription}>
              <Plus className="w-4 h-4 mr-2" />
              Create Subscription
            </Button>
          )}
        </div>
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
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className={`cursor-pointer ${isFetching ? 'opacity-50' : ''}`}
                onClick={(e) => {
                  // Only navigate if not clicking on interactive elements
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
                    `/finance/subscriptions/${row.original.subscription.id}`
                  )
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(
                      cell.column.columnDef.cell,
                      cell.getContext()
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))
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

      {/* Pagination */}
      <div className="py-2">
        <DataTablePagination
          table={table}
          totalCount={data?.total}
          isFiltered={hasActiveFilters}
          filteredCount={data?.total}
        />
      </div>
    </div>
  )
}
