'use client'
import { useMemo, useState } from 'react'
import { ColumnDef } from '@tanstack/react-table'
import { useRouter } from 'next/navigation'

import Table from '@/components/ion/Table'
import ColumnHeaderCell from '@/components/ion/ColumnHeaderCell'
import { Feature } from '@/db/schema/features'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'
import { trpc } from '@/app/_trpc/client'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import StatusBadge from '@/components/StatusBadge'
import { FeatureType, FeatureUsageGrantFrequency } from '@/types'
import MoreMenuTableCell from '@/components/MoreMenuTableCell'
import { PopoverMenuItem } from '@/components/PopoverMenu'
import EditFeatureModal from '@/components/forms/EditFeatureModal'

export interface FeaturesTableFilters {
  catalogId?: string
}

interface FeatureRow {
  feature: Feature.ClientRecord
  catalog: {
    id: string
    name: string
  }
}

const MoreMenuCell = ({
  feature,
}: {
  feature: Feature.ClientRecord
}) => {
  const [isEditOpen, setIsEditOpen] = useState(false)

  const items: PopoverMenuItem[] = [
    {
      label: 'Edit feature',
      handler: () => setIsEditOpen(true),
    },
  ]

  return (
    <MoreMenuTableCell items={items}>
      <EditFeatureModal
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        feature={feature}
      />
    </MoreMenuTableCell>
  )
}

const FeaturesTable = ({
  filters = {},
}: {
  filters?: FeaturesTableFilters
}) => {
  const {
    currentCursor,
    navigationDirection,
    pageSize,
    handleNavigation,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<FeatureRow, FeaturesTableFilters>({
    initialCurrentCursor: undefined,
    pageSize: 10,
    filters,
    useQuery: trpc.features.getTableRows.useQuery,
  })

  const columns = useMemo(
    () =>
      [
        {
          header: ({ column }) => (
            <ColumnHeaderCell title="Name" column={column} />
          ),
          accessorKey: 'feature.name',
          cell: ({ row: { original: cellData } }) => (
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm">
                {cellData.feature.name}
              </span>
              <StatusBadge active={cellData.feature.active} />
            </div>
          ),
        },
        {
          header: ({ column }) => (
            <ColumnHeaderCell title="Type" column={column} />
          ),
          accessorKey: 'feature.type',
          cell: ({ row: { original: cellData } }) => {
            let typeText = 'Toggle'
            if (
              cellData.feature.type === FeatureType.UsageCreditGrant
            ) {
              if (
                cellData.feature.renewalFrequency ===
                FeatureUsageGrantFrequency.Once
              ) {
                typeText = 'One time grant'
              } else {
                typeText = 'Renews every cycle'
              }
            }
            return <span className="text-sm">{typeText}</span>
          },
        },
        {
          header: ({ column }) => (
            <ColumnHeaderCell title="Slug" column={column} />
          ),
          accessorKey: 'feature.slug',
          cell: ({ row: { original: cellData } }) => (
            <CopyableTextTableCell copyText={cellData.feature.slug}>
              {cellData.feature.slug}
            </CopyableTextTableCell>
          ),
        },
        {
          header: ({ column }) => (
            <ColumnHeaderCell title="Catalog" column={column} />
          ),
          accessorKey: 'catalog.name',
          cell: ({ row: { original: cellData } }) => {
            const catalogName = cellData.catalog?.name
            if (catalogName) {
              return <div className="w-fit">{catalogName}</div>
            }
            return <div className="w-fit">-</div>
          },
        },
        {
          header: ({ column }) => (
            <ColumnHeaderCell title="ID" column={column} />
          ),
          accessorKey: 'feature.id',
          cell: ({ row: { original: cellData } }) => (
            <CopyableTextTableCell copyText={cellData.feature.id}>
              {cellData.feature.id}
            </CopyableTextTableCell>
          ),
        },
        {
          id: 'more-menu',
          cell: ({ row: { original: cellData } }) => (
            <MoreMenuCell feature={cellData.feature} />
          ),
        },
      ] as ColumnDef<FeatureRow>[],
    []
  )

  const router = useRouter()

  const tableData = data?.items || []
  const total = data?.total || 0

  return (
    <Table
      columns={columns}
      data={tableData}
      onClickRow={(row) => {
        // router.push(`/features/${row.feature.id}`) // TODO: Add feature details page
      }}
      className="bg-nav"
      bordered
      pagination={{
        pageSize,
        total,
        isLoading,
        isFetching,
        onNavigate: handleNavigation,
        hasNextPage: data?.hasNextPage,
        hasPreviousPage: data?.hasPreviousPage,
        currentCursor,
        navigationDirection,
      }}
    />
  )
}

export default FeaturesTable
