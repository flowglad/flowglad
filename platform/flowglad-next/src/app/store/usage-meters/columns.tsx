'use client'

import * as React from 'react'
import { ColumnDef } from '@tanstack/react-table'
import { Pencil } from 'lucide-react'
import { UsageMeter } from '@/db/schema/usageMeters'
import { formatDate } from '@/utils/core'
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import { DataTableLinkableCell } from '@/components/ui/data-table-linkable-cell'
import {
  EnhancedDataTableActionsMenu,
  ActionMenuItem,
} from '@/components/ui/enhanced-data-table-actions-menu'
import EditUsageMeterModal from '@/components/components/EditUsageMeterModal'

type UsageMeterTableRowData = {
  usageMeter: UsageMeter.ClientRecord
  pricingModel: {
    id: string
    name: string
  }
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
    size: 250,
    minSize: 150,
    maxSize: 400,
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
    id: 'pricingModel',
    accessorFn: (row) => row.pricingModel.name,
    header: 'Pricing Model',
    size: 200,
    minSize: 150,
    maxSize: 300,
    cell: ({ row }) => {
      const name = row.getValue('pricingModel') as string
      const pricingModelId = row.original.pricingModel.id
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <DataTableLinkableCell
            href={`/store/pricing-models/${pricingModelId}`}
          >
            {name}
          </DataTableLinkableCell>
        </div>
      )
    },
  },
  {
    id: 'aggregationType',
    accessorFn: (row) => row.usageMeter.aggregationType,
    header: 'Aggregation Type',
    size: 180,
    minSize: 150,
    maxSize: 220,
    cell: ({ row }) => {
      const type = row.getValue('aggregationType') as string
      const displayText =
        type === 'sum' ? 'Sum' : 'Count Distinct Properties'
      return <div>{displayText}</div>
    },
  },
  {
    id: 'createdAt',
    accessorFn: (row) => row.usageMeter.createdAt,
    header: 'Created',
    size: 140,
    minSize: 120,
    maxSize: 160,
    cell: ({ row }) => {
      const date = row.getValue('createdAt') as Date
      return (
        <div className="whitespace-nowrap">{formatDate(date)}</div>
      )
    },
  },
  {
    id: 'id',
    accessorFn: (row) => row.usageMeter.id,
    header: 'ID',
    size: 200,
    minSize: 150,
    maxSize: 300,
    cell: ({ row }) => {
      const id = row.getValue('id') as string
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <DataTableCopyableCell copyText={id}>
            {id}
          </DataTableCopyableCell>
        </div>
      )
    },
  },
  {
    id: 'actions',
    enableHiding: false,
    enableResizing: false,
    cell: ({ row }) => {
      const usageMeter = row.original.usageMeter
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <UsageMeterActionsMenu usageMeter={usageMeter} />
        </div>
      )
    },
    size: 1,
    minSize: 56,
    maxSize: 56,
  },
]
