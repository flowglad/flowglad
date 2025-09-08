// Generated with Ion on 9/23/2024, 6:30:46 PM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=372:6968
'use client'
import {
  Image as ImageIcon,
  Pencil,
  Copy,
  Archive,
  ArchiveRestore,
  Plus,
} from 'lucide-react'
import { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { DataTable } from '@/components/ui/data-table'
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
      icon: <Pencil />,
      handler: () => setIsEditOpen(true),
    },
    {
      label: 'Copy purchase link',
      icon: <Copy />,
      handler: copyPurchaseLinkHandler,
    },
    {
      label: product.active
        ? 'Deactivate product'
        : 'Activate product',
      icon: product.active ? <Archive /> : <ArchiveRestore />,
      handler: () => setIsArchiveOpen(true),
    },
  ]
  if (product.active) {
    items.push({
      label: 'Create price',
      icon: <Plus />,
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
          size: 50,
          maxSize: 50,
          cell: ({ row: { original: cellData } }) => (
            <div className="bg-muted h-10 w-10 hover:bg-muted overflow-clip flex items-center justify-center rounded-md shrink-0">
              {cellData.product.imageURL ? (
                <Image
                  src={cellData.product.imageURL}
                  alt={cellData.product.name}
                  width={40}
                  height={40}
                  className="object-cover object-center overflow-hidden h-10 w-10"
                />
              ) : (
                <ImageIcon
                  size={16}
                  className="text-muted-foreground"
                />
              )}
            </div>
          ),
        },
        {
          id: 'name',
          header: 'Name',
          accessorKey: 'product.name',
          size: 250,
          maxSize: 300,
          cell: ({ row: { original: cellData } }) => (
            <div className="min-w-0 max-w-[250px]">
              <span
                className="font-normal text-sm truncate block"
                title={cellData.product.name}
              >
                {cellData.product.name}
              </span>
            </div>
          ),
        },
        {
          header: 'Pricing',
          accessorKey: 'prices',
          size: 120,
          maxSize: 150,
          cell: ({ row: { original: cellData } }) => (
            <div className="min-w-0 max-w-[120px]">
              <PricingCellView prices={cellData.prices} />
            </div>
          ),
        },
        {
          id: 'status',
          header: 'Status',
          accessorKey: 'product.active',
          size: 100,
          maxSize: 100,
          cell: ({ row: { original: cellData } }) => (
            <div className="min-w-0">
              <StatusBadge active={cellData.product.active} />
            </div>
          ),
        },
        {
          header: 'ID',
          accessorKey: 'product.id',
          size: 200,
          maxSize: 200,
          cell: ({ row: { original: cellData } }) => (
            <div className="min-w-0 max-w-[250px]">
              <CopyableTextTableCell copyText={cellData.product.id}>
                <span
                  className="truncate block"
                  title={cellData.product.id}
                >
                  {cellData.product.id}
                </span>
              </CopyableTextTableCell>
            </div>
          ),
        },
        {
          id: '_',
          size: 40,
          maxSize: 40,
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
        <div className="w-full overflow-hidden">
          <DataTable
            columns={columns}
            data={tableData}
            onClickRow={(row) => {
              router.push(`/store/products/${row.product.id}`)
            }}
            className="bg-background w-full min-w-0"
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
    </div>
  )
}
