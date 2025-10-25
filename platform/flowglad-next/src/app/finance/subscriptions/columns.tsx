'use client'

import * as React from 'react'
import { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { sentenceCase } from 'change-case'
import { X } from 'lucide-react'
import { formatDate } from '@/utils/core'
import {
  EnhancedDataTableActionsMenu,
  ActionMenuItem,
} from '@/components/ui/enhanced-data-table-actions-menu'
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import { DataTableLinkableCell } from '@/components/ui/data-table-linkable-cell'
import { Subscription } from '@/db/schema/subscriptions'
import { SubscriptionStatus } from '@/types'
import CancelSubscriptionModal from '@/components/forms/CancelSubscriptionModal'
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'

const subscriptionStatusColors: Record<SubscriptionStatus, string> = {
  [SubscriptionStatus.Active]: 'bg-green-100 text-green-800',
  [SubscriptionStatus.Canceled]: 'bg-red-100 text-red-800',
  [SubscriptionStatus.CancellationScheduled]:
    'bg-red-100 text-red-800',
  [SubscriptionStatus.Incomplete]: 'bg-yellow-100 text-yellow-800',
  [SubscriptionStatus.IncompleteExpired]: 'bg-red-100 text-red-800',
  [SubscriptionStatus.PastDue]: 'bg-red-100 text-red-800',
  [SubscriptionStatus.Paused]: 'bg-yellow-100 text-yellow-800',
  [SubscriptionStatus.Trialing]: 'bg-yellow-100 text-yellow-800',
  [SubscriptionStatus.Unpaid]: 'bg-yellow-100 text-yellow-800',
  [SubscriptionStatus.CreditTrial]: 'bg-yellow-100 text-yellow-800',
}

const SubscriptionStatusBadge = ({
  status,
}: {
  status: SubscriptionStatus
}) => {
  return (
    <Badge
      variant="secondary"
      className={subscriptionStatusColors[status]}
    >
      {sentenceCase(status)}
    </Badge>
  )
}

function SubscriptionActionsMenu({
  subscription,
}: {
  subscription: Subscription.ClientRecord
}) {
  const [isCancelOpen, setIsCancelOpen] = React.useState(false)

  const actionItems: ActionMenuItem[] = [
    {
      label: 'Cancel Subscription',
      icon: <X className="h-4 w-4" />,
      handler: () => setIsCancelOpen(true),
      destructive: true,
      disabled: subscription.status === SubscriptionStatus.Canceled,
      helperText:
        subscription.status === SubscriptionStatus.Canceled
          ? 'Subscription is already canceled'
          : undefined,
    },
  ]

  return (
    <EnhancedDataTableActionsMenu items={actionItems}>
      <CancelSubscriptionModal
        isOpen={isCancelOpen}
        setIsOpen={setIsCancelOpen}
        subscriptionId={subscription.id}
      />
    </EnhancedDataTableActionsMenu>
  )
}

export const columns: ColumnDef<Subscription.TableRowData>[] = [
  {
    id: 'customerName',
    accessorFn: (row) => {
      const customer = row.customer
      const name = customer.name?.trim() ?? ''
      const email = customer.email?.trim() ?? ''
      const combined = [name, email]
        .filter((value) => value.length > 0)
        .join(' ')

      return combined.toLowerCase()
    },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Customer" />
    ),
    sortingFn: (rowA, rowB, columnId) => {
      const valueA = rowA.getValue<string>(columnId) ?? ''
      const valueB = rowB.getValue<string>(columnId) ?? ''
      return valueA.localeCompare(valueB)
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
      const customer = row.original.customer
      const hasName =
        typeof customer.name === 'string' &&
        customer.name.trim().length > 0
      const displayName = hasName ? customer.name : customer.email
      return (
        <div>
          <DataTableLinkableCell href={`/customers/${customer.id}`}>
            {displayName}
          </DataTableLinkableCell>
        </div>
      )
    },
    size: 200,
    minSize: 200,
    maxSize: 275,
  },
  {
    id: 'status',
    accessorFn: (row) => row.subscription.status,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    sortingFn: (rowA, rowB, columnId) => {
      const statusA = rowA.getValue<string>(columnId) ?? ''
      const statusB = rowB.getValue<string>(columnId) ?? ''
      return statusA.localeCompare(statusB)
    },
    filterFn: (row, columnId, filterValue) => {
      if (!filterValue) {
        return true
      }
      const value = row.getValue<string>(columnId)
      if (Array.isArray(filterValue)) {
        if (filterValue.length === 0) {
          return true
        }
        return filterValue.includes(value)
      }
      return value === filterValue
    },
    cell: ({ row }) => {
      const status = row.getValue('status') as SubscriptionStatus
      return <SubscriptionStatusBadge status={status} />
    },
    size: 110,
    minSize: 105,
    maxSize: 115,
  },
  {
    id: 'productName',
    accessorFn: (row) => row.product.name,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Product" />
    ),
    sortingFn: (rowA, rowB, columnId) => {
      const productA = rowA.getValue<string>(columnId) ?? ''
      const productB = rowB.getValue<string>(columnId) ?? ''
      return productA.localeCompare(productB)
    },
    filterFn: (row, columnId, filterValue) => {
      if (!filterValue) {
        return true
      }
      const value = row.getValue<string>(columnId) ?? ''
      if (Array.isArray(filterValue)) {
        if (filterValue.length === 0) {
          return true
        }
        return filterValue.includes(value)
      }
      return value === filterValue
    },
    cell: ({ row }) => {
      const product = row.original.product
      return (
        <div>
          <DataTableLinkableCell
            href={`/store/products/${product.id}`}
          >
            {product.name}
          </DataTableLinkableCell>
        </div>
      )
    },
    size: 200,
    minSize: 120,
    maxSize: 300,
  },
  {
    id: 'createdAt',
    accessorFn: (row) => row.subscription.createdAt,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created" />
    ),
    sortingFn: (rowA, rowB, columnId) => {
      const dateA = rowA.getValue<Date>(columnId)
      const dateB = rowB.getValue<Date>(columnId)
      const timeA = dateA ? new Date(dateA).getTime() : 0
      const timeB = dateB ? new Date(dateB).getTime() : 0
      return timeA - timeB
    },
    cell: ({ row }) => {
      const date = row.getValue('createdAt') as Date
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
    id: 'canceledAt',
    accessorFn: (row) => row.subscription.canceledAt,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Canceled" />
    ),
    sortingFn: (rowA, rowB, columnId) => {
      const dateA = rowA.getValue<Date | null>(columnId)
      const dateB = rowB.getValue<Date | null>(columnId)
      const timeA = dateA ? new Date(dateA).getTime() : -Infinity
      const timeB = dateB ? new Date(dateB).getTime() : -Infinity
      return timeA - timeB
    },
    cell: ({ row }) => {
      const date = row.getValue('canceledAt') as Date | null
      return (
        <div className="whitespace-nowrap">
          {date ? formatDate(date, false) : '-'}
        </div>
      )
    },
    size: 100,
    minSize: 100,
    maxSize: 150,
  },
  {
    id: 'subscriptionId',
    accessorFn: (row) => row.subscription.id,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="ID" />
    ),
    sortingFn: (rowA, rowB, columnId) => {
      const idA = rowA.getValue<string>(columnId) ?? ''
      const idB = rowB.getValue<string>(columnId) ?? ''
      return idA.localeCompare(idB)
    },
    cell: ({ row }) => {
      const id = row.getValue('subscriptionId') as string
      return (
        <div>
          <DataTableCopyableCell copyText={id}>
            {id}
          </DataTableCopyableCell>
        </div>
      )
    },
    size: 120,
    minSize: 120,
    maxSize: 150,
  },
  {
    id: 'actions',
    enableHiding: false,
    enableResizing: false,
    cell: ({ row }) => {
      const subscription = row.original.subscription
      return (
        <div
          className="w-8 flex justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <SubscriptionActionsMenu subscription={subscription} />
        </div>
      )
    },
    size: 1,
    minSize: 56,
    maxSize: 56,
  },
]
