'use client'

import * as React from 'react'
import { ColumnDef } from '@tanstack/react-table'
// Icons come next
import { Pencil, ExternalLink, Copy } from 'lucide-react'
// UI components last
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import {
  EnhancedDataTableActionsMenu,
  ActionMenuItem,
} from '@/components/ui/enhanced-data-table-actions-menu'
// Other imports
import core from '@/utils/core'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
import EditCustomerModal from '@/components/forms/EditCustomerModal'
import { Customer, CustomerTableRowData } from '@/db/schema/customers'
import { CurrencyCode } from '@/types'

function CustomerActionsMenu({
  customer,
}: {
  customer: Customer.ClientRecord
}) {
  const [isEditOpen, setIsEditOpen] = React.useState(false)

  const billingPortalURL = core.customerBillingPortalURL({
    organizationId: customer.organizationId,
    customerId: customer.id,
  })

  const copyPortalURLHandler = useCopyTextHandler({
    text: billingPortalURL,
  })
  const copyIDHandler = useCopyTextHandler({
    text: customer.id,
  })
  const copyExternalIDHandler = useCopyTextHandler({
    text: customer.externalId,
  })

  const actionItems: ActionMenuItem[] = [
    {
      label: 'Edit',
      icon: <Pencil className="h-4 w-4" />,
      handler: () => setIsEditOpen(true),
    },
    {
      label: 'Copy Portal Link',
      icon: <ExternalLink className="h-4 w-4" />,
      handler: copyPortalURLHandler,
    },
    {
      label: 'Copy External ID',
      icon: <Copy className="h-4 w-4" />,
      handler: copyExternalIDHandler,
    },
    {
      label: 'Copy Customer ID',
      icon: <Copy className="h-4 w-4" />,
      handler: copyIDHandler,
    },
  ]

  return (
    <EnhancedDataTableActionsMenu items={actionItems}>
      <EditCustomerModal
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        customer={customer}
      />
    </EnhancedDataTableActionsMenu>
  )
}

export const columns: ColumnDef<CustomerTableRowData>[] = [
  {
    id: 'name',
    accessorFn: (row) => row.customer.name?.trim() ?? '',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    sortingFn: (rowA, rowB, columnId) => {
      const nameA = rowA.getValue<string>(columnId) ?? ''
      const nameB = rowB.getValue<string>(columnId) ?? ''
      return nameA.localeCompare(nameB)
    },
    filterFn: (row, columnId, filterValue) => {
      if (!filterValue || typeof filterValue !== 'string') {
        return true
      }
      const value = (
        row.getValue<string>(columnId) ?? ''
      ).toLowerCase()
      const search = filterValue.toLowerCase().trim()
      if (search.length === 0) {
        return true
      }
      return value.includes(search)
    },
    cell: ({ row }) => {
      const name = row.original.customer.name?.trim()
      const fallback = row.original.customer.email
      const display = name && name.length > 0 ? name : fallback
      return (
        <div className="truncate" title={display}>
          {display}
        </div>
      )
    },
    size: 200,
    minSize: 200,
    maxSize: 275,
  },
  {
    id: 'email',
    accessorFn: (row) =>
      row.customer.email?.trim().toLowerCase() ?? '',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Email" />
    ),
    sortingFn: (rowA, rowB, columnId) => {
      const emailA = rowA.getValue<string>(columnId) ?? ''
      const emailB = rowB.getValue<string>(columnId) ?? ''
      return emailA.localeCompare(emailB)
    },
    filterFn: (row, columnId, filterValue) => {
      if (!filterValue || typeof filterValue !== 'string') {
        return true
      }
      const value = row.getValue<string>(columnId) ?? ''
      const search = filterValue.toLowerCase().trim()
      if (search.length === 0) {
        return true
      }
      return value.includes(search)
    },
    cell: ({ row }) => {
      const email = row.original.customer.email
      return (
        <div>
          <DataTableCopyableCell
            copyText={email}
            className="lowercase"
          >
            {email}
          </DataTableCopyableCell>
        </div>
      )
    },
    size: 220,
    minSize: 120,
    maxSize: 250,
  },
  {
    accessorKey: 'totalSpend',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Total Spend" />
    ),
    sortingFn: (rowA, rowB, columnId) => {
      const amountA =
        typeof rowA.getValue<number | string | undefined>(
          columnId
        ) === 'number'
          ? (rowA.getValue<number>(columnId) as number)
          : parseFloat(
              (rowA.getValue<string | undefined>(columnId) ??
                '0') as string
            )
      const amountB =
        typeof rowB.getValue<number | string | undefined>(
          columnId
        ) === 'number'
          ? (rowB.getValue<number>(columnId) as number)
          : parseFloat(
              (rowB.getValue<string | undefined>(columnId) ??
                '0') as string
            )
      return amountA - amountB
    },
    cell: ({ row }) => {
      const rawValue = row.getValue<number | string>('totalSpend')
      const amount =
        typeof rawValue === 'number'
          ? rawValue
          : parseFloat((rawValue as string) || '0')
      const formatted =
        stripeCurrencyAmountToHumanReadableCurrencyAmount(
          CurrencyCode.USD,
          amount
        )
      return <div className="whitespace-nowrap">{formatted}</div>
    },
    size: 100,
    minSize: 80,
    maxSize: 120,
  },
  {
    accessorKey: 'payments',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Payments" />
    ),
    sortingFn: (rowA, rowB, columnId) => {
      const paymentsA = Number(rowA.getValue(columnId) || 0)
      const paymentsB = Number(rowB.getValue(columnId) || 0)
      return paymentsA - paymentsB
    },
    cell: ({ row }) => (
      <div className="whitespace-nowrap">
        {row.getValue('payments') || 0}
      </div>
    ),
    size: 100,
    minSize: 80,
    maxSize: 100,
  },
  {
    id: 'createdAt',
    accessorFn: (row) => row.customer.createdAt,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created" />
    ),
    sortingFn: (rowA, rowB, columnId) => {
      const dateA = rowA.getValue<Date | string | null>(columnId)
      const dateB = rowB.getValue<Date | string | null>(columnId)
      const timeA = dateA ? new Date(dateA).getTime() : 0
      const timeB = dateB ? new Date(dateB).getTime() : 0
      return timeA - timeB
    },
    cell: ({ row }) => (
      <div className="whitespace-nowrap">
        {core.formatDate(row.getValue('createdAt'))}
      </div>
    ),
    size: 100,
    minSize: 100,
    maxSize: 150,
  },
  {
    id: 'customerId',
    accessorFn: (row) => row.customer.id,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="ID" />
    ),
    sortingFn: (rowA, rowB, columnId) => {
      const idA = rowA.getValue<string>(columnId) ?? ''
      const idB = rowB.getValue<string>(columnId) ?? ''
      return idA.localeCompare(idB)
    },
    cell: ({ row }) => (
      <div>
        <DataTableCopyableCell copyText={row.getValue('customerId')}>
          {row.getValue('customerId')}
        </DataTableCopyableCell>
      </div>
    ),
    size: 120, // SMALLER: Gets minimal extra space
    minSize: 80,
    maxSize: 180, // Reduced max to keep constrained
  },
  {
    id: 'actions',
    enableHiding: false,
    enableResizing: false,
    cell: ({ row }) => {
      const customer = row.original.customer
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <CustomerActionsMenu customer={customer} />
        </div>
      )
    },
    size: 1,
    minSize: 56,
    maxSize: 56,
  },
]
