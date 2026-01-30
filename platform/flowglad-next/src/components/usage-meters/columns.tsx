'use client'

import type { UsageMeter } from '@db-core/schema/usageMeters'
import type { ColumnDef } from '@tanstack/react-table'
import { Pencil } from 'lucide-react'
import * as React from 'react'
import EditUsageMeterModal from '@/components/components/EditUsageMeterModal'
import {
  type ActionMenuItem,
  EnhancedDataTableActionsMenu,
} from '@/components/ui/enhanced-data-table-actions-menu'

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
      label: 'Edit',
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
    header: 'Usage Meter',
    size: 200,
    minSize: 200,
    maxSize: 275,
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
    id: 'actions',
    enableHiding: false,
    enableResizing: false,
    cell: ({ row }) => {
      const usageMeter = row.original.usageMeter
      return (
        <div
          className="w-8 flex justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <UsageMeterActionsMenu usageMeter={usageMeter} />
        </div>
      )
    },
    size: 1,
    minSize: 56,
    maxSize: 56,
  },
]
