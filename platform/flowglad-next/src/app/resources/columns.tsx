'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { Pencil } from 'lucide-react'
import * as React from 'react'
import {
  type ActionMenuItem,
  EnhancedDataTableActionsMenu,
} from '@/components/ui/enhanced-data-table-actions-menu'
import {
  ActiveStatusTag,
  booleanToActiveStatus,
} from '@/components/ui/status-tag'
import type { Resource } from '@/db/schema/resources'

export type ResourceTableRowData = {
  resource: Resource.ClientRecord
  pricingModel: {
    id: string
    name: string
  }
}

interface ResourceActionsMenuProps {
  resource: Resource.ClientRecord
  onEdit?: (resource: Resource.ClientRecord) => void
}

function ResourceActionsMenu({
  resource,
  onEdit,
}: ResourceActionsMenuProps) {
  const actionItems: ActionMenuItem[] = [
    {
      label: 'Edit',
      icon: <Pencil className="h-4 w-4" />,
      handler: () => onEdit?.(resource),
    },
  ]

  return <EnhancedDataTableActionsMenu items={actionItems} />
}

export const createColumns = (
  onEdit?: (resource: Resource.ClientRecord) => void
): ColumnDef<ResourceTableRowData>[] => [
  {
    id: 'name',
    accessorFn: (row) => row.resource.name,
    header: 'Name',
    size: 200,
    minSize: 150,
    maxSize: 300,
    cell: ({ row }) => {
      const name = row.getValue('name') as string
      return (
        <div className="truncate" title={name}>
          {name}
        </div>
      )
    },
  },
  {
    id: 'slug',
    accessorFn: (row) => row.resource.slug,
    header: 'Slug',
    size: 180,
    minSize: 150,
    maxSize: 250,
    cell: ({ row }) => {
      const slug = row.getValue('slug') as string
      return (
        <div className="truncate font-mono text-sm" title={slug}>
          {slug}
        </div>
      )
    },
  },
  {
    id: 'active',
    accessorFn: (row) => row.resource.active,
    header: 'Status',
    size: 120,
    minSize: 100,
    maxSize: 150,
    cell: ({ row }) => {
      const active = row.getValue('active') as boolean
      return (
        <ActiveStatusTag status={booleanToActiveStatus(active)} />
      )
    },
  },
  {
    id: 'actions',
    enableHiding: false,
    enableResizing: false,
    cell: ({ row }) => {
      const resource = row.original.resource
      return (
        <div
          className="w-8 flex flex-shrink-0 justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <ResourceActionsMenu resource={resource} onEdit={onEdit} />
        </div>
      )
    },
    size: 1,
    minSize: 56,
    maxSize: 56,
  },
]

export const columns = createColumns()
