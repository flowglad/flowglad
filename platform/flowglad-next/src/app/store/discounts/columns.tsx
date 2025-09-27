'use client'

import * as React from 'react'
import { ColumnDef } from '@tanstack/react-table'
// Icons come next
import { Pencil, Trash2 } from 'lucide-react'
// UI components last
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import {
  EnhancedDataTableActionsMenu,
  ActionMenuItem,
} from '@/components/ui/enhanced-data-table-actions-menu'
import { Badge } from '@/components/ui/badge'
// Other imports
import { Discount } from '@/db/schema/discounts'
import {
  CurrencyCode,
  DiscountAmountType,
  DiscountDuration,
} from '@/types'
import StatusBadge from '@/components/StatusBadge'
import EditDiscountModal from '@/components/forms/EditDiscountModal'
import DeleteDiscountModal from '@/components/forms/DeleteDiscountModal'
import { sentenceCase } from 'change-case'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'

export type DiscountTableRowData = Discount.TableRowData

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
  return <div className="text-sm">{durationText}</div>
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
  return <div className="text-sm font-normal">{amountText}</div>
}

function DiscountActionsMenu({
  discount,
}: {
  discount: Discount.ClientRecord
}) {
  const [isEditOpen, setIsEditOpen] = React.useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false)

  const actionItems: ActionMenuItem[] = [
    {
      label: 'Edit Discount',
      icon: <Pencil className="h-4 w-4" />,
      handler: () => setIsEditOpen(true),
    },
    {
      label: 'Delete Discount',
      icon: <Trash2 className="h-4 w-4" />,
      handler: () => setIsDeleteOpen(true),
      destructive: true,
    },
  ]

  return (
    <EnhancedDataTableActionsMenu items={actionItems}>
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
    </EnhancedDataTableActionsMenu>
  )
}

export const columns: ColumnDef<DiscountTableRowData>[] = [
  {
    id: 'name',
    accessorFn: (row) => row.discount.name,
    header: 'Name',
    cell: ({ row }) => (
      <div className="font-medium truncate">
        {row.getValue('name')}
      </div>
    ),
    size: 150,
    minSize: 120,
    maxSize: 200,
  },
  {
    id: 'code',
    accessorFn: (row) => row.discount.code,
    header: 'Code',
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()}>
        <DataTableCopyableCell copyText={row.getValue('code')}>
          {row.getValue('code')}
        </DataTableCopyableCell>
      </div>
    ),
    size: 150,
    minSize: 120,
    maxSize: 200,
  },
  {
    id: 'amount',
    accessorFn: (row) => row.discount.amount,
    header: 'Amount',
    cell: ({ row }) => (
      <DiscountTableAmountCell amount={row.original.discount} />
    ),
    size: 100,
    minSize: 80,
    maxSize: 120,
  },
  {
    id: 'duration',
    accessorFn: (row) => row.discount.duration,
    header: 'Duration',
    cell: ({ row }) => (
      <DiscountTableDurationCell duration={row.original.discount} />
    ),
    size: 120,
    minSize: 100,
    maxSize: 150,
  },
  {
    id: 'redemptions',
    accessorFn: (row) => row.discountRedemptionsCount,
    header: 'Redemptions',
    cell: ({ row }) => <div>{row.getValue('redemptions') || 0}</div>,
    size: 100,
    minSize: 80,
    maxSize: 100,
  },
  {
    id: 'active',
    accessorFn: (row) => row.discount.active,
    header: 'Status',
    cell: ({ row }) => (
      <StatusBadge active={row.getValue('active')} />
    ),
    size: 110,
    minSize: 105,
    maxSize: 115,
  },
  {
    id: 'actions',
    enableHiding: false,
    cell: ({ row }) => {
      const discount = row.original.discount
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <DiscountActionsMenu discount={discount} />
        </div>
      )
    },
    size: 40,
    maxSize: 40,
  },
]
