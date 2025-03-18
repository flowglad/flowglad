import Table from '@/components/ion/Table'
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
  InvoiceWithLineItems,
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
    <>
      <TableRowPopoverMenu items={items} />
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
    </>
  )
}

const InvoicesTable = ({
  invoicesAndLineItems,
  customer,
}: {
  invoicesAndLineItems: ClientInvoiceWithLineItems[]
  customer?: Customer.ClientRecord
  showOwners?: boolean
}) => {
  const [createInvoiceModalOpen, setCreateInvoiceModalOpen] =
    useState(false)

  const columns_1 = useMemo(
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
          cell: ({ row: { original: cellData } }) => (
            <>
              <span className="font-bold text-sm">
                {stripeCurrencyAmountToHumanReadableCurrencyAmount(
                  cellData.invoice.currency,
                  cellData.invoiceLineItems.reduce(
                    (acc, item) => acc + item.price * item.quantity,
                    0
                  )
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
          cell: ({ row: { original: cellData } }) => (
            <>{core.formatDate(cellData.invoice.createdAt)}</>
          ),
        },
        {
          id: '_',
          cell: ({ row: { original: cellData } }) => (
            <div
              className="w-fit"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreMenuCell
                invoice={cellData.invoice}
                invoiceLineItems={cellData.invoiceLineItems}
              />
            </div>
          ),
        },
      ] as ColumnDef<ClientInvoiceWithLineItems>[],
    []
  )

  return (
    <div className="w-full flex flex-col gap-5">
      <TableTitle
        title="Invoices"
        buttonLabel="Create Invoice"
        buttonIcon={<Plus size={16} />}
        buttonOnClick={() => setCreateInvoiceModalOpen(true)}
      />
      <div className="w-full flex flex-col gap-5 pb-20">
        <Table
          columns={columns_1}
          data={invoicesAndLineItems}
          className="w-full rounded-radius"
          bordered
        />
      </div>
      <CreateInvoiceModal
        isOpen={createInvoiceModalOpen}
        setIsOpen={setCreateInvoiceModalOpen}
        customer={customer}
      />
    </div>
  )
}

export default InvoicesTable
