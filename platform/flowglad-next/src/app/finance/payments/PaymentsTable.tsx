'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DisplayColumnDef } from '@tanstack/react-table'
import Table, { TableCell } from '@/components/ion/Table'
import ColumnHeaderCell from '@/components/ion/ColumnHeaderCell'
import { Payment } from '@/db/schema/payments'
import TableRowPopoverMenu from '@/components/TableRowPopoverMenu'
import { PopoverMenuItem } from '@/components/PopoverMenu'
import Link from 'next/link'
import { CurrencyCode, PaymentStatus } from '@/types'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { Badge } from '@/components/ui/badge'
import { sentenceCase } from 'change-case'
import RefundPaymentModal from './RefundPaymentModal'
import { Check, Hourglass, X, RotateCcw } from 'lucide-react'
import { formatDate } from '@/utils/core'
import { trpc } from '@/app/_trpc/client'
import MoreMenuTableCell from '@/components/MoreMenuTableCell'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'

const MoreMenuCell = ({
  payment,
  customer,
}: Payment.TableRowData) => {
  const [isRefundOpen, setIsRefundOpen] = useState(false)
  const items: PopoverMenuItem[] = [
    {
      label: 'Refund Payment',
      handler: () => setIsRefundOpen(true),
      disabled: payment.status !== PaymentStatus.Succeeded,
    },
  ]
  return (
    <MoreMenuTableCell items={items}>
      <RefundPaymentModal
        isOpen={isRefundOpen}
        setIsOpen={setIsRefundOpen}
        payment={payment}
      />
    </MoreMenuTableCell>
  )
}

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

export interface PaymentsTableFilters {
  status?: PaymentStatus
  customerId?: string
  organizationId?: string
  subscriptionId?: string
  invoiceId?: string
}

const PaymentsTable = ({
  filters = {},
}: {
  filters?: PaymentsTableFilters
}) => {
  const {
    pageIndex,
    pageSize,
    handlePaginationChange,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<
    Payment.TableRowData,
    PaymentsTableFilters
  >({
    initialCurrentCursor: undefined,
    pageSize: 10,
    filters,
    useQuery: trpc.payments.getTableRows.useQuery,
  })

  const columns = useMemo(
    () =>
      [
        {
          header: ({ column }) => (
            <ColumnHeaderCell title="Amount" column={column} />
          ),
          accessorKey: 'payment.amount',
          cell: ({ row: { original: cellData } }) => (
            <TableCell
              className="relative max-w-[160px] truncate text-sm text-muted-foreground"
              title={stripeCurrencyAmountToHumanReadableCurrencyAmount(
                cellData.payment.currency,
                cellData.payment.amount
              )}
            >
              <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
                {stripeCurrencyAmountToHumanReadableCurrencyAmount(
                  cellData.payment.currency,
                  cellData.payment.amount
                )}
              </span>
            </TableCell>
          ),
        },
        {
          header: ({ column }) => (
            <ColumnHeaderCell title="Status" column={column} />
          ),
          accessorKey: 'payment.status',
          cell: ({ row: { original: cellData } }) => (
            <PaymentStatusBadge status={cellData.payment.status} />
          ),
        },
        {
          header: ({ column }) => (
            <ColumnHeaderCell title="Customer" column={column} />
          ),
          accessorKey: 'customer.name',
          cell: ({ row: { original: cellData } }) => (
            <Link
              href={`/customers/${cellData.customer.id}`}
              className="text-sm"
            >
              {cellData.customer.name}
            </Link>
          ),
        },
        {
          id: 'refundedAmount',
          header: ({ column }) => (
            <ColumnHeaderCell title="Date" column={column} />
          ),
          accessorKey: 'payment.refundedDate',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">
              {formatDate(cellData.payment.chargeDate, true)}
            </span>
          ),
        },
        {
          header: ({ column }) => (
            <ColumnHeaderCell title="ID" column={column} />
          ),
          accessorKey: 'payment.id',
          cell: ({ row: { original: cellData } }) => (
            <CopyableTextTableCell copyText={cellData.payment.id}>
              {cellData.payment.id}
            </CopyableTextTableCell>
          ),
        },
        {
          id: '_',
          cell: ({ row: { original: cellData } }) => (
            <MoreMenuCell
              payment={cellData.payment}
              customer={cellData.customer}
            />
          ),
        },
      ] as DisplayColumnDef<Payment.TableRowData>[],
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

export default PaymentsTable
