'use client'

import {
  type ColumnSizingState,
  flexRender,
  getCoreRowModel,
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

/**
 * Filter state for the subscriptions multi-filter popover.
 * Uses string values to match the DataTableFilterPopover interface.
 * Index signature required for Record<string, unknown> compatibility.
 */
interface SubscriptionFilterValues {
  [key: string]: string
  status: string
  planType: string
  productName: string
}

/**
 * Default filter values - what the filter starts with.
 * Defaults to "Paid Plans" to match the previous implementation.
 */
const defaultFilterValues: SubscriptionFilterValues = {
  status: 'all',
  planType: 'paid',
  productName: 'all',
}

/**
 * Neutral filter values - represents "no filter applied" state.
 * Used for badge calculation and the "Reset filters" action.
 */
const neutralFilterValues: SubscriptionFilterValues = {
  status: 'all',
  planType: 'all',
  productName: 'all',
}

const statusFilterOptions = [
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
  { value: SubscriptionStatus.Incomplete, label: 'Incomplete' },
]

const planTypeFilterOptions = [
  { value: 'all', label: 'All Plans' },
  { value: 'paid', label: 'Paid Plans' },
  { value: 'free', label: 'Free Plans' },
]

interface SubscriptionsDataTableProps {
  /** Optional external filters (e.g., from a customer detail page) */
  externalFilters?: Pick<
    SubscriptionsTableFilters,
    'customerId' | 'organizationId'
  >
  title?: string
  onCreateSubscription?: () => void
  hiddenColumns?: string[]
  /** Default plan type filter value. Defaults to 'paid'. */
  defaultPlanType?: 'all' | 'paid' | 'free'
}

export function SubscriptionsDataTable({
  externalFilters = {},
  title,
  onCreateSubscription,
  hiddenColumns = [],
  defaultPlanType = 'paid',
}: SubscriptionsDataTableProps) {
  const router = useRouter()

  // Server-side filtering with debounced search
  const { inputValue, setInputValue, searchQuery } =
    useSearchDebounce(300)

  // Page size state for server-side pagination
  const [currentPageSize, setCurrentPageSize] = React.useState(10)

  // Multi-filter state for status, plan type, and product
  const initialFilterValues = React.useMemo(
    () => ({
      ...defaultFilterValues,
      planType: defaultPlanType,
    }),
    [defaultPlanType]
  )
  const [filterValues, setFilterValues] =
    React.useState<SubscriptionFilterValues>(initialFilterValues)

  // Query for distinct product names that have subscriptions
  const productNamesQuery =
    trpc.subscriptions.listDistinctSubscriptionProductNames.useQuery(
      {},
      { staleTime: 5 * 60 * 1000 } // Cache for 5 minutes
    )

  // Build filter sections for the popover
  const filterSections: FilterSection[] = React.useMemo(
    () => [
      {
        id: 'planType',
        label: 'Plan Type',
        type: 'single-select' as const,
        options: planTypeFilterOptions,
      },
      {
        id: 'status',
        label: 'Status',
        type: 'single-select' as const,
        options: statusFilterOptions,
      },
      {
        id: 'productName',
        label: 'Product',
        type: 'async-select' as const,
        loadOptions: async () => {
          // Use cached data if available
          if (productNamesQuery.data) {
            return [
              { value: 'all', label: 'All Products' },
              ...productNamesQuery.data.map((name) => ({
                value: name,
                label: name,
              })),
            ]
          }
          // Refetch if no data available
          const result = await productNamesQuery.refetch()
          if (result.data) {
            return [
              { value: 'all', label: 'All Products' },
              ...result.data.map((name) => ({
                value: name,
                label: name,
              })),
            ]
          }
          return [{ value: 'all', label: 'All Products' }]
        },
        placeholder: 'Select product...',
      },
    ],
    [productNamesQuery]
  )

  // Derive server filters from UI filter state
  const derivedFilters =
    React.useMemo((): SubscriptionsTableFilters => {
      const filters: SubscriptionsTableFilters = {
        ...externalFilters,
      }

      // Apply status filter
      if (filterValues.status !== 'all') {
        filters.status = filterValues.status as SubscriptionStatus
      }

      // Apply plan type filter (maps to isFreePlan boolean)
      if (filterValues.planType === 'free') {
        filters.isFreePlan = true
      } else if (filterValues.planType === 'paid') {
        filters.isFreePlan = false
      }

      // Apply product name filter
      if (filterValues.productName !== 'all') {
        filters.productName = filterValues.productName
      }

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

  // Calculate if any filter deviates from neutral (for pagination display)
  const hasActiveFilters =
    filterValues.status !== neutralFilterValues.status ||
    filterValues.planType !== neutralFilterValues.planType ||
    filterValues.productName !== neutralFilterValues.productName

  return (
    <div className="w-full">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 pt-1 pb-2 px-6">
        {/* Title row */}
        {title && (
          <div>
            <h3 className="text-lg truncate">{title}</h3>
          </div>
        )}
        <DataTableToolbar
          search={{
            value: inputValue,
            onChange: setInputValue,
            placeholder: 'Search by customer or sub_id',
          }}
          actionButton={
            onCreateSubscription
              ? {
                  onClick: onCreateSubscription,
                  text: 'Create Subscription',
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
            defaultValues={initialFilterValues}
            neutralValues={neutralFilterValues}
            disabled={isLoading}
            triggerLabel={
              planTypeFilterOptions.find(
                (opt) => opt.value === filterValues.planType
              )?.label ?? 'All Plans'
            }
            triggerVariant="secondary"
            triggerIcon="chevron"
            excludeFromBadgeCount={['planType']}
          />
        </DataTableToolbar>
      </div>

      {/* Table */}
      <Table style={{ tableLayout: 'fixed' }}>
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
      <div className="py-2 px-6">
        <DataTablePagination
          table={table}
          totalCount={data?.total}
          isFiltered={hasActiveFilters || !!searchQuery}
          filteredCount={data?.total}
          entityName="subscription"
        />
      </div>
    </div>
  )
}
