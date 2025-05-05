'use client'
import { useMemo, useState } from 'react'
import { ColumnDef } from '@tanstack/react-table'
import Table from '@/components/ion/Table'
import SortableColumnHeaderCell from '@/components/ion/SortableColumnHeaderCell'
import { Discount } from '@/db/schema/discounts'
import core from '@/utils/core'
import {
  CurrencyCode,
  DiscountAmountType,
  DiscountDuration,
} from '@/types'
import TableRowPopoverMenu from '@/components/TableRowPopoverMenu'
import { PopoverMenuItem } from '@/components/PopoverMenu'
import EditDiscountModal from '@/components/forms/EditDiscountModal'
import DeleteDiscountModal from '@/components/forms/DeleteDiscountModal'
import StatusBadge from '@/components/StatusBadge'
import { RotateCw, Infinity } from 'lucide-react'
import { sentenceCase } from 'change-case'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { trpc } from '@/app/_trpc/client'
import MoreMenuTableCell from '@/components/MoreMenuTableCell'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'

const MoreMenuCell = ({
  discount,
}: {
  discount: Discount.ClientRecord
}) => {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const items: PopoverMenuItem[] = [
    {
      label: 'Edit Discount',
      handler: () => setIsEditOpen(true),
    },
    {
      label: 'Delete Discount',
      handler: () => setIsDeleteOpen(true),
    },
  ]
  return (
    <MoreMenuTableCell items={items}>
      <EditDiscountModal
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        discount={discount}
      />
      <DeleteDiscountModal
        id={discount.id}
        isOpen={isDeleteOpen}
        setIsOpen={setIsDeleteOpen}
      />
    </MoreMenuTableCell>
  )
}

const DiscountTableDurationCell = ({
  duration,
}: {
  duration: Discount.ClientRecord
}) => {
  let durationText = ''
  let icon = null
  if (duration.duration === DiscountDuration.NumberOfPayments) {
    durationText = `${duration.numberOfPayments} Payments`
    icon = <RotateCw size={16} />
  } else if (duration.duration === DiscountDuration.Forever) {
    durationText = 'Forever'
    icon = <Infinity size={16} />
  } else {
    durationText = sentenceCase(duration.duration)
  }
  return (
    <div className="flex flex-row items-center gap-2">
      {icon}
      <span className="text-sm">{durationText}</span>
    </div>
  )
}

const DiscountTableAmountCell = ({
  amount,
}: {
  amount: Discount.ClientRecord
}) => {
  let amountText = ''
  if (amount.amountType === DiscountAmountType.Fixed) {
    amountText = stripeCurrencyAmountToHumanReadableCurrencyAmount(
      CurrencyCode.USD,
      amount.amount
    )
  } else if (amount.amountType === DiscountAmountType.Percent) {
    amountText = `${amount.amount}%`
  }
  return <span className="text-sm">{amountText}</span>
}

export interface DiscountsTableFilters {
  active?: boolean
  organizationId?: string
}

const DiscountsTable = ({
  filters = {},
}: {
  filters?: DiscountsTableFilters
}) => {
  const {
    pageIndex,
    pageSize,
    handlePaginationChange,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<
    Discount.TableRowData,
    DiscountsTableFilters
  >({
    initialCurrentCursor: undefined,
    pageSize: 10,
    filters,
    useQuery: trpc.discounts.getTableRows.useQuery,
  })

  const columns = useMemo(
    () =>
      [
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell title="Name" column={column} />
          ),
          accessorKey: 'discount.name',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.discount.name}</span>
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell title="Code" column={column} />
          ),
          accessorKey: 'discount.code',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.discount.code}</span>
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Amount"
              column={column}
            />
          ),
          accessorKey: 'discount.amount',
          cell: ({ row: { original: cellData } }) => (
            <DiscountTableAmountCell amount={cellData.discount} />
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Duration"
              column={column}
            />
          ),
          accessorKey: 'discount.duration',
          cell: ({ row: { original: cellData } }) => (
            <DiscountTableDurationCell duration={cellData.discount} />
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Redemptions"
              column={column}
            />
          ),
          accessorKey: 'discountRedemptionsCount',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">
              {cellData.discountRedemptionsCount}
            </span>
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Status"
              column={column}
            />
          ),
          accessorKey: 'discount.active',
          cell: ({ row: { original: cellData } }) => (
            <StatusBadge active={cellData.discount.active} />
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Created"
              column={column}
            />
          ),
          accessorKey: 'discount.createdAt',
          cell: ({ row: { original: cellData } }) => (
            <>{core.formatDate(cellData.discount.createdAt!)}</>
          ),
        },
        {
          id: '_',
          cell: ({ row: { original: cellData } }) => (
            <MoreMenuCell discount={cellData.discount} />
          ),
        },
      ] as ColumnDef<Discount.TableRowData>[],
    []
  )

  const tableData = data?.items || []
  const total = data?.total || 0

  return (
    <Table
      columns={columns}
      data={tableData}
      className="bg-nav"
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
  )
}

export default DiscountsTable
