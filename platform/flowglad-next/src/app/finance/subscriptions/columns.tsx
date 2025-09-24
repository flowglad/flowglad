'use client'

import * as React from 'react'
import { ColumnDef } from '@tanstack/react-table'
// UI components
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import {
  EnhancedDataTableActionsMenu,
  ActionMenuItem,
} from '@/components/ui/enhanced-data-table-actions-menu'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
// Other imports
import core from '@/utils/core'
import { SubscriptionStatus } from '@/types'
import { sentenceCase } from 'change-case'
import { Subscription } from '@/db/schema/subscriptions'
import CancelSubscriptionModal from '@/components/forms/CancelSubscriptionModal'

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

const SubscriptionStatusCell = ({
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
  subscription: Subscription.TableRowData['subscription']
}) {
  const [cancelOpen, setCancelOpen] = React.useState(false)

  const actionItems: ActionMenuItem[] = [
    {
      label: 'Cancel',
      handler: () => setCancelOpen(true),
      destructive: true,
    },
  ]

  return (
    <EnhancedDataTableActionsMenu items={actionItems}>
      <CancelSubscriptionModal
        isOpen={cancelOpen}
        setIsOpen={setCancelOpen}
        subscriptionId={subscription.id}
      />
    </EnhancedDataTableActionsMenu>
  )
}

export const columns: ColumnDef<Subscription.TableRowData>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <div onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) =>
            table.toggleAllPageRowsSelected(!!value)
          }
          aria-label="Select all"
        />
      </div>
    ),
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: 'customerName',
    accessorFn: (row) => row.customer.name,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Customer" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">{row.getValue('customerName')}</span>
    ),
  },
  {
    id: 'status',
    accessorFn: (row) => row.subscription.status,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => (
      <SubscriptionStatusCell status={row.getValue('status')} />
    ),
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
    cell: ({ row }) => (
      <span className="text-sm">{row.getValue('productName')}</span>
    ),
  },
  {
    id: 'createdAt',
    accessorFn: (row) => row.subscription.createdAt,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created" />
    ),
    cell: ({ row }) => (
      <div className="whitespace-nowrap">
        {core.formatDate(row.getValue('createdAt'))}
      </div>
    ),
  },
  {
    id: 'canceledAt',
    accessorFn: (row) => row.subscription.canceledAt,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Canceled" />
    ),
    cell: ({ row }) => (
      <div className="whitespace-nowrap">
        {row.getValue('canceledAt')
          ? core.formatDate(row.getValue('canceledAt'))
          : '-'}
      </div>
    ),
  },
  {
    id: 'subscriptionId',
    accessorFn: (row) => row.subscription.id,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="ID" />
    ),
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()}>
        <DataTableCopyableCell
          copyText={row.getValue('subscriptionId')}
        >
          {row.getValue('subscriptionId')}
        </DataTableCopyableCell>
      </div>
    ),
  },
  {
    id: 'actions',
    enableHiding: false,
    cell: ({ row }) => {
      const subscription = row.original.subscription
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <SubscriptionActionsMenu subscription={subscription} />
        </div>
      )
    },
    size: 40,
    maxSize: 40,
  },
]
