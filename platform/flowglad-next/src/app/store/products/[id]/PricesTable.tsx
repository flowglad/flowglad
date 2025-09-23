import {
  ChartColumnIncreasing,
  Pencil,
  Copy,
  Archive,
  ArchiveRestore,
  Star,
  Trash2,
} from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { RotateCw } from 'lucide-react'
import { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { DataTable } from '@/components/ui/data-table'
import { Price } from '@/db/schema/prices'
import core from '@/utils/core'
import {
  PopoverMenuItem,
  PopoverMenuItemState,
} from '@/components/PopoverMenu'
import EditPriceModal from '@/components/forms/EditPriceModal'
import ArchivePriceModal from '@/components/forms/ArchivePriceModal'
import SetPriceAsDefaultModal from '@/components/forms/SetPriceAsDefaultModal'
import PricingCellView from '@/components/PricingCellView'
import { PriceType } from '@/types'
import { trpc } from '@/app/_trpc/client'
import MoreMenuTableCell from '@/components/MoreMenuTableCell'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'
import { Product } from '@/db/schema/products'
import StatusBadge from '@/components/StatusBadge'

const MoreMenuCell = ({
  price,
  otherPrices,
}: {
  price: Price.ClientRecord
  otherPrices: Price.ClientRecord[]
}) => {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isArchiveOpen, setIsArchiveOpen] = useState(false)
  const [isSetDefaultOpen, setIsSetDefaultOpen] = useState(false)
  const copyTextHandler = useCopyTextHandler({
    text: `${process.env.NEXT_PUBLIC_APP_URL}/price/${price.id}/purchase`,
  })
  const items: PopoverMenuItem[] = [
    {
      label: 'Edit price',
      icon: <Pencil />,
      handler: () => setIsEditOpen(true),
    },
    {
      label: 'Copy purchase link',
      icon: <Copy />,
      handler: copyTextHandler,
    },
  ]
  /**
   * Case 1: Price is archived - show unarchive option
   * Case 2: Price is not default AND it's active - show make default option
   */
  if (!price.active) {
    items.push({
      label: 'Unarchive price',
      icon: <ArchiveRestore />,
      handler: () => setIsArchiveOpen(true),
    })
  }
  if (!price.isDefault && otherPrices.some((p) => p.isDefault)) {
    items.push({
      label: 'Make default',
      icon: <Star />,
      handler: () => setIsSetDefaultOpen(true),
    })
  }

  const canDelist = !price.isDefault && otherPrices.length > 0
  /**
   * Only show archive option if price is active,
   * but only have it enabled if there are other prices
   */
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
      icon: <Archive />,
      handler: () => setIsArchiveOpen(true),
      disabled: !canDelist,
      helperText,
    })
  }
  items.push({
    label: 'Delete price',
    icon: <Trash2 />,
    state: PopoverMenuItemState.Danger,
    disabled: !canDelist,
    handler: () => {
      // TODO: Implement delete price functionality
    },
  })
  return (
    <MoreMenuTableCell items={items}>
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
    </MoreMenuTableCell>
  )
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

export interface PaginatedPricesTableFilters {
  productId?: string
  type?: PriceType
  isDefault?: boolean
}

const PaginatedPricesTable = ({
  filters = {},
  productId,
}: {
  productId: string
  filters?: PaginatedPricesTableFilters
}) => {
  const {
    pageIndex,
    pageSize,
    handlePaginationChange,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<
    {
      price: Price.ClientRecord
      product: Pick<Product.ClientRecord, 'id' | 'name'>
    },
    PaginatedPricesTableFilters
  >({
    initialCurrentCursor: undefined,
    pageSize: 10,
    filters: {
      ...filters,
      productId,
    },
    useQuery: trpc.prices.getTableRows.useQuery,
  })

  const columns = useMemo(
    () =>
      [
        {
          header: 'Price',
          accessorKey: 'price',
          cell: ({ row: { original: cellData } }) => (
            <>{cellData.price.name}</>
          ),
        },
        {
          header: 'Type',
          accessorKey: 'type',
          cell: ({ row: { original: cellData } }) => (
            <PriceTypeCellView type={cellData.price.type} />
          ),
        },
        {
          header: 'Pricing',
          accessorKey: 'pricing',
          minSize: 105,
          maxSize: 120,
          cell: ({ row: { original: cellData } }) => (
            <div className="min-w-[105px] max-w-[120px]">
              <PricingCellView prices={[cellData.price]} />
            </div>
          ),
        },
        {
          header: 'Status',
          accessorKey: 'status',
          size: 110,
          minSize: 105,
          maxSize: 115,
          cell: ({ row: { original: cellData } }) => (
            <StatusBadge active={cellData.price.active} />
          ),
        },
        {
          header: 'Default',
          cell: ({ row: { original: cellData } }) => (
            <div className="flex items-center gap-3">
              <Checkbox
                checked={cellData.price.isDefault}
                aria-label="Select row"
                className="cursor-default"
              />
            </div>
          ),
        },
        {
          header: 'Created',
          accessorKey: 'createdAt',
          cell: ({ row: { original: cellData } }) => (
            <>{core.formatDate(cellData.price.createdAt)}</>
          ),
        },
        {
          header: 'ID',
          accessorKey: 'price.id',
          cell: ({ row: { original: cellData } }) => (
            <CopyableTextTableCell copyText={cellData.price.id}>
              {cellData.price.id}
            </CopyableTextTableCell>
          ),
        },
        {
          id: '_',
          size: 40,
          maxSize: 40,
          cell: ({ row: { original: cellData } }) => (
            <MoreMenuCell
              price={cellData.price}
              otherPrices={
                data?.items
                  .filter((p) => p.price.id !== cellData.price.id)
                  .map((p) => p.price) || []
              }
            />
          ),
        },
      ] as ColumnDef<{
        price: Price.ClientRecord
        product: { id: string; name: string }
      }>[],
    [data]
  )

  const tableData = data?.items || []
  const total = data?.total || 0

  return (
    <div className="w-full flex flex-col gap-5 pb-8">
      <div className="w-full flex flex-col gap-2">
        <div className="w-full flex flex-col gap-2">
          <div className="w-full flex flex-col gap-5">
            <DataTable
              columns={columns}
              data={tableData}
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
      </div>
    </div>
  )
}

export default PaginatedPricesTable
