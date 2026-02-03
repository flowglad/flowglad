'use client'

import type { Price } from '@db-core/schema/prices'
import type { PricingModel } from '@db-core/schema/pricingModels'
import type { Product } from '@db-core/schema/products'
import type { ColumnDef } from '@tanstack/react-table'
// Icons come next
import {
  Archive,
  ArchiveRestore,
  Copy,
  Lock,
  Pencil,
} from 'lucide-react'
// Other imports
import * as React from 'react'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
import ArchiveProductModal from '@/components/forms/ArchiveProductModal'
import DeleteProductModal from '@/components/forms/DeleteProductModal'
import EditProductModal from '@/components/forms/EditProductModal'
import PricingCellView from '@/components/PricingCellView'
import { Badge } from '@/components/ui/badge'
// UI components last
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import {
  type ActionMenuItem,
  EnhancedDataTableActionsMenu,
} from '@/components/ui/enhanced-data-table-actions-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export interface ProductRow {
  prices: Price.ClientRecord[]
  product: Product.ClientRecord
  pricingModel?: PricingModel.ClientRecord
}

function ProductActionsMenu({
  product,
  prices,
}: {
  product: Product.ClientRecord
  prices: Price.ClientRecord[]
}) {
  const [isArchiveOpen, setIsArchiveOpen] = React.useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false)
  const [isEditOpen, setIsEditOpen] = React.useState(false)

  const purchaseLink =
    typeof window !== 'undefined'
      ? `${window.location.origin}/product/${product.id}/purchase`
      : ''

  const copyPurchaseLinkHandler = useCopyTextHandler({
    text: purchaseLink,
  })

  // Check if product has any usage type prices
  const hasUsagePrice = prices.some((price) => price.type === 'usage')
  const isArchived = !product.active

  const actionItems: ActionMenuItem[] = [
    {
      label: 'Edit',
      icon: <Pencil className="h-4 w-4" />,
      handler: () => setIsEditOpen(true),
      disabled: isArchived,
      helperText: isArchived
        ? 'Cannot edit archived products'
        : undefined,
    },
    {
      label: 'Copy purchase link',
      icon: <Copy className="h-4 w-4" />,
      handler: copyPurchaseLinkHandler,
      disabled: product.default || hasUsagePrice || isArchived,
      helperText: isArchived
        ? 'Cannot copy purchase link for archived products'
        : product.default
          ? 'Cannot copy checkout link for default products. Default products are automatically assigned to customers.'
          : hasUsagePrice
            ? 'Cannot copy checkout link for products with usage-based pricing.'
            : undefined,
    },
  ]

  // Archive option always at the bottom
  actionItems.push({
    label: product.active ? 'Archive' : 'Restore',
    icon: product.active ? (
      <Archive className="h-4 w-4" />
    ) : (
      <ArchiveRestore className="h-4 w-4" />
    ),
    handler: () => setIsArchiveOpen(true),
    disabled: product.default,
    destructive: product.active,
  })

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
      <ArchiveProductModal
        isOpen={isArchiveOpen}
        setIsOpen={setIsArchiveOpen}
        product={{
          id: product.id,
          name: product.name,
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
      const productName = row.getValue('name') as string
      const isDefault = row.original.product.default
      const isArchived = !row.original.product.active

      return (
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`font-normal text-sm truncate ${isArchived ? 'text-muted-foreground' : ''}`}
            title={productName}
          >
            {productName}
          </span>
          {isArchived && (
            <Badge
              variant="secondary"
              className="text-xs flex-shrink-0"
            >
              Archived
            </Badge>
          )}
          {isDefault && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Lock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                align="start"
                variant="muted"
                className="max-w-xs px-3 py-2 text-sm font-medium"
              >
                <p>
                  Default products are automatically assigned to
                  customers and cannot be archived.
                </p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )
    },
    size: 300,
    minSize: 120,
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
    id: 'slug',
    accessorFn: (row) => row.product.slug,
    header: 'Slug',
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()}>
        <DataTableCopyableCell copyText={row.getValue('slug')}>
          {row.getValue('slug')}
        </DataTableCopyableCell>
      </div>
    ),
    size: 150,
    minSize: 120,
    maxSize: 200,
  },
  {
    id: 'productId',
    accessorFn: (row) => row.product.id,
    header: 'ID',
    cell: ({ row }) => (
      <div>
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
    enableResizing: false,
    cell: ({ row }) => {
      const product = row.original.product
      const prices = row.original.prices
      return (
        <div
          className="w-8 flex justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <ProductActionsMenu product={product} prices={prices} />
        </div>
      )
    },
    size: 1,
    minSize: 56,
    maxSize: 56,
  },
]
