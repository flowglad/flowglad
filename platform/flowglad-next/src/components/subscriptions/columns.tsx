'use client'

import { SubscriptionStatus } from '@db-core/enums'
import type { Subscription } from '@db-core/schema/subscriptions'
import type { ColumnDef } from '@tanstack/react-table'
import { X } from 'lucide-react'
import * as React from 'react'
import CancelSubscriptionModal from '@/components/forms/CancelSubscriptionModal'
import { DataTableLinkableCell } from '@/components/ui/data-table-linkable-cell'
import {
  type ActionMenuItem,
  EnhancedDataTableActionsMenu,
} from '@/components/ui/enhanced-data-table-actions-menu'
import { SubscriptionStatusTag } from '@/components/ui/status-tag'
import { formatDate } from '@/utils/core'

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
    id: 'createdAt',
    accessorFn: (row) => row.subscription.createdAt,
    header: 'Date',
    cell: ({ row }) => {
      const date = row.getValue('createdAt') as Date
      return (
        <div className="whitespace-nowrap">
          {formatDate(date, false)}
        </div>
      )
    },
    size: 120,
    minSize: 120,
    maxSize: 165,
  },
  {
    id: 'productName',
    accessorFn: (row) => row.product?.name ?? '-',
    header: 'Product',
    cell: ({ row }) => {
      const product = row.original.product
      if (!product) {
        return <div className="text-muted-foreground">-</div>
      }
      return (
        <div>
          <DataTableLinkableCell href={`/products/${product.id}`}>
            {product.name}
          </DataTableLinkableCell>
        </div>
      )
    },
    size: 160,
    minSize: 96,
    maxSize: 240,
  },
  {
    id: 'status',
    accessorFn: (row) => row.subscription.status,
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue('status') as SubscriptionStatus
      return (
        <SubscriptionStatusTag
          status={status}
          showTooltip
          tooltipVariant="muted"
        />
      )
    },
    size: 110,
    minSize: 105,
    maxSize: 115,
  },
  {
    id: 'customerName',
    accessorFn: (row) => row.customer.name || row.customer.email,
    header: 'Customer',
    cell: ({ row }) => {
      const customer = row.original.customer
      const displayName = customer.name || customer.email
      return (
        <div>
          <DataTableLinkableCell href={`/customers/${customer.id}`}>
            {displayName}
          </DataTableLinkableCell>
        </div>
      )
    },
    size: 160,
    minSize: 160,
    maxSize: 248,
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
