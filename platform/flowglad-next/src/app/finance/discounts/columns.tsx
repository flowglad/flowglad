'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { sentenceCase } from 'change-case'
// Icons come next
import { Pencil } from 'lucide-react'
import * as React from 'react'
import EditDiscountModal from '@/components/forms/EditDiscountModal'
import StatusBadge from '@/components/StatusBadge'
// UI components last
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import { DataTableLinkableCell } from '@/components/ui/data-table-linkable-cell'
import {
  type ActionMenuItem,
  EnhancedDataTableActionsMenu,
} from '@/components/ui/enhanced-data-table-actions-menu'
// Other imports
import type { Discount } from '@/db/schema/discounts'
import {
  CurrencyCode,
  DiscountAmountType,
  DiscountDuration,
} from '@/types'
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

  const actionItems: ActionMenuItem[] = [
    {
      label: 'Edit',
      icon: <Pencil className="h-4 w-4" />,
      handler: () => setIsEditOpen(true),
    },
  ]

  return (
    <EnhancedDataTableActionsMenu items={actionItems}>
      <EditDiscountModal
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        discount={discount}
      />
    </EnhancedDataTableActionsMenu>
  )
}

export const columns: ColumnDef<DiscountTableRowData>[] = [
  {
    id: 'name',
    accessorFn: (row) => row.discount.name,
    header: 'Name',
    cell: ({ row }) => {
      const name = row.getValue('name') as string
      const discountId = row.original.discount.id
      return (
        <DataTableLinkableCell
          href={`/finance/discounts/${discountId}`}
        >
          <div className="truncate" title={name}>
            {name}
          </div>
        </DataTableLinkableCell>
      )
    },
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
    accessorFn: (row) => row.redemptionCount,
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
    enableResizing: false,
    cell: ({ row }) => {
      const discount = row.original.discount
      return (
        <div
          className="w-8 flex justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <DiscountActionsMenu discount={discount} />
        </div>
      )
    },
    size: 1,
    minSize: 56,
    maxSize: 56,
  },
]
