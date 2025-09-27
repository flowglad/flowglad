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
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import {
  EnhancedDataTableActionsMenu,
  ActionMenuItem,
} from '@/components/ui/enhanced-data-table-actions-menu'
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
    id: 'name',
    accessorFn: (row) => row.product.name,
    header: 'Product',
    cell: ({ row }) => {
      const imageURL = row.original.product.imageURL
      const productName = row.getValue('name') as string
      return (
        <div className="flex items-center">
          <div className="mr-4 h-6 w-8 flex-shrink-0 rounded bg-muted flex items-center justify-center overflow-hidden bg-cover bg-center bg-no-repeat">
            {imageURL ? (
              <Image
                src={imageURL}
                alt={productName}
                width={32}
                height={24}
                className="object-cover object-center h-6 w-8"
              />
            ) : (
              <ImageIcon
                size={16}
                className="text-muted-foreground/25"
              />
            )}
          </div>
          <span
            className="font-normal text-sm truncate max-w-48 lg:max-w-64"
            title={productName}
          >
            {productName}
          </span>
        </div>
      )
    },
    size: 300,
    maxSize: 350,
  },
  {
    id: 'prices',
    accessorFn: (row) => row.prices,
    header: 'Price',
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
    header: 'Status',
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
    header: 'ID',
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
