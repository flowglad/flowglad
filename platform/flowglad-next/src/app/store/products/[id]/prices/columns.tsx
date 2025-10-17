'use client'

import * as React from 'react'
import { ColumnDef } from '@tanstack/react-table'
// Icons come next
import {
  ChartColumnIncreasing,
  Pencil,
  Copy,
  Archive,
  ArchiveRestore,
  Star,
  Trash2,
  RotateCw,
} from 'lucide-react'
// UI components last
import { Checkbox } from '@/components/ui/checkbox'
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import {
  EnhancedDataTableActionsMenu,
  ActionMenuItem,
} from '@/components/ui/enhanced-data-table-actions-menu'
// Other imports
import { Price } from '@/db/schema/prices'
import { Product } from '@/db/schema/products'
import { PriceType } from '@/types'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
import core from '@/utils/core'
import StatusBadge from '@/components/StatusBadge'
import PricingCellView from '@/components/PricingCellView'
import EditPriceModal from '@/components/forms/EditPriceModal'
import ArchivePriceModal from '@/components/forms/ArchivePriceModal'
import SetPriceAsDefaultModal from '@/components/forms/SetPriceAsDefaultModal'

export type PriceTableRowData = {
  price: Price.ClientRecord
  product: Pick<Product.ClientRecord, 'id' | 'name'>
}

const PriceTypeCellView = ({ type }: { type: PriceType }) => {
  switch (type) {
    case PriceType.Subscription:
      return (
        <div className="flex items-center gap-3">
          <RotateCw size={16} strokeWidth={2} />
          <div className="w-fit flex flex-col justify-center text-sm font-normal text-foreground">
            Subscription
          </div>
        </div>
      )
    case PriceType.SinglePayment:
      return (
        <div className="flex items-center gap-3">
          <div className="w-fit flex flex-col justify-center text-sm font-normal text-foreground">
            Single Payment
          </div>
        </div>
      )
    case PriceType.Usage:
      return (
        <div className="flex items-center gap-3">
          <ChartColumnIncreasing size={16} strokeWidth={2} />
          <div className="w-fit flex flex-col justify-center text-sm font-normal text-foreground">
            Usage
          </div>
        </div>
      )
    default:
      return null
  }
}

function PriceActionsMenu({
  price,
  otherPrices,
}: {
  price: Price.ClientRecord
  otherPrices: Price.ClientRecord[]
}) {
  const [isEditOpen, setIsEditOpen] = React.useState(false)
  const [isArchiveOpen, setIsArchiveOpen] = React.useState(false)
  const [isSetDefaultOpen, setIsSetDefaultOpen] =
    React.useState(false)

  const copyTextHandler = useCopyTextHandler({
    text: `${core.NEXT_PUBLIC_APP_URL}/price/${price.id}/purchase`,
  })

  const items: ActionMenuItem[] = [
    {
      label: 'Edit price',
      icon: <Pencil className="h-4 w-4" />,
      handler: () => setIsEditOpen(true),
    },
    {
      label: 'Copy purchase link',
      icon: <Copy className="h-4 w-4" />,
      handler: copyTextHandler,
    },
  ]

  // Case 1: Price is archived - show unarchive option
  if (!price.active) {
    items.push({
      label: 'Unarchive price',
      icon: <ArchiveRestore className="h-4 w-4" />,
      handler: () => setIsArchiveOpen(true),
    })
  }

  // Case 2: Price is not default AND it's active - show make default option
  if (!price.isDefault && otherPrices.some((p) => p.isDefault)) {
    items.push({
      label: 'Make default',
      icon: <Star className="h-4 w-4" />,
      handler: () => setIsSetDefaultOpen(true),
    })
  }

  const canDelist = !price.isDefault && otherPrices.length > 0

  // Only show archive option if price is active, but only have it enabled if there are other prices
  if (price.active) {
    let helperText: string | undefined = undefined
    if (price.isDefault) {
      helperText = 'Make another price default to archive this.'
    } else if (otherPrices.length === 0) {
      helperText =
        'Every product must have at least one active price.'
    }
    items.push({
      label: 'Archive price',
      icon: <Archive className="h-4 w-4" />,
      handler: () => setIsArchiveOpen(true),
      disabled: !canDelist,
      helperText,
    })
  }

  items.push({
    label: 'Delete price',
    icon: <Trash2 className="h-4 w-4" />,
    destructive: true,
    disabled: !canDelist,
    handler: () => {
      // FIXME: Implement delete price functionality
    },
  })

  return (
    <EnhancedDataTableActionsMenu items={items}>
      <EditPriceModal
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        price={price}
      />
      <ArchivePriceModal
        isOpen={isArchiveOpen}
        setIsOpen={setIsArchiveOpen}
        price={price}
      />
      <SetPriceAsDefaultModal
        isOpen={isSetDefaultOpen}
        setIsOpen={setIsSetDefaultOpen}
        price={price}
      />
    </EnhancedDataTableActionsMenu>
  )
}

