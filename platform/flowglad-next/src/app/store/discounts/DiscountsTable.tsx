'use client'
import { useMemo, useState } from 'react'
import { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { Discount } from '@/db/schema/discounts'
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
import { Pencil, Trash2 } from 'lucide-react'
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
  if (duration.duration === DiscountDuration.NumberOfPayments) {
    durationText = `${duration.numberOfPayments} Payments`
  } else if (duration.duration === DiscountDuration.Forever) {
    durationText = 'Forever'
  } else {
    durationText = sentenceCase(duration.duration)
  }
  return <span className="text-sm">{durationText}</span>
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
          minSize: 120,
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm truncate">
              {cellData.discount.name}
            </span>
          ),
        },
        {
          header: 'Code',
          accessorKey: 'discount.code',
          minSize: 120,
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm truncate">
              {cellData.discount.code}
            </span>
          ),
        },
        {
          header: 'Amount',
          accessorKey: 'discount.amount',
          size: 100,
          cell: ({ row: { original: cellData } }) => (
            <DiscountTableAmountCell amount={cellData.discount} />
          ),
        },
        {
          header: 'Duration',
          accessorKey: 'discount.duration',
          size: 120,
          maxSize: 120,
          cell: ({ row: { original: cellData } }) => (
            <DiscountTableDurationCell duration={cellData.discount} />
          ),
        },
        {
          header: 'Redemptions',
          accessorKey: 'discountRedemptionsCount',
          size: 120,
          maxSize: 120,
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">
              {cellData.discountRedemptionsCount}
            </span>
          ),
        },
        {
          header: 'Status',
          accessorKey: 'discount.active',
          size: 120,
          maxSize: 120,
          cell: ({ row: { original: cellData } }) => (
            <StatusBadge active={cellData.discount.active} />
          ),
        },
        {
          id: '_',
          size: 40,
          maxSize: 40,
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
