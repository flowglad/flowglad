'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { Copy, ExternalLink, Rewind, RotateCcw } from 'lucide-react'
import * as React from 'react'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import { DataTableLinkableCell } from '@/components/ui/data-table-linkable-cell'
import {
  type ActionMenuItem,
  EnhancedDataTableActionsMenu,
} from '@/components/ui/enhanced-data-table-actions-menu'
import { PaymentStatusTag } from '@/components/ui/status-tag'
import type { Payment } from '@/db/schema/payments'
import { PaymentStatus } from '@/types'
import core, { formatDate } from '@/utils/core'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import RefundPaymentModal from './RefundPaymentModal'
import RetryPaymentModal from './RetryPaymentModal'

function PaymentActionsMenu({
  payment,
}: {
  payment: Payment.ClientRecord
}) {
  const [isRefundOpen, setIsRefundOpen] = React.useState(false)
  const [isRetryOpen, setIsRetryOpen] = React.useState(false)
  const copyIDHandler = useCopyTextHandler({ text: payment.id })

  const invoiceUrl = `${core.NEXT_PUBLIC_APP_URL}/invoice/view/${payment.organizationId}/${payment.invoiceId}`

  const actionItems: ActionMenuItem[] = [
    {
      label: 'View Invoice',
      icon: <ExternalLink className="h-4 w-4" />,
      handler: () =>
        window.open(invoiceUrl, '_blank', 'noopener,noreferrer'),
    },
    {
      label: 'Refund Payment',
      icon: <Rewind className="h-4 w-4" />,
      disabled: payment.status !== PaymentStatus.Succeeded,
      helperText:
        payment.status !== PaymentStatus.Succeeded
          ? 'Only succeeded payments can be refunded'
          : undefined,
      handler: () => setIsRefundOpen(true),
    },
    {
      label: 'Copy ID',
      icon: <Copy className="h-4 w-4" />,
      handler: copyIDHandler,
    },
  ]

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
    id: 'status',
    accessorFn: (row) => row.payment.status,
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue('status') as PaymentStatus
      return <PaymentStatusTag status={status} />
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
    size: 120,
    minSize: 120,
    maxSize: 128,
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
    id: 'amount',
    accessorFn: (row) => row.payment.amount,
    header: () => <div className="text-right">Amount</div>,
    cell: ({ row }) => {
      const payment = row.original.payment
      const formatted =
        stripeCurrencyAmountToHumanReadableCurrencyAmount(
          payment.currency,
          payment.amount
        )
      return (
        <div className="truncate text-right" title={formatted}>
          {formatted}
        </div>
      )
    },
    size: 120,
    minSize: 112,
    maxSize: 130,
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
