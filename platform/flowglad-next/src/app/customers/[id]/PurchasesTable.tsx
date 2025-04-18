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
import Badge, { BadgeColor } from '@/components/ion/Badge'
import TableTitle from '@/components/ion/TableTitle'
import EndPurchaseModal from '@/components/forms/EndPurchaseModal'
import SortableColumnHeaderCell from '@/components/ion/SortableColumnHeaderCell'
import { Payment } from '@/db/schema/payments'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { CurrencyCode, PurchaseStatus } from '@/types'
import { trpc } from '@/app/_trpc/client'

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
    <>
      <EndPurchaseModal
        isOpen={isEndOpen}
        setIsOpen={setIsEndOpen}
        purchase={purchase}
      />
      <TableRowPopoverMenu items={items} />
    </>
  )
}

const PurchaseStatusCell = ({
  purchase,
}: {
  purchase: Purchase.ClientRecord
}) => {
  let badgeLabel: string = 'Pending'
  let badgeColor: BadgeColor = 'grey'

  if (purchase.endDate) {
    badgeColor = 'grey'
    badgeLabel = 'Concluded'
  } else if (purchase.purchaseDate) {
    badgeColor = 'green'
    badgeLabel = 'Paid'
  } else {
    badgeColor = 'grey'
    badgeLabel = 'Pending'
  }

  return <Badge color={badgeColor}>{badgeLabel}</Badge>
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
  const [pageIndex, setPageIndex] = useState(0)
  const pageSize = 10

  const { data, isLoading, isFetching } =
    trpc.purchases.getTableRows.useQuery({
      cursor: pageIndex.toString(),
      limit: pageSize,
      filters,
    })

  const paymentsByPurchaseId = useMemo(
    () => new Map<string, Payment.ClientRecord[]>(),
    []
  )

  const columns = useMemo(
    () =>
      [
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell title="Name" column={column} />
          ),
          accessorKey: 'name',
          cell: ({ row: { original: cellData } }) => {
            return (
              <span className="text-sm font-medium w-[25ch] truncate">
                {cellData.purchase.name}
              </span>
            )
          },
        },
        {
          header: 'Status',
          accessorKey: 'status',
          cell: ({ row: { original: cellData } }) => {
            return <PurchaseStatusCell purchase={cellData.purchase} />
          },
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Revenue"
              column={column}
            />
          ),
          accessorKey: 'amount',
          cell: ({ row: { original: cellData } }) => (
            <>
              <span className="text-sm">
                {stripeCurrencyAmountToHumanReadableCurrencyAmount(
                  CurrencyCode.USD,
                  paymentsByPurchaseId
                    .get(cellData.purchase.id)
                    ?.reduce(
                      (acc, payment) => acc + payment.amount,
                      0
                    ) ?? 0
                )}
              </span>
            </>
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Purchase Date"
              column={column}
            />
          ),
          accessorKey: 'startDate',
          cell: ({ row: { original: cellData } }) => (
            <>
              {cellData.purchase.purchaseDate
                ? core.formatDate(cellData.purchase.purchaseDate)
                : '-'}
            </>
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Created"
              column={column}
            />
          ),
          accessorKey: 'createdAt',
          cell: ({ row: { original: cellData } }) => (
            <>{core.formatDate(cellData.purchase.createdAt)}</>
          ),
        },
        {
          id: '_',
          cell: ({ row: { original: cellData } }) => (
            <div className="w-full flex justify-end">
              <div
                className="w-fit"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreMenuCell purchase={cellData.purchase} />
              </div>
            </div>
          ),
        },
      ] as ColumnDef<Purchase.PurchaseTableRowData>[],
    [paymentsByPurchaseId]
  )

  const handlePaginationChange = (newPageIndex: number) => {
    setPageIndex(newPageIndex)
  }

  const tableData = data?.data || []
  const total = data?.total || 0
  const pageCount = Math.ceil(total / pageSize)

  return (
    <div className="w-full flex flex-col gap-5">
      <Table
        columns={columns}
        data={tableData}
        className="bg-nav w-full"
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
