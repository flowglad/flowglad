'use client'
import { useMemo, useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import Table from '@/components/ion/Table'
import { Purchase } from '@/db/schema/purchases'
import core from '@/utils/core'
import TableRowPopoverMenu from '@/components/TableRowPopoverMenu'
import {
  PopoverMenuItemState,
  type PopoverMenuItem,
} from '@/components/PopoverMenu'
import { Badge } from '@/components/ui/badge'
import TableTitle from '@/components/ion/TableTitle'
import EndPurchaseModal from '@/components/forms/EndPurchaseModal'
import ColumnHeaderCell from '@/components/ion/ColumnHeaderCell'
import { Payment } from '@/db/schema/payments'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { CurrencyCode, PurchaseStatus } from '@/types'
import { trpc } from '@/app/_trpc/client'
import MoreMenuTableCell from '@/components/MoreMenuTableCell'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'

const MoreMenuCell = ({
  purchase,
}: {
  purchase: Purchase.ClientRecord
}) => {
  const [isEndOpen, setIsEndOpen] = useState(false)
  const items: PopoverMenuItem[] = []

  if (!purchase.endDate) {
    if (purchase.purchaseDate) {
      items.push({
        label: 'End Purchase',
        handler: () => setIsEndOpen(true),
        state: PopoverMenuItemState.Danger,
        disabled: !purchase.purchaseDate,
        helperText: purchase.purchaseDate
          ? undefined
          : 'Cannot end a purchase that has not started',
      })
    }
  }

  return (
    <MoreMenuTableCell items={items}>
      <EndPurchaseModal
        isOpen={isEndOpen}
        setIsOpen={setIsEndOpen}
        purchase={purchase}
      />
    </MoreMenuTableCell>
  )
}

const PurchaseStatusCell = ({
  purchase,
}: {
  purchase: Purchase.ClientRecord
}) => {
  let badgeLabel: string = 'Pending'
  let badgeClassName: string = 'bg-gray-100 text-gray-800'

  if (purchase.endDate) {
    badgeClassName = 'bg-gray-100 text-gray-800'
    badgeLabel = 'Concluded'
  } else if (purchase.purchaseDate) {
    badgeClassName = 'bg-green-100 text-green-800'
    badgeLabel = 'Paid'
  } else {
    badgeClassName = 'bg-gray-100 text-gray-800'
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
          header: ({ column }) => (
            <ColumnHeaderCell title="Name" column={column} />
          ),
          accessorKey: 'name',
          cell: ({ row: { original: cellData } }) => {
            return (
              <span className="text-sm font-medium w-[25ch] truncate">
                {cellData.purchase.name}
              </span>
            )
          },
          width: '18%',
        },
        {
          header: 'Status',
          accessorKey: 'status',
          cell: ({ row: { original: cellData } }) => {
            return <PurchaseStatusCell purchase={cellData.purchase} />
          },
          width: '10%',
        },
        {
          header: ({ column }) => (
            <ColumnHeaderCell title="Revenue" column={column} />
          ),
          accessorKey: 'revenue',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">
              {stripeCurrencyAmountToHumanReadableCurrencyAmount(
                CurrencyCode.USD,
                cellData.revenue ?? 0
              )}
            </span>
          ),
          width: '12%',
        },
        {
          header: ({ column }) => (
            <ColumnHeaderCell title="Customer" column={column} />
          ),
          accessorKey: 'customer',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">
              {cellData.customer.name.length == 0
                ? cellData.customer.email
                : cellData.customer.name}
            </span>
          ),
          width: '28%',
        },
        {
          header: ({ column }) => (
            <ColumnHeaderCell title="Purchase Date" column={column} />
          ),
          accessorKey: 'startDate',
          cell: ({ row: { original: cellData } }) => (
            <>
              {cellData.purchase.purchaseDate
                ? core.formatDate(cellData.purchase.purchaseDate)
                : '-'}
            </>
          ),
          width: '14%',
        },
        {
          header: ({ column }) => (
            <ColumnHeaderCell title="ID" column={column} />
          ),
          accessorKey: 'purchase.id',
          cell: ({ row: { original: cellData } }) => (
            <CopyableTextTableCell copyText={cellData.purchase.id}>
              {cellData.purchase.id}
            </CopyableTextTableCell>
          ),
          width: '10%',
        },
        {
          id: '_',
          cell: ({ row: { original: cellData } }) => (
            <MoreMenuCell purchase={cellData.purchase} />
          ),
        },
      ] as ColumnDef<Purchase.PurchaseTableRowData>[],
    []
  )

  const tableData = data?.items || []
  const total = data?.total || 0

  return (
    <div className="w-full flex flex-col gap-5">
      <Table
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
