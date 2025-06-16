import { useMemo, useState } from 'react'
import { ColumnDef } from '@tanstack/react-table'
import Table from '@/components/ion/Table'
import ColumnHeaderCell from '@/components/ion/ColumnHeaderCell'
import { Subscription } from '@/db/schema/subscriptions'
import core from '@/utils/core'
import { SubscriptionStatus } from '@/types'
import Badge, { BadgeColor } from '@/components/ion/Badge'
import { sentenceCase } from 'change-case'
import TableRowPopoverMenu from '@/components/TableRowPopoverMenu'
import CancelSubscriptionModal from '@/components/forms/CancelSubscriptionModal'
import { trpc } from '@/app/_trpc/client'
import MoreMenuTableCell from '@/components/MoreMenuTableCell'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'
import { useRouter } from 'next/navigation'

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
  [SubscriptionStatus.CreditTrial]: 'yellow',
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
    {
      label: 'Cancel',
      handler: () => setCancelOpen(true),
    },
  ]
  return (
    <MoreMenuTableCell items={items}>
      <CancelSubscriptionModal
        isOpen={cancelOpen}
        setIsOpen={setCancelOpen}
        subscriptionId={subscription.id}
      />
    </MoreMenuTableCell>
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
  const {
    pageIndex,
    pageSize,
    handlePaginationChange,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<
    Subscription.TableRowData,
    SubscriptionsTableFilters
  >({
    initialCurrentCursor: undefined,
    pageSize: 10,
    filters,
    useQuery: trpc.subscriptions.getTableRows.useQuery,
  })

  const columns = useMemo(
    () =>
      [
        {
          header: ({ column }) => (
            <ColumnHeaderCell title="Customer" column={column} />
          ),
          accessorKey: 'customer.name',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.customer.name}</span>
          ),
        },
        {
          header: ({ column }) => (
            <ColumnHeaderCell title="Status" column={column} />
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
            <ColumnHeaderCell title="Product" column={column} />
          ),
          accessorKey: 'product.name',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.product.name}</span>
          ),
        },
        {
          header: ({ column }) => (
            <ColumnHeaderCell title="Created" column={column} />
          ),
          accessorKey: 'subscription.createdAt',
          cell: ({ row: { original: cellData } }) => (
            <>{core.formatDate(cellData.subscription.createdAt)}</>
          ),
        },
        {
          header: ({ column }) => (
            <ColumnHeaderCell title="Canceled" column={column} />
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
          header: ({ column }) => (
            <ColumnHeaderCell title="ID" column={column} />
          ),
          accessorKey: 'subscription.id',
          cell: ({ row: { original: cellData } }) => (
            <CopyableTextTableCell
              copyText={cellData.subscription.id}
            >
              {cellData.subscription.id}
            </CopyableTextTableCell>
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

  const tableData = data?.items || []
  const total = data?.total || 0
  const router = useRouter()

  return (
    <Table
      columns={columns}
      data={tableData}
      className="bg-nav"
      bordered
      onClickRow={(row) => {
        router.push(`/finance/subscriptions/${row.subscription.id}`)
      }}
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
