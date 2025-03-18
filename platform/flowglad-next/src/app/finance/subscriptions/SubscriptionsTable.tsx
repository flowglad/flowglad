import { useMemo, useState } from 'react'
import { ColumnDef } from '@tanstack/react-table'
import Table from '@/components/ion/Table'
import SortableColumnHeaderCell from '@/components/ion/SortableColumnHeaderCell'
import { Subscription } from '@/db/schema/subscriptions'
import core from '@/utils/core'
import { SubscriptionStatus } from '@/types'
import Badge, { BadgeColor } from '@/components/ion/Badge'
import { sentenceCase } from 'change-case'
import TableRowPopoverMenu from '@/components/TableRowPopoverMenu'
import CancelSubscriptionModal from '@/components/forms/CancelSubscriptionModal'

const subscriptionStatusColors: Record<
  SubscriptionStatus,
  BadgeColor
> = {
  [SubscriptionStatus.Active]: 'green',
  [SubscriptionStatus.Canceled]: 'red',
  [SubscriptionStatus.CancellationScheduled]: 'red',
  [SubscriptionStatus.Incomplete]: 'yellow',
  [SubscriptionStatus.IncompleteExpired]: 'red',
  [SubscriptionStatus.PastDue]: 'red',
  [SubscriptionStatus.Paused]: 'yellow',
  [SubscriptionStatus.Trialing]: 'yellow',
  [SubscriptionStatus.Unpaid]: 'yellow',
}

const SubscriptionStatusCell = ({
  status,
}: {
  status: SubscriptionStatus
}) => {
  return (
    <Badge color={subscriptionStatusColors[status]}>
      {sentenceCase(status)}
    </Badge>
  )
}

const SubscriptionMoreMenuCell = ({
  subscription,
}: {
  subscription: Subscription.TableRowData['subscription']
}) => {
  const [cancelOpen, setCancelOpen] = useState(false)
  const items = [
    // {
    //   label: 'Edit',
    //   handler: () => {},
    // },
    {
      label: 'Cancel',
      handler: () => setCancelOpen(true),
    },
  ]
  return (
    <>
      <CancelSubscriptionModal
        isOpen={cancelOpen}
        setIsOpen={setCancelOpen}
        subscriptionId={subscription.id}
      />
      <TableRowPopoverMenu items={items} />
    </>
  )
}
const SubscriptionsTable = ({
  data,
}: {
  data: Subscription.TableRowData[]
}) => {
  const columns = useMemo(
    () =>
      [
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Customer"
              column={column}
            />
          ),
          accessorKey: 'customer.name',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.customer.name}</span>
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Status"
              column={column}
            />
          ),
          accessorKey: 'subscription.status',
          cell: ({ row: { original: cellData } }) => (
            <SubscriptionStatusCell
              status={cellData.subscription.status}
            />
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Product"
              column={column}
            />
          ),
          accessorKey: 'product.name',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.product.name}</span>
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Created"
              column={column}
            />
          ),
          accessorKey: 'subscription.createdAt',
          cell: ({ row: { original: cellData } }) => (
            <>{core.formatDate(cellData.subscription.createdAt)}</>
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Canceled"
              column={column}
            />
          ),
          accessorKey: 'subscription.canceledAt',
          cell: ({ row: { original: cellData } }) => (
            <>
              {cellData.subscription.canceledAt
                ? core.formatDate(cellData.subscription.canceledAt)
                : '-'}
            </>
          ),
        },
        {
          id: '_',
          cell: ({ row: { original: cellData } }) => (
            <SubscriptionMoreMenuCell
              subscription={cellData.subscription}
            />
          ),
        },
      ] as ColumnDef<Subscription.TableRowData>[],
    []
  )

  return (
    <Table
      columns={columns}
      data={data}
      className="bg-nav"
      bordered
    />
  )
}

export default SubscriptionsTable
