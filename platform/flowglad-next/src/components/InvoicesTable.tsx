import Table, { ColumnDefWithWidth } from '@/components/ion/Table'
import TableTitle from '@/components/ion/TableTitle'
import { Invoice } from '@/db/schema/invoices'
import { Customer } from '@/db/schema/customers'
import { useMemo, useState } from 'react'
import Badge, { BadgeProps } from './ion/Badge'
import { ColumnDef } from '@tanstack/react-table'
import core from '@/utils/core'
import { sentenceCase } from 'change-case'
import SortableColumnHeaderCell from '@/components/ion/SortableColumnHeaderCell'
import CreateInvoiceModal from './forms/CreateInvoiceModal'
import {
  ClientInvoiceWithLineItems,
  InvoiceLineItem,
} from '@/db/schema/invoiceLineItems'
import { PopoverMenuItem } from './PopoverMenu'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
import TableRowPopoverMenu from './TableRowPopoverMenu'
import EditInvoiceModal from './forms/EditInvoiceModal'
import { invoiceIsInTerminalState } from '@/db/tableMethods/invoiceMethods'
import { InvoiceStatus } from '@/types'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { Plus } from 'lucide-react'
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
  let color: BadgeProps['color']
  switch (invoice.status) {
    case 'draft':
      color = 'grey'
      break
    case 'paid':
      color = 'green'
      break
    case 'void':
      color = 'red'
      break
    case 'uncollectible':
      color = 'red'
      break
    case 'partially_refunded':
      color = 'yellow'
      break
    case 'refunded':
      color = 'yellow'
      break
  }
  return (
    <Badge variant="soft" color={color} size="sm">
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
}

const InvoicesTable = ({
  filters = {},
  customer,
}: {
  filters?: InvoicesTableFilters
  customer?: Customer.ClientRecord
}) => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

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
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Amount"
              column={column}
            />
          ),
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
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Status"
              column={column}
            />
          ),
          accessorKey: 'status',
          cell: ({ row: { original: cellData } }) => (
            <InvoiceStatusBadge invoice={cellData.invoice} />
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Invoice Number"
              column={column}
            />
          ),
          accessorKey: 'invoiceNumber',
          cell: ({ row: { original: cellData } }) => (
            <>{cellData.invoice.invoiceNumber}</>
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell title="Due" column={column} />
          ),
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
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Created"
              column={column}
            />
          ),
          accessorKey: 'createdAt',
          width: '15%',
          cell: ({ row: { original: cellData } }) => (
            <>{core.formatDate(cellData.invoice.createdAt)}</>
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell title="ID" column={column} />
          ),
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
      ] as ColumnDefWithWidth<
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
      <TableTitle
        title="Invoices"
        buttonIcon={<Plus size={16} strokeWidth={2} />}
        buttonLabel="Create Invoice"
        buttonOnClick={() => {
          setIsCreateModalOpen(true)
        }}
      />
      <Table
        columns={columns}
        data={tableData}
        className="w-full rounded-radius"
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
      <CreateInvoiceModal
        isOpen={isCreateModalOpen}
        setIsOpen={setIsCreateModalOpen}
        customer={customer}
      />
    </div>
  )
}

export default InvoicesTable
