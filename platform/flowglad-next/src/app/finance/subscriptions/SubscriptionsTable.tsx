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
import { trpc } from '@/app/_trpc/client'

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

export interface SubscriptionsTableFilters {
  status?: SubscriptionStatus
  customerId?: string
  organizationId?: string
}

const SubscriptionsTable = ({
  filters = {},
}: {
  filters?: SubscriptionsTableFilters
}) => {
  const [pageIndex, setPageIndex] = useState(0)
  const pageSize = 10

  const { data, isLoading, isFetching } =
    trpc.subscriptions.getTableRows.useQuery({
      cursor: pageIndex.toString(),
      limit: pageSize,
      filters,
    })

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
            <div className="w-full flex justify-end">
              <div
                className="w-fit"
                onClick={(e) => e.stopPropagation()}
              >
                <SubscriptionMoreMenuCell
                  subscription={cellData.subscription}
                />
              </div>
            </div>
          ),
        },
      ] as ColumnDef<Subscription.TableRowData>[],
    []
  )

  const handlePaginationChange = (newPageIndex: number) => {
    setPageIndex(newPageIndex)
  }

  const tableData = data?.data || []
  const total = data?.total || 0
  const pageCount = Math.ceil(total / pageSize)

  return (
    <Table
      columns={columns}
      data={tableData}
      className="bg-nav"
      bordered
      pagination={{
        pageIndex,
        pageSize,
        total,
        onPageChange: handlePaginationChange,
        isLoading,
        isFetching,
      }}
    />
  )
}

export default SubscriptionsTable
