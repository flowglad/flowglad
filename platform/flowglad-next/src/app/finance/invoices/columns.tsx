'use client'

import * as React from 'react'
import { ColumnDef } from '@tanstack/react-table'
// Icons come next
import { Link, Pencil, Mail } from 'lucide-react'
// UI components last
import { Badge } from '@/components/ui/badge'
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import { DataTableLinkableCell } from '@/components/ui/data-table-linkable-cell'
import {
  EnhancedDataTableActionsMenu,
  ActionMenuItem,
} from '@/components/ui/enhanced-data-table-actions-menu'
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
// Other imports
import { Invoice } from '@/db/schema/invoices'
import { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
import EditInvoiceModal from '@/components/forms/EditInvoiceModal'
import { invoiceIsInTerminalState } from '@/db/tableMethods/invoiceMethods'
import { InvoiceStatus } from '@/types'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import SendInvoiceReminderEmailModal from '@/components/forms/SendInvoiceReminderEmailModal'
import core from '@/utils/core'
import { sentenceCase } from 'change-case'

export type InvoiceTableRowData = {
  invoice: Invoice.ClientRecord
  customer: { id: string; name: string }
  invoiceLineItems: InvoiceLineItem.ClientRecord[]
}

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

function InvoiceActionsMenu({
  invoice,
  invoiceLineItems,
}: {
  invoice: Invoice.ClientRecord
  invoiceLineItems: InvoiceLineItem.ClientRecord[]
}) {
  const [isEditOpen, setIsEditOpen] = React.useState(false)
  const [isSendReminderEmailOpen, setIsSendReminderEmailOpen] =
    React.useState(false)

  const invoiceUrl = `${core.NEXT_PUBLIC_APP_URL}/invoice/view/${invoice.organizationId}/${invoice.id}`
  const copyInvoiceUrlHandler = useCopyTextHandler({
    text: invoiceUrl,
  })

  const actionItems: ActionMenuItem[] = []

  // Copy invoice URL - always available
  actionItems.push({
    label: 'Copy invoice URL',
    icon: <Link className="h-4 w-4" />,
    handler: copyInvoiceUrlHandler,
  })

  // Edit invoice - only if not in terminal state
  if (!invoiceIsInTerminalState(invoice)) {
    actionItems.push({
      label: 'Edit invoice',
      icon: <Pencil className="h-4 w-4" />,
      handler: () => setIsEditOpen(true),
    })
  }

  // Send reminder email - only for draft or open invoices
  if (invoice.status === 'draft' || invoice.status === 'open') {
    actionItems.push({
      label: 'Send reminder email',
      icon: <Mail className="h-4 w-4" />,
      handler: () => setIsSendReminderEmailOpen(true),
    })
  }

  return (
    <EnhancedDataTableActionsMenu items={actionItems}>
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
    </EnhancedDataTableActionsMenu>
  )
}

export const columns: ColumnDef<InvoiceTableRowData>[] = [
  {
    id: 'customerName',
    accessorFn: (row) => {
      const name = row.customer.name?.trim() ?? ''
      return name.toLowerCase() || row.customer.id.toLowerCase()
    },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Customer" />
    ),
    cell: ({ row }) => {
      const customer = row.original.customer
      const name = customer.name?.trim() ?? ''
      const displayName = name || customer.id
      return (
        <div>
          <DataTableLinkableCell href={`/customers/${customer.id}`}>
            {displayName}
          </DataTableLinkableCell>
        </div>
      )
    },
    size: 175,
    minSize: 170,
    maxSize: 200,
  },
  {
    id: 'invoiceNumber',
    accessorFn: (row) => row.invoice.invoiceNumber?.trim() ?? '',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Number" />
    ),
    cell: ({ row }) => {
      const invoiceNumber = row.original.invoice.invoiceNumber
      return (
        <div>
          <DataTableCopyableCell copyText={invoiceNumber}>
            <span className="font-mono text-sm">{invoiceNumber}</span>
          </DataTableCopyableCell>
        </div>
      )
    },
    size: 175,
    minSize: 170,
    maxSize: 200,
  },
  {
    id: 'status',
    accessorFn: (row) => row.invoice.status,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const invoice = row.original.invoice
      return <InvoiceStatusBadge invoice={invoice} />
    },
    size: 115,
    minSize: 115,
    maxSize: 120,
  },
  {
    id: 'total',
    accessorFn: (row) => {
      // Calculate total from invoice line items
      return row.invoiceLineItems.reduce((sum, item) => {
        return sum + item.price * item.quantity
      }, 0)
    },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Total" />
    ),
    cell: ({ row }) => {
      const total = row.getValue('total') as number
      const formatted =
        stripeCurrencyAmountToHumanReadableCurrencyAmount(
          row.original.invoice.currency,
          total
        )
      return (
        <div className="whitespace-nowrap truncate" title={formatted}>
          {formatted}
        </div>
      )
    },
    size: 120,
    minSize: 80,
    maxSize: 140,
  },
  {
    id: 'dueDate',
    accessorFn: (row) => row.invoice.dueDate,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Due Date" />
    ),
    cell: ({ row }) => {
      const dueDate = row.getValue('dueDate') as Date | null
      return (
        <div className="whitespace-nowrap">
          {dueDate ? core.formatDate(dueDate) : '-'}
        </div>
      )
    },
    size: 125,
    minSize: 100,
    maxSize: 150,
  },
  {
    id: 'createdAt',
    accessorFn: (row) => row.invoice.createdAt,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created" />
    ),
    cell: ({ row }) => (
      <div className="whitespace-nowrap">
        {core.formatDate(row.getValue('createdAt'))}
      </div>
    ),
    size: 125,
    minSize: 100,
    maxSize: 150,
  },
  {
    id: 'invoiceId',
    accessorFn: (row) => row.invoice.id,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="ID" />
    ),
    cell: ({ row }) => (
      <div>
        <DataTableCopyableCell copyText={row.getValue('invoiceId')}>
          {row.getValue('invoiceId')}
        </DataTableCopyableCell>
      </div>
    ),
    size: 125,
    minSize: 80,
    maxSize: 250,
  },
  {
    id: 'actions',
    enableHiding: false,
    enableResizing: false,
    cell: ({ row }) => {
      const { invoice, invoiceLineItems } = row.original
      return (
        <div
          className="w-8 flex justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <InvoiceActionsMenu
            invoice={invoice}
            invoiceLineItems={invoiceLineItems}
          />
        </div>
      )
    },
    size: 1,
    minSize: 56,
    maxSize: 56,
  },
]
