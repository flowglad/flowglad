'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { Pencil } from 'lucide-react'
import * as React from 'react'
import EditFeatureModal from '@/components/forms/EditFeatureModal'
import StatusBadge from '@/components/StatusBadge'
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import {
  type ActionMenuItem,
  EnhancedDataTableActionsMenu,
} from '@/components/ui/enhanced-data-table-actions-menu'
import type { Feature } from '@/db/schema/features'
import { FeatureType, FeatureUsageGrantFrequency } from '@/types'

export interface FeatureRow {
  feature: Feature.ClientRecord
  pricingModel: {
    id: string
    name: string
  }
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
    header: 'Feature',
    cell: ({ row }) => (
      <div className="truncate" title={row.getValue('name')}>
        {row.getValue('name')}
      </div>
    ),
    size: 200,
    minSize: 140,
    maxSize: 300,
  },
  {
    id: 'type',
    accessorFn: (row) => row.feature.type,
    header: 'Type',
    cell: ({ row }) => {
      const feature = row.original.feature
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
      return <div className="text-sm truncate">{typeText}</div>
    },
    size: 150,
    minSize: 120,
    maxSize: 180,
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
    size: 150,
    minSize: 120,
    maxSize: 200,
  },
  {
    id: 'id',
    accessorFn: (row) => row.feature.id,
    header: 'ID',
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()}>
        <DataTableCopyableCell copyText={row.getValue('id')}>
          {row.getValue('id')}
        </DataTableCopyableCell>
      </div>
    ),
    size: 125,
    minSize: 80,
    maxSize: 250,
  },
  {
    id: 'actions',
    enableHiding: false,
    enableResizing: false,
    cell: ({ row }) => {
      const feature = row.original.feature
      return (
        <div
          className="w-8 flex justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <FeatureActionsMenu feature={feature} />
        </div>
      )
    },
    size: 1,
    minSize: 56,
    maxSize: 56,
  },
]
