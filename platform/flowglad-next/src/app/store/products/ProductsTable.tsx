// Generated with Ion on 9/23/2024, 6:30:46 PM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=372:6968
'use client'
import { Image as ImageIcon } from 'lucide-react'
import { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import Table from '@/components/ion/Table'
import { Product } from '@/db/schema/products'
import core from '@/utils/core'
import { Price } from '@/db/schema/prices'
import { PopoverMenuItem } from '@/components/PopoverMenu'
import DeleteProductModal from '@/components/forms/DeleteProductModal'
import EditProductModal from '@/components/forms/EditProductModal'
import ArchiveProductModal from '@/components/forms/ArchiveProductModal'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import StatusBadge from '@/components/StatusBadge'
import CreatePriceModal from '@/components/forms/CreatePriceModal'
import PricingCellView from '@/components/PricingCellView'
import ColumnHeaderCell from '@/components/ion/ColumnHeaderCell'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
import { PricingModel } from '@/db/schema/pricingModels'
import { trpc } from '@/app/_trpc/client'
import MoreMenuTableCell from '@/components/MoreMenuTableCell'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'

export enum FocusedTab {
  All = 'all',
  Active = 'active',
  Archived = 'archived',
}

export interface ProductsTableFilters {
  active?: boolean
  organizationId?: string
  pricingModelId?: string
}

interface ProductRow {
  prices: Price.ClientRecord[]
  product: Product.ClientRecord
  pricingModel?: PricingModel.ClientRecord
}

const MoreMenuCell = ({
  product,
}: {
  product: Product.ClientRecord
}) => {
  const [isArchiveOpen, setIsArchiveOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isCreatePriceOpen, setIsCreatePriceOpen] = useState(false)
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
    {
      label: product.active
        ? 'Deactivate product'
        : 'Activate product',
      handler: () => setIsArchiveOpen(true),
    },
  ]
  if (product.active) {
    items.push({
      label: 'Create price',
      handler: () => setIsCreatePriceOpen(true),
    })
  }
  return (
    <MoreMenuTableCell items={items}>
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
    </MoreMenuTableCell>
  )
}

export const ProductsTable = ({
  filters = {},
}: {
  filters?: ProductsTableFilters
}) => {
  const {
    pageIndex,
    pageSize,
    handlePaginationChange,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<ProductRow, ProductsTableFilters>({
    initialCurrentCursor: undefined,
    pageSize: 10,
    filters,
    useQuery: trpc.products.getTableRows.useQuery,
  })

  const columns = useMemo(
    () =>
      [
        {
          id: 'image',
          width: 100,
          cell: ({ row: { original: cellData } }) => (
            <div className="bg-muted h-10 w-10 hover:bg-muted overflow-clip flex items-center justify-center rounded-md">
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
            <ColumnHeaderCell title="Name" column={column} />
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
            <ColumnHeaderCell title="Pricing" column={column} />
          ),
          accessorKey: 'prices',
          cell: ({ row: { original: cellData } }) => (
            <PricingCellView prices={cellData.prices} />
          ),
        },
        {
          id: 'status',
          header: ({ column }) => (
            <ColumnHeaderCell title="Status" column={column} />
          ),
          accessorKey: 'product.active',
          cell: ({ row: { original: cellData } }) => (
            <StatusBadge active={cellData.product.active} />
          ),
        },
        {
          id: 'created',
          header: ({ column }) => (
            <ColumnHeaderCell title="Created" column={column} />
          ),
          accessorKey: 'product.createdAt',
          cell: ({ row: { original: cellData } }) => (
            <>{core.formatDate(cellData.product.createdAt!)}</>
          ),
        },
        {
          id: 'pricingModel',
          header: ({ column }) => (
            <ColumnHeaderCell title="Pricing Model" column={column} />
          ),
          accessorKey: 'pricingModel.name',
          cell: ({ row: { original: cellData } }) => {
            const pricingModelName = cellData.pricingModel?.name
            if (pricingModelName) {
              return <div className="w-fit">{pricingModelName}</div>
            }
            return <div className="w-fit">-</div>
          },
        },
        {
          header: ({ column }) => (
            <ColumnHeaderCell title="ID" column={column} />
          ),
          accessorKey: 'product.id',
          cell: ({ row: { original: cellData } }) => (
            <CopyableTextTableCell copyText={cellData.product.id}>
              {cellData.product.id}
            </CopyableTextTableCell>
          ),
        },
        {
          id: '_',
          cell: ({ row: { original: cellData } }) => (
            <MoreMenuCell product={cellData.product} />
          ),
        },
      ] as ColumnDef<ProductRow>[],
    []
  )
  const router = useRouter()

  const tableData = data?.items || []
  const total = data?.total || 0
  const pageCount = Math.ceil(total / pageSize)

  return (
    <div className="flex-1 h-full w-full flex flex-col gap-6 pb-10">
      <div className="w-full flex flex-col gap-5">
        <Table
          columns={columns}
          data={tableData}
          onClickRow={(row) => {
            router.push(`/store/products/${row.product.id}`)
          }}
          className="bg-background"
          bordered
          pagination={{
            pageIndex,
            pageSize,
            total,
            onPageChange: handlePaginationChange,
            isLoading,
            isFetching,
          }}
        />
      </div>
    </div>
  )
}
