'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DisplayColumnDef } from '@tanstack/react-table'
import Table from '@/components/ion/Table'
import SortableColumnHeaderCell from '@/components/ion/SortableColumnHeaderCell'
import { Payment } from '@/db/schema/payments'
import TableRowPopoverMenu from '@/components/TableRowPopoverMenu'
import { PopoverMenuItem } from '@/components/PopoverMenu'
import Link from 'next/link'
import { CurrencyCode, PaymentStatus } from '@/types'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import Badge, { BadgeColor } from '@/components/ion/Badge'
import { sentenceCase } from 'change-case'
import RefundPaymentModal from './RefundPaymentModal'
import { Check, Hourglass, X, RotateCcw } from 'lucide-react'
import { formatDate } from '@/utils/core'
import { trpc } from '@/app/_trpc/client'

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
    <>
      <RefundPaymentModal
        isOpen={isRefundOpen}
        setIsOpen={setIsRefundOpen}
        payment={payment}
      />
      <TableRowPopoverMenu items={items} />
    </>
  )
}

const PaymentStatusBadge = ({
  status,
}: {
  status: PaymentStatus
}) => {
  let color: BadgeColor = 'grey'
  let icon: React.ReactNode = null
  if (status === PaymentStatus.Succeeded) {
    color = 'green'
    icon = <Check className="w-4 h-4" />
  } else if (status === PaymentStatus.Processing) {
    color = 'yellow'
    icon = <Hourglass className="w-4 h-4" />
  } else if (status === PaymentStatus.Canceled) {
    color = 'red'
    icon = <X className="w-4 h-4" />
  } else if (status === PaymentStatus.Refunded) {
    color = 'grey'
    icon = <RotateCcw className="w-4 h-4" />
  }
  return (
    <Badge variant="soft" color={color} iconLeading={icon}>
      {sentenceCase(status)}
    </Badge>
  )
}

export interface PaymentsTableFilters {
  status?: PaymentStatus
  customerId?: string
  organizationId?: string
}

const PaymentsTable = ({
  filters = {},
}: {
  filters?: PaymentsTableFilters
}) => {
  const router = useRouter()
  const [pageIndex, setPageIndex] = useState(0)
  const pageSize = 10

  const { data, isLoading, isFetching } =
    trpc.payments.getTableRows.useQuery({
      cursor: pageIndex.toString(),
      limit: pageSize,
      filters,
    })

  const columns = useMemo(
    () =>
      [
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Amount"
              column={column}
            />
          ),
          accessorKey: 'payment.amount',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">
              {stripeCurrencyAmountToHumanReadableCurrencyAmount(
                cellData.payment.currency,
                cellData.payment.amount
              )}
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
          accessorKey: 'payment.status',
          cell: ({ row: { original: cellData } }) => (
            <PaymentStatusBadge status={cellData.payment.status} />
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Customer"
              column={column}
            />
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
            <SortableColumnHeaderCell title="Date" column={column} />
          ),
          accessorKey: 'payment.refundedDate',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">
              {formatDate(cellData.payment.chargeDate, true)}
            </span>
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

  const handlePaginationChange = (newPageIndex: number) => {
    setPageIndex(newPageIndex)
  }

  const tableData = data?.data || []
  const total = data?.total || 0
  const pageCount = Math.ceil(total / pageSize)

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
