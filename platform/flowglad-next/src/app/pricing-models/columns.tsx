'use client'

import type { ColumnDef } from '@tanstack/react-table'
// Icons come next
import { Copy, Pencil, Star } from 'lucide-react'
import * as React from 'react'
import ClonePricingModelModal from '@/components/forms/ClonePricingModelModal'
import EditPricingModelModal from '@/components/forms/EditPricingModelModal'
import SetPricingModelAsDefaultModal from '@/components/forms/SetPricingModelAsDefaultModal'
// UI components last
import { Badge } from '@/components/ui/badge'
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import {
  type ActionMenuItem,
  EnhancedDataTableActionsMenu,
} from '@/components/ui/enhanced-data-table-actions-menu'
// Other imports
import type { PricingModel } from '@/db/schema/pricingModels'

function PricingModelActionsMenu({
  pricingModel,
}: {
  pricingModel: PricingModel.ClientRecord
}) {
  const [isEditOpen, setIsEditOpen] = React.useState(false)
  const [isCloneOpen, setIsCloneOpen] = React.useState(false)
  const [isSetDefaultOpen, setIsSetDefaultOpen] =
    React.useState(false)

  const actionItems: ActionMenuItem[] = [
    {
      label: 'Edit',
      icon: <Pencil className="h-4 w-4" />,
      handler: () => setIsEditOpen(true),
    },
    {
      label: 'Duplicate',
      icon: <Copy className="h-4 w-4" />,
      handler: () => setIsCloneOpen(true),
    },
  ]

  if (!pricingModel.isDefault) {
    actionItems.push({
      label: 'Set Default',
      icon: <Star className="h-4 w-4" />,
      handler: () => setIsSetDefaultOpen(true),
    })
  }

  return (
    <EnhancedDataTableActionsMenu items={actionItems}>
      <EditPricingModelModal
        pricingModel={pricingModel}
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
      />
      <ClonePricingModelModal
        isOpen={isCloneOpen}
        setIsOpen={setIsCloneOpen}
        pricingModel={pricingModel}
      />
      <SetPricingModelAsDefaultModal
        isOpen={isSetDefaultOpen}
        setIsOpen={setIsSetDefaultOpen}
        pricingModel={pricingModel}
      />
    </EnhancedDataTableActionsMenu>
  )
}

export const columns: ColumnDef<PricingModel.TableRow>[] = [
  {
    id: 'name',
    accessorFn: (row) => row.pricingModel.name,
    header: 'Name',
    cell: ({ row }) => {
      const pricingModel = row.original.pricingModel
      return (
        <div className="flex items-center gap-2">
          <div
            className="min-w-0 truncate"
            title={row.getValue('name')}
          >
            {row.getValue('name')}
          </div>
          {pricingModel.isDefault && (
            <Badge
              variant="secondary"
              className="bg-jade-background text-jade-foreground text-xs flex-shrink-0"
            >
              Default
            </Badge>
          )}
        </div>
      )
    },
    size: 250,
    minSize: 150,
  },
  {
    id: 'productsCount',
    accessorFn: (row) => row.productsCount,
    header: 'Products',
    cell: ({ row }) => (
      <div className="whitespace-nowrap">
        {row.getValue('productsCount')}
      </div>
    ),
    size: 80,
    minSize: 70,
    maxSize: 90,
  },
  {
    id: 'id',
    accessorFn: (row) => row.pricingModel.id,
    header: 'ID',
    cell: ({ row }) => {
      const id = row.getValue('id') as string
      return (
        <div>
          <DataTableCopyableCell copyText={id}>
            {id}
          </DataTableCopyableCell>
        </div>
      )
    },
    size: 120,
    minSize: 80,
  },
  {
    id: 'actions',
    enableHiding: false,
    enableResizing: false,
    cell: ({ row }) => {
      const pricingModel = row.original.pricingModel
      return (
        <div
          className="w-8 flex justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <PricingModelActionsMenu pricingModel={pricingModel} />
        </div>
      )
    },
    size: 1,
    minSize: 56,
    maxSize: 56,
  },
]
