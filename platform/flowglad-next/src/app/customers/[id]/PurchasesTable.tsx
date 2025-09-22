'use client'
import { useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { Purchase } from '@/db/schema/purchases'
import core from '@/utils/core'
import { Badge } from '@/components/ui/badge'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { CurrencyCode, PurchaseStatus } from '@/types'
import { trpc } from '@/app/_trpc/client'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'
import { Customer } from '@/db/schema/customers'

const PurchaseStatusCell = ({
  purchase,
}: {
  purchase: Purchase.ClientRecord
}) => {
  let badgeLabel: string = 'Pending'
  let badgeClassName: string = 'bg-muted text-muted-foreground'

  if (purchase.endDate) {
    badgeClassName = 'bg-muted text-muted-foreground'
    badgeLabel = 'Concluded'
  } else if (purchase.purchaseDate) {
    badgeClassName =
      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
    badgeLabel = 'Paid'
  } else {
    badgeClassName = 'bg-muted text-muted-foreground'
    badgeLabel = 'Pending'
  }

  return (
    <Badge variant="secondary" className={badgeClassName}>
      {badgeLabel}
    </Badge>
  )
}

export interface PurchasesTableFilters {
  customerId?: string
  status?: PurchaseStatus
  organizationId?: string
}

const PurchasesTable = ({
  filters = {},
}: {
  filters?: PurchasesTableFilters
}) => {
  const {
    pageIndex,
    pageSize,
    handlePaginationChange,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<
    Purchase.PurchaseTableRowData,
    PurchasesTableFilters
  >({
    initialCurrentCursor: undefined,
    pageSize: 10,
    filters,
    useQuery: trpc.purchases.getTableRows.useQuery,
  })

  const columns = useMemo(
    () =>
      [
        {
          header: 'Name',
          accessorKey: 'name',
          size: 300,
          minSize: 250,
          maxSize: 400,
          cell: ({ row: { original: cellData } }) => {
            return (
              <span className="text-sm font-normal truncate block">
                {cellData.purchase.name}
              </span>
            )
          },
        },
        {
          header: 'Status',
          accessorKey: 'status',
          size: 75,
          minSize: 65,
          maxSize: 75,
          cell: ({ row: { original: cellData } }) => {
            return <PurchaseStatusCell purchase={cellData.purchase} />
          },
        },
        {
          header: 'Revenue',
          accessorKey: 'revenue',
          size: 100,
          minSize: 80,
          maxSize: 100,
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">
              {stripeCurrencyAmountToHumanReadableCurrencyAmount(
                CurrencyCode.USD,
                cellData.revenue ?? 0
              )}
            </span>
          ),
        },
        {
          header: 'Customer',
          accessorKey: 'customer',
          size: 150,
          minSize: 120,
          maxSize: 150,
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">
              {cellData.customer.name.length == 0
                ? cellData.customer.email
                : cellData.customer.name}
            </span>
          ),
        },
        {
          header: 'Purchase Date',
          accessorKey: 'startDate',
          size: 125,
          minSize: 125,
          maxSize: 125,
          cell: ({ row: { original: cellData } }) => (
            <div
              className="w-[125px] max-w-[125px] min-w-[125px] overflow-hidden whitespace-nowrap text-ellipsis box-border"
              style={{
                width: '125px',
                maxWidth: '125px',
                minWidth: '125px',
              }}
            >
              {cellData.purchase.purchaseDate
                ? core.formatDate(cellData.purchase.purchaseDate)
                : '-'}
            </div>
          ),
        },
        {
          header: 'ID',
          accessorKey: 'purchase.id',
          size: 180,
          minSize: 125,
          maxSize: 250,
          cell: ({ row: { original: cellData } }) => (
            <CopyableTextTableCell copyText={cellData.purchase.id}>
              {cellData.purchase.id}
            </CopyableTextTableCell>
          ),
        },
      ] as ColumnDef<
        {
          purchase: Purchase.ClientRecord
          customer: Customer.ClientRecord
          revenue?: number
        },
        string
      >[],
    []
  )

  const tableData = data?.items || []
  const total = data?.total || 0

  return (
    <div className="w-full flex flex-col gap-5">
      <DataTable
        columns={columns}
        data={tableData}
        className="bg-background w-full"
        bordered
        pagination={{
          pageIndex,
          pageSize,
          total,
          onPageChange: handlePaginationChange,
          isLoading,
          isFetching,
        }}
      />
    </div>
  )
}

export default PurchasesTable