export const columns: ColumnDef<PriceTableRowData>[] = [
  {
    id: 'name',
    accessorFn: (row) => row.price.name,
    header: 'Price',
    cell: ({ row }) => (
      <div className="truncate" title={row.getValue('name')}>
        {row.getValue('name')}
      </div>
    ),
    size: 150,
    minSize: 120,
    maxSize: 200,
  },
  {
    id: 'type',
    accessorFn: (row) => row.price.type,
    header: 'Type',
    cell: ({ row }) => {
      const type = row.getValue('type') as PriceType
      return <PriceTypeCellView type={type} />
    },
    size: 140,
    minSize: 120,
    maxSize: 160,
  },
  {
    id: 'pricing',
    accessorFn: (row) => row.price,
    header: 'Pricing',
    cell: ({ row }) => {
      const price = row.getValue('pricing') as Price.ClientRecord
      return (
        <div className="truncate">
          <PricingCellView prices={[price]} />
        </div>
      )
    },
    size: 120,
    minSize: 105,
    maxSize: 120,
  },
  {
    id: 'active',
    accessorFn: (row) => row.price.active,
    header: 'Status',
    cell: ({ row }) => {
      const active = row.getValue('active') as boolean
      return <StatusBadge active={active} />
    },
    size: 110,
    minSize: 105,
    maxSize: 115,
  },
  {
    id: 'slug',
    accessorFn: (row) => row.price.slug,
    header: 'Slug',
    cell: ({ row }) => {
      const slug = row.getValue('slug') as string
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <DataTableCopyableCell copyText={slug}>
            {slug}
          </DataTableCopyableCell>
        </div>
      )
    },
    size: 180,
    minSize: 125,
    maxSize: 250,
  },

  {
    id: 'isDefault',
    accessorFn: (row) => row.price.isDefault,
    header: 'Default',
    cell: ({ row }) => {
      const isDefault = row.getValue('isDefault') as boolean
      return (
        <div className="flex items-center gap-3">
          <Checkbox
            checked={isDefault}
            aria-label="Default price"
            className="cursor-default"
            disabled
          />
        </div>
      )
    },
    size: 90,
    minSize: 80,
    maxSize: 100,
  },
  {
    id: 'createdAt',
    accessorFn: (row) => row.price.createdAt,
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
    accessorFn: (row) => row.price.id,
    header: 'ID',
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
    size: 180,
    minSize: 125,
    maxSize: 250,
  },
  {
    id: 'actions',
    enableHiding: false,
    enableResizing: false,
    cell: ({ row, table }) => {
      const price = row.original.price
      const allRows = table.getCoreRowModel().rows
      const otherPrices = allRows
        .filter((r) => r.original.price.id !== price.id)
        .map((r) => r.original.price)

      return (
        <div
          className="w-8 flex justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <PriceActionsMenu price={price} otherPrices={otherPrices} />
        </div>
      )
    },
    size: 1,
    minSize: 56,
    maxSize: 56,
  },
]
