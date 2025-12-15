'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { sentenceCase } from 'change-case'
import { X } from 'lucide-react'
import * as React from 'react'
import CancelSubscriptionModal from '@/components/forms/CancelSubscriptionModal'
import { Badge } from '@/components/ui/badge'
import { DataTableLinkableCell } from '@/components/ui/data-table-linkable-cell'
import {
  type ActionMenuItem,
  EnhancedDataTableActionsMenu,
} from '@/components/ui/enhanced-data-table-actions-menu'
import type { Subscription } from '@/db/schema/subscriptions'
import { SubscriptionStatus } from '@/types'
import { formatDate } from '@/utils/core'

const subscriptionStatusColors: Record<SubscriptionStatus, string> = {
  [SubscriptionStatus.Active]:
    'bg-jade-background text-jade-foreground',
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

  const isCanceled =
    subscription.status === SubscriptionStatus.Canceled
  const isFreePlan = subscription.isFreePlan === true
  const cannotCancel = isCanceled || isFreePlan

  // Get the appropriate helper text for why cancel is disabled
  const getCancelHelperText = (): string | undefined => {
    if (isFreePlan) {
      return 'Default free plans cannot be canceled'
    }
    if (isCanceled) {
      return 'Subscription is already canceled'
    }
    return undefined
  }

  const actionItems: ActionMenuItem[] = [
    {
      label: 'Cancel Subscription',
      icon: <X className="h-4 w-4" />,
      handler: () => setIsCancelOpen(true),
      destructive: true,
      disabled: cannotCancel,
      helperText: getCancelHelperText(),
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
    accessorFn: (row) => row.customer.name || row.customer.email,
    header: 'Customer',
    cell: ({ row }) => {
      const customer = row.original.customer
      const displayName =
        customer.name.length === 0 ? customer.email : customer.name
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
    header: 'Status',
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
    header: 'Product',
    cell: ({ row }) => {
      const product = row.original.product
      return (
        <div>
          <DataTableLinkableCell href={`/products/${product.id}`}>
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
    header: 'Created',
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
