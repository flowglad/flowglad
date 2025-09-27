'use client'

import * as React from 'react'
import { ColumnDef } from '@tanstack/react-table'
// UI components
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import {
  EnhancedDataTableActionsMenu,
  ActionMenuItem,
} from '@/components/ui/enhanced-data-table-actions-menu'
// Other imports
import { UsageMeter } from '@/db/schema/usageMeters'
import { core } from '@/utils/core'
import { Pencil, Copy } from 'lucide-react'
import EditUsageMeterModal from '@/components/components/EditUsageMeterModal'

export type UsageMeterTableRowData = {
  pricingModel: { id: string; name: string }
  usageMeter: UsageMeter.ClientRecord
}

function UsageMeterActionsMenu({
  usageMeter,
}: {
  usageMeter: UsageMeter.ClientRecord
}) {
  const [isEditOpen, setIsEditOpen] = React.useState(false)

  const actionItems: ActionMenuItem[] = [
    {
      label: 'Edit Usage Meter',
      icon: <Pencil className="h-4 w-4" />,
      handler: () => setIsEditOpen(true),
    },
    {
      label: 'Copy Usage Meter ID',
      icon: <Copy className="h-4 w-4" />,
      handler: () => navigator.clipboard.writeText(usageMeter.id),
    },
    // TODO: Add delete functionality when backend endpoint is implemented
  ]

  return (
    <EnhancedDataTableActionsMenu items={actionItems}>
      <EditUsageMeterModal
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        usageMeter={usageMeter}
      />
    </EnhancedDataTableActionsMenu>
  )
}

export const columns: ColumnDef<UsageMeterTableRowData>[] = [
  {
    id: 'name',
    accessorFn: (row) => row.usageMeter.name,
    header: 'Name',
    cell: ({ row }) => (
      <div
        className="font-medium truncate"
        title={row.getValue('name')}
      >
        {row.getValue('name')}
      </div>
    ),
    size: 200,
    minSize: 120,
    maxSize: 300,
  },
  {
    id: 'pricingModelName',
    accessorFn: (row) => row.pricingModel.name,
    header: 'Pricing Model',
    cell: ({ row }) => (
      <div
        className="truncate"
        title={row.getValue('pricingModelName')}
      >
        {row.getValue('pricingModelName')}
      </div>
    ),
    size: 180,
    minSize: 120,
    maxSize: 250,
  },
  {
    id: 'aggregationType',
    accessorFn: (row) => row.usageMeter.aggregationType,
    header: 'Aggregation Type',
    cell: ({ row }) => {
      const aggregationType = row.getValue(
        'aggregationType'
      ) as string
      return (
        <div className="whitespace-nowrap">
          {aggregationType === 'sum'
            ? 'Sum'
            : 'Count Distinct Properties'}
        </div>
      )
    },
    size: 140,
    minSize: 120,
    maxSize: 180,
  },
  {
    id: 'createdAt',
    accessorFn: (row) => row.usageMeter.createdAt,
    header: 'Created',
    cell: ({ row }) => {
      const date = row.getValue('createdAt') as Date
      return (
        <div className="whitespace-nowrap">
          {core.formatDate(date)}
        </div>
      )
    },
    size: 100,
    minSize: 100,
    maxSize: 150,
  },
  {
    id: 'id',
    accessorFn: (row) => row.usageMeter.id,
    header: 'ID',
    cell: ({ row }) => {
      const id = row.getValue('id') as string
      return (
        <DataTableCopyableCell copyText={id}>
          {id}
        </DataTableCopyableCell>
      )
    },
    size: 120,
    minSize: 80,
    maxSize: 180,
  },
  {
    id: 'actions',
    enableHiding: false,
    cell: ({ row }) => {
      const usageMeter = row.original.usageMeter
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <UsageMeterActionsMenu usageMeter={usageMeter} />
        </div>
      )
    },
    size: 50,
    maxSize: 50,
  },
]
