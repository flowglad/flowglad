// Generated with Ion on 9/23/2024, 6:30:46 PM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=372:6968
'use client'
import { Image as ImageIcon } from 'lucide-react'
import { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import Table from '@/components/ion/Table'
import { Product } from '@/db/schema/products'
import core from '@/utils/core'
import { Variant } from '@/db/schema/variants'
import TableRowPopoverMenu from '@/components/TableRowPopoverMenu'
import { PopoverMenuItem } from '@/components/PopoverMenu'
import ArchiveProductModal from '@/components/forms/ArchiveProductModal'
import DeleteProductModal from '@/components/forms/DeleteProductModal'
import EditProductModal from '@/components/forms/EditProductModal'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import StatusBadge from '@/components/StatusBadge'
import CreateVariantModal from '@/components/forms/CreateVariantModal'
import PricingCellView from '@/components/PricingCellView'
import SortableColumnHeaderCell from '@/components/ion/SortableColumnHeaderCell'
import { sentenceCase } from 'change-case'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'

export enum FocusedTab {
  All = 'all',
  Active = 'active',
  Archived = 'archived',
}

type Props = {
  products: {
    product: Product.ClientRecord
    variants: Variant.ClientRecord[]
  }[]
}

interface ProductRow {
  totalRevenue: string
  monthToDateRevenue: string
  variants: Variant.Record[]
  product: Product.ClientRecord
}

const MoreMenuCell = ({
  product,
}: {
  product: Product.ClientRecord
}) => {
  const [isArchiveOpen, setIsArchiveOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isCreateVariantOpen, setIsCreateVariantOpen] =
    useState(false)
  const text =
    typeof window !== 'undefined'
      ? `${window.location.origin}/product/${product.id}/purchase`
      : ''
  const copyPurchaseLinkHandler = useCopyTextHandler({
    text,
  })
  const items: PopoverMenuItem[] = [
    {
      label: 'Edit product',
      handler: () => setIsEditOpen(true),
    },
    {
      label: 'Copy purchase link',
      handler: copyPurchaseLinkHandler,
    },
  ]
  if (product.active) {
    items.push({
      label: 'Create variant',
      handler: () => setIsCreateVariantOpen(true),
    })
    items.push({
      label: 'Archive product',
      handler: () => setIsArchiveOpen(true),
    })
  } else {
    items.push({
      label: 'Unarchive product',
      handler: () => setIsArchiveOpen(true),
    })
  }
  return (
    <>
      <ArchiveProductModal
        isOpen={isArchiveOpen}
        setIsOpen={setIsArchiveOpen}
        product={product}
      />
      <EditProductModal
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        product={product}
        variants={[]}
      />
      <DeleteProductModal
        onDelete={async () => {}}
        isOpen={isDeleteOpen}
        setIsOpen={setIsDeleteOpen}
      />
      <CreateVariantModal
        isOpen={isCreateVariantOpen}
        setIsOpen={setIsCreateVariantOpen}
        productId={product.id}
      />
      <TableRowPopoverMenu items={items} />
    </>
  )
}

export const ProductsTable = ({
  products,
}: Pick<Props, 'products'>) => {
  const columns = useMemo(
    () =>
      [
        {
          id: 'image',
          cell: ({ row: { original: cellData } }) => (
            <div className="bg-fbg-primary-200 h-10 w-10 hover:bg-fbg-primary-200 overflow-clip flex items-center justify-center rounded-md">
              {cellData.product.imageURL ? (
                <Image
                  src={cellData.product.imageURL}
                  alt={cellData.product.name}
                  width={140}
                  height={80}
                  className="object-cover object-center overflow-hidden h-10 w-10"
                />
              ) : (
                <ImageIcon size={20} />
              )}
            </div>
          ),
        },
        {
          id: 'name',
          header: ({ column }) => (
            <SortableColumnHeaderCell title="Name" column={column} />
          ),
          accessorKey: 'product.name',
          cell: ({ row: { original: cellData } }) => (
            <>
              <span className="font-bold text-sm">
                {cellData.product.name}
              </span>
            </>
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Pricing"
              column={column}
            />
          ),
          accessorKey: 'variants',
          cell: ({ row: { original: cellData } }) => (
            <PricingCellView variants={cellData.variants} />
          ),
        },
        {
          id: 'status',
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Status"
              column={column}
            />
          ),
          accessorKey: 'product.active',
          cell: ({ row: { original: cellData } }) => (
            <StatusBadge active={cellData.product.active} />
          ),
        },
        {
          id: 'created',
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Created"
              column={column}
            />
          ),
          accessorKey: 'product.createdAt',
          cell: ({ row: { original: cellData } }) => (
            <>{core.formatDate(cellData.product.createdAt!)}</>
          ),
        },
        {
          id: '_',
          cell: ({ row: { original: cellData } }) => (
            <div
              className="w-fit"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreMenuCell product={cellData.product} />
            </div>
          ),
        },
      ] as ColumnDef<ProductRow>[],
    []
  )
  const router = useRouter()
  return (
    <div className="flex-1 h-full w-full flex flex-col gap-6 pb-10">
      <div className="w-full flex flex-col gap-5">
        <Table
          columns={columns}
          data={products.map((product) => ({
            product: product.product,
            totalRevenue: '',
            monthToDateRevenue: '',
            variants: product.variants,
          }))}
          onClickRow={(row) => {
            router.push(`/store/products/${row.product.id}`)
          }}
          className="bg-nav"
          bordered
        />
      </div>
    </div>
  )
}
