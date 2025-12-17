'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { sentenceCase } from 'change-case'
import { Check, Hourglass, Rewind, RotateCcw, X } from 'lucide-react'
import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import { DataTableLinkableCell } from '@/components/ui/data-table-linkable-cell'
import {
  type ActionMenuItem,
  EnhancedDataTableActionsMenu,
} from '@/components/ui/enhanced-data-table-actions-menu'
import type { Payment } from '@/db/schema/payments'
import { PaymentStatus } from '@/types'
import { formatDate } from '@/utils/core'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import RefundPaymentModal from './RefundPaymentModal'
import RetryPaymentModal from './RetryPaymentModal'

const PaymentStatusBadge = ({
  status,
}: {
  status: PaymentStatus
}) => {
  let className: string = 'bg-gray-100 text-gray-800'
  let icon: React.ReactNode = null
  if (status === PaymentStatus.Succeeded) {
    className = 'bg-jade-background text-jade-foreground'
    icon = <Check className="w-3 h-3 mr-1 text-jade-foreground" />
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
  const [isRetryOpen, setIsRetryOpen] = React.useState(false)
  const actionItems: ActionMenuItem[] = []
  actionItems.push({
    label: 'Refund Payment',
    icon: <Rewind className="h-4 w-4" />,
    disabled: payment.status !== PaymentStatus.Succeeded,
    helperText:
      payment.status !== PaymentStatus.Succeeded
        ? 'Only succeeded payments can be refunded'
        : undefined,
    handler: () => setIsRefundOpen(true),
  })
  if (
    payment.status === PaymentStatus.Failed &&
    !!payment.billingPeriodId
  ) {
    actionItems.push({
      label: 'Retry Payment',
      icon: <RotateCcw className="h-4 w-4" />,
      handler: () => setIsRetryOpen(true),
    })
  }
  return (
    <EnhancedDataTableActionsMenu items={actionItems}>
      <RefundPaymentModal
        isOpen={isRefundOpen}
        setIsOpen={setIsRefundOpen}
        payment={payment}
      />
      <RetryPaymentModal
        isOpen={isRetryOpen}
        setIsOpen={setIsRetryOpen}
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
        <div className="truncate" title={formatted}>
          {formatted}
        </div>
      )
    },
    size: 140,
    minSize: 140,
    maxSize: 160,
  },
  {
    id: 'status',
    accessorFn: (row) => row.payment.status,
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue('status') as PaymentStatus
      return <PaymentStatusBadge status={status} />
    },
    size: 115,
    minSize: 115,
    maxSize: 120,
  },
  {
    id: 'customerName',
    accessorFn: (row) => row.customer.name || row.customer.email,
    header: 'Customer',
    cell: ({ row }) => {
      const customer = row.original.customer
      const displayName =
        customer.name.length === 0 ? customer.email : customer.name
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <DataTableLinkableCell href={`/customers/${customer.id}`}>
            {displayName}
          </DataTableLinkableCell>
        </div>
      )
    },
    size: 160,
    minSize: 160,
    maxSize: 170,
  },
  {
    id: 'chargeDate',
    accessorFn: (row) => row.payment.chargeDate,
    header: 'Date',
    cell: ({ row }) => {
      const date = row.getValue('chargeDate') as Date
      return (
        <div className="whitespace-nowrap">
          {formatDate(date, false)}
        </div>
      )
    },
    size: 100,
    minSize: 100,
    maxSize: 150,
  },
  {
    id: 'paymentId',
    accessorFn: (row) => row.payment.id,
    header: 'ID',
    cell: ({ row }) => {
      const id = row.getValue('paymentId') as string
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <DataTableCopyableCell copyText={id}>
            {id}
          </DataTableCopyableCell>
        </div>
      )
    },
    size: 100,
    minSize: 100,
    maxSize: 150,
  },
  {
    id: 'actions',
    enableHiding: false,
    enableResizing: false,
    cell: ({ row }) => {
      const payment = row.original.payment
      return (
        <div
          className="w-8 flex justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <PaymentActionsMenu payment={payment} />
        </div>
      )
    },
    size: 1,
    minSize: 56,
    maxSize: 56,
  },
]
