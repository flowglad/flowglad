'use client'

import * as React from 'react'
import { ColumnDef } from '@tanstack/react-table'
// Icons come next
import { Pencil } from 'lucide-react'
// UI components last
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import {
  EnhancedDataTableActionsMenu,
  ActionMenuItem,
} from '@/components/ui/enhanced-data-table-actions-menu'
// Other imports
import { Feature } from '@/db/schema/features'
import StatusBadge from '@/components/StatusBadge'
import EditFeatureModal from '@/components/forms/EditFeatureModal'
import { FeatureType, FeatureUsageGrantFrequency } from '@/types'

export interface FeatureRow {
  feature: Feature.ClientRecord
  pricingModel: {
    id: string
    name: string
  }
}

const FeatureTypeCell = ({
  feature,
}: {
  feature: Feature.ClientRecord
}) => {
  let typeText = 'Toggle'
  if (feature.type === FeatureType.UsageCreditGrant) {
    if (
      feature.renewalFrequency === FeatureUsageGrantFrequency.Once
    ) {
      typeText = 'One time grant'
    } else {
      typeText = 'Renews every cycle'
    }
  }
  return <div className="text-sm">{typeText}</div>
}

function FeatureActionsMenu({
  feature,
}: {
  feature: Feature.ClientRecord
}) {
  const [isEditOpen, setIsEditOpen] = React.useState(false)

  const actionItems: ActionMenuItem[] = [
    {
      label: 'Edit feature',
      icon: <Pencil className="h-4 w-4" />,
      handler: () => setIsEditOpen(true),
    },
  ]

  return (
    <EnhancedDataTableActionsMenu items={actionItems}>
      <EditFeatureModal
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        feature={feature}
      />
    </EnhancedDataTableActionsMenu>
  )
}

export const columns: ColumnDef<FeatureRow>[] = [
  {
    id: 'name',
    accessorFn: (row) => row.feature.name,
    header: 'Name',
    cell: ({ row }) => (
      <div className="font-medium">{row.getValue('name')}</div>
    ),
    size: 200,
    minSize: 150,
    maxSize: 300,
  },
  {
    id: 'status',
    accessorFn: (row) => row.feature.active,
    header: 'Status',
    cell: ({ row }) => (
      <StatusBadge active={row.getValue('status')} />
    ),
    size: 110,
    minSize: 105,
    maxSize: 115,
  },
  {
    id: 'type',
    accessorFn: (row) => row.feature.type,
    header: 'Type',
    cell: ({ row }) => (
      <FeatureTypeCell feature={row.original.feature} />
    ),
    size: 150,
    minSize: 120,
    maxSize: 180,
  },
  {
    id: 'slug',
    accessorFn: (row) => row.feature.slug,
    header: 'Slug',
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()}>
        <DataTableCopyableCell copyText={row.getValue('slug')}>
          {row.getValue('slug')}
        </DataTableCopyableCell>
      </div>
    ),
    size: 180,
    minSize: 120,
    maxSize: 250,
  },
  {
    id: 'catalog',
    accessorFn: (row) => row.pricingModel?.name,
    header: 'Catalog',
    cell: ({ row }) => {
      const pricingModelName = row.getValue('catalog') as
        | string
        | undefined
      return <div className="truncate">{pricingModelName || '-'}</div>
    },
    size: 150,
    minSize: 100,
    maxSize: 200,
  },
  {
    id: 'featureId',
    accessorFn: (row) => row.feature.id,
    header: 'ID',
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()}>
        <DataTableCopyableCell copyText={row.getValue('featureId')}>
          {row.getValue('featureId')}
        </DataTableCopyableCell>
      </div>
    ),
    size: 180,
    minSize: 125,
    maxSize: 250,
  },
  {
    id: 'actions',
    enableHiding: false,
    cell: ({ row }) => {
      const feature = row.original.feature
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <FeatureActionsMenu feature={feature} />
        </div>
      )
    },
    size: 40,
    maxSize: 40,
  },
]
