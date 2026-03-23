'use client'

import { SubscriptionStatus } from '@db-core/enums'
import type { Subscription } from '@db-core/schema/subscriptions'
import type { ColumnDef } from '@tanstack/react-table'
import { useRouter } from 'next/navigation'
import { SubscriptionActionsMenu } from '@/components/subscriptions/SubscriptionActionsMenu'
import { DataTableLinkableCell } from '@/components/ui/data-table-linkable-cell'
import { SubscriptionStatusTag } from '@/components/ui/status-tag'
import { formatDate } from '@/utils/core'

const FinanceSubscriptionActionsCell = ({
  priceType,
  subscription,
}: {
  priceType: Subscription.TableRowData['price']['type']
  subscription: Subscription.ClientRecord
}) => {
  const router = useRouter()

  return (
    <SubscriptionActionsMenu
      onAdjust={() =>
        router.push(`/finance/subscriptions/${subscription.id}`)
      }
      priceType={priceType}
      subscription={subscription}
    />
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
      const price = row.original.price
      return (
        <div
          className="w-8 flex justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <FinanceSubscriptionActionsCell
            priceType={price.type}
            subscription={subscription}
          />
        </div>
      )
    },
    size: 1,
    minSize: 56,
    maxSize: 56,
  },
]
