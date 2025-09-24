'use client'

import * as React from 'react'
import { ColumnDef } from '@tanstack/react-table'
// Icons come next
import {
  Image as ImageIcon,
  Pencil,
  Copy,
  Archive,
  ArchiveRestore,
  Plus,
} from 'lucide-react'
// UI components last
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import {
  EnhancedDataTableActionsMenu,
  ActionMenuItem,
} from '@/components/ui/enhanced-data-table-actions-menu'
import { Checkbox } from '@/components/ui/checkbox'
// Other imports
import Image from 'next/image'
import StatusBadge from '@/components/StatusBadge'
import PricingCellView from '@/components/PricingCellView'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
import { Product } from '@/db/schema/products'
import { Price } from '@/db/schema/prices'
import { PricingModel } from '@/db/schema/pricingModels'
import DeleteProductModal from '@/components/forms/DeleteProductModal'
import EditProductModal from '@/components/forms/EditProductModal'
import ArchiveProductModal from '@/components/forms/ArchiveProductModal'
import CreatePriceModal from '@/components/forms/CreatePriceModal'

export interface ProductRow {
  prices: Price.ClientRecord[]
  product: Product.ClientRecord
  pricingModel?: PricingModel.ClientRecord
}

function ProductActionsMenu({
  product,
}: {
  product: Product.ClientRecord
}) {
  const [isArchiveOpen, setIsArchiveOpen] = React.useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false)
  const [isEditOpen, setIsEditOpen] = React.useState(false)
  const [isCreatePriceOpen, setIsCreatePriceOpen] =
    React.useState(false)

  const purchaseLink =
    typeof window !== 'undefined'
      ? `${window.location.origin}/product/${product.id}/purchase`
      : ''

  const copyPurchaseLinkHandler = useCopyTextHandler({
    text: purchaseLink,
  })

  const actionItems: ActionMenuItem[] = [
    {
      label: 'Edit product',
      icon: <Pencil className="h-4 w-4" />,
      handler: () => setIsEditOpen(true),
    },
    {
      label: 'Copy purchase link',
      icon: <Copy className="h-4 w-4" />,
      handler: copyPurchaseLinkHandler,
      disabled: product.default,
      helperText: product.default
        ? 'Cannot copy checkout link for default products. Default products are automatically assigned to customers.'
        : undefined,
    },
    {
      label: product.active
        ? 'Deactivate product'
        : 'Activate product',
      icon: product.active ? (
        <Archive className="h-4 w-4" />
      ) : (
        <ArchiveRestore className="h-4 w-4" />
      ),
      handler: () => setIsArchiveOpen(true),
    },
  ]

  if (product.active) {
    actionItems.push({
      label: 'Create price',
      icon: <Plus className="h-4 w-4" />,
      handler: () => setIsCreatePriceOpen(true),
    })
  }

  return (
    <EnhancedDataTableActionsMenu items={actionItems}>
      <EditProductModal
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        product={product}
        prices={[]}
      />
      <DeleteProductModal
        onDelete={async () => {}}
        isOpen={isDeleteOpen}
        setIsOpen={setIsDeleteOpen}
      />
      <CreatePriceModal
        isOpen={isCreatePriceOpen}
        setIsOpen={setIsCreatePriceOpen}
        productId={product.id}
      />
      <ArchiveProductModal
        isOpen={isArchiveOpen}
        setIsOpen={setIsArchiveOpen}
        product={{
          id: product.id,
          active: product.active,
        }}
      />
    </EnhancedDataTableActionsMenu>
  )
}

export const columns: ColumnDef<ProductRow>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <div onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) =>
            table.toggleAllPageRowsSelected(!!value)
          }
          aria-label="Select all"
        />
      </div>
    ),
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
    size: 40,
    maxSize: 40,
  },
  {
    id: 'image',
    header: '',
    cell: ({ row }) => (
      <div className="bg-muted h-10 w-10 hover:bg-muted overflow-clip flex items-center justify-center rounded-md shrink-0">
        {row.original.product.imageURL ? (
          <Image
            src={row.original.product.imageURL}
            alt={row.original.product.name}
            width={40}
            height={40}
            className="object-cover object-center overflow-hidden h-10 w-10"
          />
        ) : (
          <ImageIcon size={16} className="text-muted-foreground" />
        )}
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
    size: 50,
    maxSize: 50,
  },
  {
    id: 'name',
    accessorFn: (row) => row.product.name,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => (
      <div className="min-w-0">
        <span
          className="font-normal text-sm truncate block"
          title={row.getValue('name')}
        >
          {row.getValue('name')}
        </span>
      </div>
    ),
    size: 250,
    maxSize: 300,
  },
  {
    accessorKey: 'prices',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Pricing" />
    ),
    cell: ({ row }) => (
      <div className="min-w-[105px] max-w-[120px]">
        <PricingCellView prices={row.getValue('prices')} />
      </div>
    ),
    size: 110,
    minSize: 105,
    maxSize: 120,
  },
  {
    id: 'status',
    accessorFn: (row) => row.product.active,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => (
      <div className="min-w-0">
        <StatusBadge active={row.getValue('status')} />
      </div>
    ),
    size: 110,
    minSize: 105,
    maxSize: 115,
  },
  {
    id: 'productId',
    accessorFn: (row) => row.product.id,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="ID" />
    ),
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0 max-w-[250px]">
          <DataTableCopyableCell copyText={row.getValue('productId')}>
            <span
              className="truncate block"
              title={row.getValue('productId')}
            >
              {row.getValue('productId')}
            </span>
          </DataTableCopyableCell>
        </div>
      </div>
    ),
    size: 200,
    maxSize: 200,
  },
  {
    id: 'actions',
    enableHiding: false,
    cell: ({ row }) => {
      const product = row.original.product
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <ProductActionsMenu product={product} />
        </div>
      )
    },
    size: 40,
    maxSize: 40,
  },
]
