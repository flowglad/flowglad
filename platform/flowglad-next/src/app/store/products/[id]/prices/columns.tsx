'use client'

import * as React from 'react'
import { ColumnDef } from '@tanstack/react-table'
// Icons come next
import { ChartColumnIncreasing, RotateCw } from 'lucide-react'
// UI components last
import { Checkbox } from '@/components/ui/checkbox'
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
// Other imports
import { Price } from '@/db/schema/prices'
import { Product } from '@/db/schema/products'
import { PriceType } from '@/types'
import core from '@/utils/core'
import StatusBadge from '@/components/StatusBadge'
import PricingCellView from '@/components/PricingCellView'

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
]
