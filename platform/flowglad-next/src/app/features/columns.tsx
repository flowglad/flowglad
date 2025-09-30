'use client'

import * as React from 'react'
import { ColumnDef } from '@tanstack/react-table'
import { Pencil } from 'lucide-react'
import { useState } from 'react'

import { Feature } from '@/db/schema/features'
import { FeatureType, FeatureUsageGrantFrequency } from '@/types'
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import StatusBadge from '@/components/StatusBadge'
import {
  EnhancedDataTableActionsMenu,
  ActionMenuItem,
} from '@/components/ui/enhanced-data-table-actions-menu'
import EditFeatureModal from '@/components/forms/EditFeatureModal'

interface FeatureRow {
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
  const [isEditOpen, setIsEditOpen] = useState(false)

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
      <div className="truncate" title={row.getValue('name')}>
        {row.getValue('name')}
      </div>
    ),
    minSize: 140,
  },
  {
    id: 'status',
    accessorFn: (row) => row.feature.active,
    header: 'Status',
    size: 110,
    minSize: 105,
    maxSize: 115,
    cell: ({ row }) => (
      <StatusBadge active={row.getValue('status')} />
    ),
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
      return <div className="text-sm">{typeText}</div>
    },
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
  },
  {
    id: 'catalog',
    accessorFn: (row) => row.pricingModel?.name || '',
    header: 'Catalog',
    cell: ({ row }) => {
      const catalogName = row.getValue('catalog') as string
      return <div className="w-fit">{catalogName || '-'}</div>
    },
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
  },
  {
    id: 'actions',
    enableHiding: false,
    size: 40,
    maxSize: 40,
    cell: ({ row }) => {
      const feature = row.original.feature
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <FeatureActionsMenu feature={feature} />
        </div>
      )
    },
  },
]
