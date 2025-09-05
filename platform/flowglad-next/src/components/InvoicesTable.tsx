import { DataTable } from '@/components/ui/data-table'
import { ColumnDef } from '@tanstack/react-table'
import { Invoice } from '@/db/schema/invoices'
import { Customer } from '@/db/schema/customers'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import core from '@/utils/core'
import { sentenceCase } from 'change-case'
// import CreateInvoiceModal from './forms/CreateInvoiceModal'
import { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import { PopoverMenuItem } from './PopoverMenu'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
import EditInvoiceModal from './forms/EditInvoiceModal'
import { invoiceIsInTerminalState } from '@/db/tableMethods/invoiceMethods'
import { InvoiceStatus } from '@/types'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import SendInvoiceReminderEmailModal from './forms/SendInvoiceReminderEmailModal'
import { trpc } from '@/app/_trpc/client'
import MoreMenuTableCell from '@/components/MoreMenuTableCell'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'

const InvoiceStatusBadge = ({
  invoice,
}: {
  invoice: Invoice.ClientRecord
}) => {
  let className: string
  switch (invoice.status) {
    case 'draft':
      className = 'bg-gray-100 text-gray-800'
      break
    case 'paid':
      className = 'bg-green-100 text-green-800'
      break
    case 'void':
      className = 'bg-red-100 text-red-800'
      break
    case 'uncollectible':
      className = 'bg-red-100 text-red-800'
      break
    case 'partially_refunded':
      className = 'bg-yellow-100 text-yellow-800'
      break
    case 'refunded':
      className = 'bg-yellow-100 text-yellow-800'
      break
    default:
      className = 'bg-gray-100 text-gray-800'
      break
  }
  return (
    <Badge variant="secondary" className={className}>
      {sentenceCase(invoice.status)}
    </Badge>
  )
}

const MoreMenuCell = ({
  invoice,
  invoiceLineItems,
}: {
  invoice: Invoice.ClientRecord
  invoiceLineItems: InvoiceLineItem.ClientRecord[]
}) => {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isSendReminderEmailOpen, setIsSendReminderEmailOpen] =
    useState(false)

  const text =
    typeof window !== 'undefined'
      ? `${window.location.origin}/invoice/view/${invoice.organizationId}/${invoice.id}`
      : ''

  const copyInvoiceUrlHandler = useCopyTextHandler({
    text,
  })

  const items: PopoverMenuItem[] = [
    {
      label: 'Copy URL',
      handler: copyInvoiceUrlHandler,
    },
  ]

  if (!invoiceIsInTerminalState(invoice)) {
    items.push({
      label: 'Edit Invoice',
      handler: () => setIsEditOpen(true),
    })

    if (invoice.status !== InvoiceStatus.Draft) {
      items.push({
        label: 'Send Reminder Email',
        handler: () => setIsSendReminderEmailOpen(true),
      })
    }
  }

  return (
    <MoreMenuTableCell items={items}>
      <EditInvoiceModal
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        invoiceAndLineItems={{
          invoice: invoice,
          invoiceLineItems: invoiceLineItems,
        }}
      />
      <SendInvoiceReminderEmailModal
        isOpen={isSendReminderEmailOpen}
        setIsOpen={setIsSendReminderEmailOpen}
        invoiceId={invoice.id}
      />
    </MoreMenuTableCell>
  )
}

export interface InvoicesTableFilters {
  status?: InvoiceStatus
  customerId?: string
  subscriptionId?: string
}

const InvoicesTable = ({
  filters = {},
  customer,
}: {
  filters?: InvoicesTableFilters
  customer?: Customer.ClientRecord
}) => {
  const {
    pageIndex,
    pageSize,
    handlePaginationChange,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<
    {
      invoice: Invoice.ClientRecord
      customer: { id: string; name: string }
      invoiceLineItems: InvoiceLineItem.ClientRecord[]
    },
    InvoicesTableFilters
  >({
    initialCurrentCursor: undefined,
    pageSize: 10,
    filters: {
      ...filters,
      customerId: customer?.id,
    },
    useQuery: trpc.invoices.getTableRows.useQuery,
  })

  const columns = useMemo(
    () =>
      [
        {
          header: 'Amount',
          accessorKey: 'amount',
          width: '10%',
          cell: ({ row: { original: cellData } }) => (
            <>
              <span className="font-bold text-sm">
                {stripeCurrencyAmountToHumanReadableCurrencyAmount(
                  cellData.invoice.currency,
                  0
                  // cellData.invoice.amount
                )}
              </span>
            </>
          ),
        },
        {
          header: 'Status',
          accessorKey: 'status',
          cell: ({ row: { original: cellData } }) => (
            <InvoiceStatusBadge invoice={cellData.invoice} />
          ),
        },
        {
          header: 'Invoice Number',
          accessorKey: 'invoiceNumber',
          cell: ({ row: { original: cellData } }) => (
            <>{cellData.invoice.invoiceNumber}</>
          ),
        },
        {
          header: 'Due',
          accessorKey: 'due',
          width: '15%',
          cell: ({ row: { original: cellData } }) => (
            <>
              {cellData.invoice.dueDate
                ? core.formatDate(cellData.invoice.dueDate)
                : '-'}
            </>
          ),
        },
        {
          header: 'Created',
          accessorKey: 'createdAt',
          width: '15%',
          cell: ({ row: { original: cellData } }) => (
            <>{core.formatDate(cellData.invoice.createdAt)}</>
          ),
        },
        {
          header: 'ID',
          accessorKey: 'invoice.id',
          width: '15%',
          cell: ({ row: { original: cellData } }) => (
            <CopyableTextTableCell copyText={cellData.invoice.id}>
              {cellData.invoice.id}
            </CopyableTextTableCell>
          ),
        },
        {
          id: '_',
          width: '10%',
          cell: ({ row: { original: cellData } }) => (
            <MoreMenuCell
              invoice={cellData.invoice}
              invoiceLineItems={cellData.invoiceLineItems}
            />
          ),
        },
      ] as ColumnDef<
        {
          invoice: Invoice.ClientRecord
          customer: { id: string; name: string }
          invoiceLineItems: InvoiceLineItem.ClientRecord[]
        },
        string
      >[],
    []
  )

  const tableData = data?.items || []
  const total = data?.total || 0

  return (
    <div className="w-full flex flex-col gap-5">
      <DataTable
        columns={columns}
        data={tableData}
        className="w-full rounded-lg"
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
    </div>
  )
}

export default InvoicesTable
