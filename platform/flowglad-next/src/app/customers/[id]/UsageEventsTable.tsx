'use client'
import { useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { UsageEvent } from '@/db/schema/usageEvents'
import core from '@/utils/core'
import { TableHeader } from '@/components/ui/table-header'
import { trpc } from '@/app/_trpc/client'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'
import { Customer } from '@/db/schema/customers'
import { Subscription } from '@/db/schema/subscriptions'
import { UsageMeter } from '@/db/schema/usageMeters'
import { Price } from '@/db/schema/prices'

export interface UsageEventsTableFilters {
  customerId?: string
  usageMeterId?: string
  subscriptionId?: string
  dateFrom?: string
  dateTo?: string
}

const UsageEventsTable = ({
  filters = {},
}: {
  filters?: UsageEventsTableFilters
}) => {
  const {
    pageIndex,
    pageSize,
    handlePaginationChange,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<
    UsageEvent.UsageEventTableRowData,
    UsageEventsTableFilters
  >({
    initialCurrentCursor: undefined,
    pageSize: 10,
    filters,
    useQuery: trpc.usageEvents.getTableRows.useQuery,
  })

  const columns = useMemo(
    () =>
      [
        {
          header: 'Usage Meter',
          accessorKey: 'usageMeter.name',
          size: 200,
          minSize: 150,
          maxSize: 250,
          cell: ({ row: { original: cellData } }) => {
            return (
              <span className="text-sm font-normal truncate block">
                {cellData.usageMeter.name}
              </span>
            )
          },
        },
        {
          header: 'Amount',
          accessorKey: 'amount',
          size: 100,
          minSize: 80,
          maxSize: 120,
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm font-medium">
              {cellData.usageEvent.amount}
            </span>
          ),
        },
        {
          header: 'Usage Date',
          accessorKey: 'usageDate',
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
              {cellData.usageEvent.usageDate
                ? core.formatDate(cellData.usageEvent.usageDate)
                : '-'}
            </div>
          ),
        },
        {
          header: 'Transaction ID',
          accessorKey: 'transactionId',
          size: 150,
          minSize: 120,
          maxSize: 180,
          cell: ({ row: { original: cellData } }) => (
            <CopyableTextTableCell copyText={cellData.usageEvent.transactionId}>
              {cellData.usageEvent.transactionId}
            </CopyableTextTableCell>
          ),
        },
        {
          header: 'Subscription',
          accessorKey: 'subscription.id',
          size: 180,
          minSize: 150,
          maxSize: 200,
          cell: ({ row: { original: cellData } }) => (
            <CopyableTextTableCell copyText={cellData.subscription.id}>
              {cellData.subscription.id}
            </CopyableTextTableCell>
          ),
        },
        {
          header: 'Price',
          accessorKey: 'price.id',
          size: 180,
          minSize: 150,
          maxSize: 200,
          cell: ({ row: { original: cellData } }) => (
            <CopyableTextTableCell copyText={cellData.price.id}>
              {cellData.price.id}
            </CopyableTextTableCell>
          ),
        },
        {
          header: 'ID',
          accessorKey: 'usageEvent.id',
          size: 180,
          minSize: 125,
          maxSize: 250,
          cell: ({ row: { original: cellData } }) => (
            <CopyableTextTableCell copyText={cellData.usageEvent.id}>
              {cellData.usageEvent.id}
            </CopyableTextTableCell>
          ),
        },
      ] as ColumnDef<
        {
          usageEvent: UsageEvent.ClientRecord
          customer: Customer.ClientRecord
          subscription: Subscription.ClientRecord
          usageMeter: UsageMeter.ClientRecord
          price: Price.ClientRecord
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

export default UsageEventsTable
