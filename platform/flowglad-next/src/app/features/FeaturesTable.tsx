'use client'
import { useMemo, useState } from 'react'
import { Pencil } from 'lucide-react'
import { ColumnDef } from '@tanstack/react-table'
// import { useRouter } from 'next/navigation'

import { DataTable } from '@/components/ui/data-table'
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
  pricingModelId?: string
}

interface FeatureRow {
  feature: Feature.ClientRecord
  pricingModel: {
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
      icon: <Pencil />,
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
    pageIndex,
    pageSize,
    handlePaginationChange,
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
          header: 'Name',
          accessorKey: 'feature.name',
          cell: ({ row: { original: cellData } }) => (
            <span className="font-normal text-sm">
              {cellData.feature.name}
            </span>
          ),
        },
        {
          id: 'status',
          header: 'Status',
          accessorKey: 'feature.active',
          size: 110,
          minSize: 105,
          maxSize: 115,
          cell: ({ row: { original: cellData } }) => (
            <StatusBadge active={cellData.feature.active} />
          ),
        },
        {
          header: 'Type',
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
          header: 'Slug',
          accessorKey: 'feature.slug',
          cell: ({ row: { original: cellData } }) => (
            <CopyableTextTableCell copyText={cellData.feature.slug}>
              {cellData.feature.slug}
            </CopyableTextTableCell>
          ),
        },
        {
          header: 'Catalog',
          accessorKey: 'pricingModel.name',
          cell: ({ row: { original: cellData } }) => {
            const pricingModelName = cellData.pricingModel?.name
            if (pricingModelName) {
              return <div className="w-fit">{pricingModelName}</div>
            }
            return <div className="w-fit">-</div>
          },
        },
        {
          header: 'ID',
          accessorKey: 'feature.id',
          cell: ({ row: { original: cellData } }) => (
            <CopyableTextTableCell copyText={cellData.feature.id}>
              {cellData.feature.id}
            </CopyableTextTableCell>
          ),
        },
        {
          id: 'more-menu',
          size: 40,
          maxSize: 40,
          cell: ({ row: { original: cellData } }) => (
            <MoreMenuCell feature={cellData.feature} />
          ),
        },
      ] as ColumnDef<FeatureRow>[],
    []
  )

  // const router = useRouter()

  const tableData = data?.items || []
  const total = data?.total || 0

  return (
    <DataTable
      columns={columns}
      data={tableData}
      onClickRow={() => {
        // router.push(`/features/${row.feature.id}`) // TODO: Add feature details page
      }}
      className="bg-background"
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

export default FeaturesTable
