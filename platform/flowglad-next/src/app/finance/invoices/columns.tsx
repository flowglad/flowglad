'use client'

import type { ColumnDef } from '@tanstack/react-table'
// Icons come next
import { Link } from 'lucide-react'
import * as React from 'react'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
// UI components last
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import { DataTableLinkableCell } from '@/components/ui/data-table-linkable-cell'
import {
  type ActionMenuItem,
  EnhancedDataTableActionsMenu,
} from '@/components/ui/enhanced-data-table-actions-menu'
import { InvoiceStatusTag } from '@/components/ui/status-tag'
import type { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
// Other imports
import type { Invoice } from '@/db/schema/invoices'
import { InvoiceStatus } from '@/types'
import core from '@/utils/core'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'

export type InvoiceTableRowData = {
  invoice: Invoice.ClientRecord
  customer: { id: string; name: string }
  invoiceLineItems: InvoiceLineItem.ClientRecord[]
}

function InvoiceActionsMenu({
  invoice,
}: {
  invoice: Invoice.ClientRecord
}) {
  const invoiceUrl = `${core.NEXT_PUBLIC_APP_URL}/invoice/view/${invoice.organizationId}/${invoice.id}`
  const copyInvoiceUrlHandler = useCopyTextHandler({
    text: invoiceUrl,
  })

  const actionItems: ActionMenuItem[] = [
    {
      label: 'Copy invoice URL',
      icon: <Link className="h-4 w-4" />,
      handler: copyInvoiceUrlHandler,
    },
  ]

  return <EnhancedDataTableActionsMenu items={actionItems} />
}

export const columns: ColumnDef<InvoiceTableRowData>[] = [
  {
    id: 'customerName',
    accessorFn: (row) => row.customer.name,
    header: 'Customer',
    cell: ({ row }) => {
      const customer = row.original.customer
      return (
        <div>
          <DataTableLinkableCell href={`/customers/${customer.id}`}>
            {customer.name}
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
    accessorFn: (row) => row.invoice.invoiceNumber,
    header: 'Number',
    cell: ({ row }) => (
      <div>
        <DataTableCopyableCell
          copyText={row.getValue('invoiceNumber')}
        >
          <span className="font-mono text-sm">
            {row.getValue('invoiceNumber')}
          </span>
        </DataTableCopyableCell>
      </div>
    ),
    size: 175,
    minSize: 170,
    maxSize: 200,
  },
  {
    id: 'status',
    accessorFn: (row) => row.invoice.status,
    header: 'Status',
    cell: ({ row }) => {
      const invoice = row.original.invoice
      return (
        <InvoiceStatusTag
          status={invoice.status}
          showTooltip
          tooltipVariant="muted"
        />
      )
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
    header: 'Total',
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
    header: 'Due Date',
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
    header: 'Created',
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
    header: 'ID',
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
      const { invoice } = row.original
      return (
        <div
          className="w-8 flex justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <InvoiceActionsMenu invoice={invoice} />
        </div>
      )
    },
    size: 1,
    minSize: 56,
    maxSize: 56,
  },
]
