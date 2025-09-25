'use client'

import * as React from 'react'
import { ColumnDef } from '@tanstack/react-table'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { sentenceCase } from 'change-case'
import { Check, Hourglass, X, RotateCcw } from 'lucide-react'
import { formatDate } from '@/utils/core'
import {
  EnhancedDataTableActionsMenu,
  ActionMenuItem,
} from '@/components/ui/enhanced-data-table-actions-menu'
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import { Payment } from '@/db/schema/payments'
import { PaymentStatus } from '@/types'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import RefundPaymentModal from './RefundPaymentModal'

const PaymentStatusBadge = ({
  status,
}: {
  status: PaymentStatus
}) => {
  let className: string = 'bg-gray-100 text-gray-800'
  let icon: React.ReactNode = null
  if (status === PaymentStatus.Succeeded) {
    className = 'bg-green-100 text-green-800'
    icon = <Check className="w-3 h-3 mr-1" />
  } else if (status === PaymentStatus.Processing) {
    className = 'bg-yellow-100 text-yellow-800'
    icon = <Hourglass className="w-3 h-3 mr-1" />
  } else if (status === PaymentStatus.Canceled) {
    className = 'bg-red-100 text-red-800'
    icon = <X className="w-3 h-3 mr-1" />
  } else if (status === PaymentStatus.Refunded) {
    className = 'bg-gray-100 text-gray-800'
    icon = <RotateCcw className="w-3 h-3 mr-1" />
  }
  return (
    <Badge variant="secondary" className={className}>
      {icon}
      {sentenceCase(status)}
    </Badge>
  )
}

function PaymentActionsMenu({
  payment,
}: {
  payment: Payment.ClientRecord
}) {
  const [isRefundOpen, setIsRefundOpen] = React.useState(false)

  const actionItems: ActionMenuItem[] = [
    {
      label: 'Refund Payment',
      icon: <RotateCcw className="h-4 w-4" />,
      handler: () => setIsRefundOpen(true),
      disabled: payment.status !== PaymentStatus.Succeeded,
      helperText:
        payment.status !== PaymentStatus.Succeeded
          ? 'Only succeeded payments can be refunded'
          : undefined,
    },
  ]

  return (
    <EnhancedDataTableActionsMenu items={actionItems}>
      <RefundPaymentModal
        isOpen={isRefundOpen}
        setIsOpen={setIsRefundOpen}
        payment={payment}
      />
    </EnhancedDataTableActionsMenu>
  )
}

export const columns: ColumnDef<Payment.TableRowData>[] = [
  {
    id: 'amount',
    accessorFn: (row) => row.payment.amount,
    header: 'Amount',
    cell: ({ row }) => {
      const payment = row.original.payment
      const formatted =
        stripeCurrencyAmountToHumanReadableCurrencyAmount(
          payment.currency,
          payment.amount
        )
      return (
        <div
          className="relative max-w-[160px] truncate font-medium"
          title={formatted}
        >
          <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
            {formatted}
          </span>
        </div>
      )
    },
  },
  {
    id: 'status',
    accessorFn: (row) => row.payment.status,
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue('status') as PaymentStatus
      return <PaymentStatusBadge status={status} />
    },
    size: 110,
  },
  {
    id: 'customerName',
    accessorFn: (row) => row.customer.name,
    header: 'Customer',
    cell: ({ row }) => {
      const customer = row.original.customer
      return (
        <Link
          href={`/customers/${customer.id}`}
          className="hover:underline"
        >
          {row.getValue('customerName')}
        </Link>
      )
    },
  },
  {
    id: 'chargeDate',
    accessorFn: (row) => row.payment.chargeDate,
    header: 'Date',
    cell: ({ row }) => {
      const date = row.getValue('chargeDate') as Date
      return <div>{formatDate(date, true)}</div>
    },
  },
  {
    id: 'id',
    accessorFn: (row) => row.payment.id,
    header: 'ID',
    cell: ({ row }) => {
      const id = row.getValue('id') as string
      return (
        <DataTableCopyableCell copyText={id}>
          {id}
        </DataTableCopyableCell>
      )
    },
  },
  {
    id: 'actions',
    enableHiding: false,
    cell: ({ row }) => {
      const payment = row.original.payment
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <PaymentActionsMenu payment={payment} />
        </div>
      )
    },
    size: 40,
  },
]
