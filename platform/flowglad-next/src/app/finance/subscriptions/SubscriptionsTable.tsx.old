import { useMemo, useState } from 'react'
import { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { Subscription } from '@/db/schema/subscriptions'
import core from '@/utils/core'
import { SubscriptionStatus } from '@/types'
import { Badge } from '@/components/ui/badge'
import { sentenceCase } from 'change-case'
import TableRowPopoverMenu from '@/components/TableRowPopoverMenu'
import CancelSubscriptionModal from '@/components/forms/CancelSubscriptionModal'
import { trpc } from '@/app/_trpc/client'
import MoreMenuTableCell from '@/components/MoreMenuTableCell'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'
import { useRouter } from 'next/navigation'

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
          header: 'Customer',
          accessorKey: 'customer.name',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.customer.name}</span>
          ),
        },
        {
          header: 'Status',
          accessorKey: 'subscription.status',
          size: 110,
          minSize: 105,
          maxSize: 115,
          cell: ({ row: { original: cellData } }) => (
            <SubscriptionStatusCell
              status={cellData.subscription.status}
            />
          ),
        },
        {
          header: 'Product',
          accessorKey: 'product.name',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.product.name}</span>
          ),
        },
        {
          header: 'Created',
          accessorKey: 'subscription.createdAt',
          cell: ({ row: { original: cellData } }) => (
            <>{core.formatDate(cellData.subscription.createdAt)}</>
          ),
        },
        {
          header: 'Canceled',
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
          header: 'ID',
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
          size: 40,
          maxSize: 40,
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
    <DataTable
      columns={columns}
      data={tableData}
      className="bg-background"
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
