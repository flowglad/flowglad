'use client'
import { useMemo, useState } from 'react'
import { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { Discount } from '@/db/schema/discounts'
import core from '@/utils/core'
import {
  CurrencyCode,
  DiscountAmountType,
  DiscountDuration,
} from '@/types'
import {
  PopoverMenuItem,
  PopoverMenuItemState,
} from '@/components/PopoverMenu'
import EditDiscountModal from '@/components/forms/EditDiscountModal'
import DeleteDiscountModal from '@/components/forms/DeleteDiscountModal'
import StatusBadge from '@/components/StatusBadge'
import { RotateCw, Infinity, Pencil, Trash2 } from 'lucide-react'
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
      icon: <Pencil />,
      handler: () => setIsEditOpen(true),
    },
    {
      label: 'Delete Discount',
      icon: <Trash2 />,
      state: PopoverMenuItemState.Danger,
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
          header: 'Name',
          accessorKey: 'discount.name',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.discount.name}</span>
          ),
        },
        {
          header: 'Code',
          accessorKey: 'discount.code',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.discount.code}</span>
          ),
        },
        {
          header: 'Amount',
          accessorKey: 'discount.amount',
          cell: ({ row: { original: cellData } }) => (
            <DiscountTableAmountCell amount={cellData.discount} />
          ),
        },
        {
          header: 'Duration',
          accessorKey: 'discount.duration',
          cell: ({ row: { original: cellData } }) => (
            <DiscountTableDurationCell duration={cellData.discount} />
          ),
        },
        {
          header: 'Redemptions',
          accessorKey: 'discountRedemptionsCount',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">
              {cellData.discountRedemptionsCount}
            </span>
          ),
        },
        {
          header: 'Status',
          accessorKey: 'discount.active',
          cell: ({ row: { original: cellData } }) => (
            <StatusBadge active={cellData.discount.active} />
          ),
        },
        {
          header: 'Created',
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
    <DataTable
      columns={columns}
      data={tableData}
      className="bg-background"
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
