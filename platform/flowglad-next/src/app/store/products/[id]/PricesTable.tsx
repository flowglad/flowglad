import { Plus } from 'lucide-react'
import Badge from '@/components/ion/Badge'
import Checkbox from '@/components/ion/Checkbox'
import { RotateCw, Check } from 'lucide-react'
import { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import Table from '@/components/ion/Table'
import { Price } from '@/db/schema/prices'
import core from '@/utils/core'
import TableRowPopoverMenu from '@/components/TableRowPopoverMenu'
import {
  PopoverMenuItem,
  PopoverMenuItemState,
} from '@/components/PopoverMenu'
import CreatePriceModal from '@/components/forms/CreatePriceModal'
import EditPriceModal from '@/components/forms/EditPriceModal'
import ArchivePriceModal from '@/components/forms/ArchivePriceModal'
import SetPriceAsDefaultModal from '@/components/forms/SetPriceAsDefaultModal'
import { Product } from '@/db/schema/products'
import PricingCellView from '@/components/PricingCellView'
import { PriceType } from '@/types'
import TableTitle from '@/components/ion/TableTitle'
import SortableColumnHeaderCell from '@/components/ion/SortableColumnHeaderCell'

const MoreMenuCell = ({
  price,
  otherPrices,
}: {
  price: Price.Record
  otherPrices: Price.Record[]
}) => {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isArchiveOpen, setIsArchiveOpen] = useState(false)
  const [isSetDefaultOpen, setIsSetDefaultOpen] = useState(false)
  const items: PopoverMenuItem[] = [
    {
      label: 'Edit price',
      handler: () => setIsEditOpen(true),
    },
  ]
  /**
   * Case 1: Price is archived - show unarchive option
   * Case 2: Price is not default AND it's active - show make default option
   */
  if (!price.active) {
    items.push({
      label: 'Unarchive price',
      handler: () => setIsArchiveOpen(true),
    })
  }
  if (!price.isDefault && otherPrices.some((p) => p.isDefault)) {
    items.push({
      label: 'Make default',
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
      handler: () => setIsArchiveOpen(true),
      disabled: !canDelist,
      helperText,
    })
  }
  items.push({
    label: 'Delete price',
    state: PopoverMenuItemState.Danger,
    disabled: !canDelist,
    handler: () => {
      // TODO: Implement delete price functionality
    },
  })
  return (
    <>
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
      <div className="w-fit" onClick={(e) => e.stopPropagation()}>
        <TableRowPopoverMenu items={items} />
      </div>
    </>
  )
}

const PriceTypeCellView = ({ type }: { type: PriceType }) => {
  switch (type) {
    case PriceType.Subscription:
      return (
        <div className="flex items-center gap-3">
          <RotateCw size={16} strokeWidth={2} />
          <div className="w-fit flex flex-col justify-center text-sm font-medium text-foreground">
            Subscription
          </div>
        </div>
      )
    case PriceType.SinglePayment:
      return (
        <div className="flex items-center gap-3">
          <div className="w-fit flex flex-col justify-center text-sm font-medium text-foreground">
            Single Payment
          </div>
        </div>
      )
    default:
      return null
  }
}

const PricesTable = ({
  prices,
  product,
}: {
  product: Product.ClientRecord
  prices: Price.Record[]
}) => {
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  const columns_1 = useMemo(
    () =>
      [
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell title="Price" column={column} />
          ),
          accessorKey: 'price',
          cell: ({ row: { original: cellData } }) => (
            <>{cellData.name}</>
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell title="Type" column={column} />
          ),
          accessorKey: 'type',
          cell: ({ row: { original: cellData } }) => (
            <PriceTypeCellView type={cellData.type} />
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Pricing"
              column={column}
            />
          ),
          accessorKey: 'pricing',
          cell: ({ row: { original: cellData } }) => (
            <PricingCellView prices={[cellData]} />
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Status"
              column={column}
            />
          ),
          accessorKey: 'status',
          cell: ({ row: { original: cellData } }) => (
            <Badge
              iconLeading={<Check size={12} strokeWidth={2} />}
              variant="soft"
              color="green"
              size="sm"
            >
              Active
            </Badge>
          ),
        },
        {
          header: 'Default',
          cell: ({ row: { original: cellData } }) => (
            <div className="flex items-center gap-3">
              <Checkbox
                checked={cellData.isDefault}
                aria-label="Select row"
                className="cursor-default"
              />
            </div>
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Created"
              column={column}
            />
          ),
          accessorKey: 'createdAt',
          cell: ({ row: { original: cellData } }) => (
            <>{core.formatDate(cellData.createdAt)}</>
          ),
        },
        {
          id: '_',
          cell: ({ row: { original: cellData } }) => (
            <MoreMenuCell
              price={cellData}
              otherPrices={prices.filter((p) => p.id !== cellData.id)}
            />
          ),
        },
      ] as ColumnDef<Price.Record>[],
    [prices]
  )

  return (
    <div className="w-full flex flex-col gap-5 pb-8">
      <CreatePriceModal
        isOpen={isCreateOpen}
        setIsOpen={setIsCreateOpen}
        productId={prices[0]?.productId} // Assuming all prices belong to same product
      />
      <TableTitle
        title="Prices"
        buttonLabel="Create Price"
        buttonIcon={<Plus size={8} strokeWidth={2} />}
        buttonOnClick={() => setIsCreateOpen(true)}
        buttonDisabled={!product.active}
        buttonDisabledTooltip="Product must be active"
      />
      <div className="w-full flex flex-col gap-2">
        <div className="w-full flex flex-col gap-2">
          <div className="w-full flex flex-col gap-5">
            <Table
              columns={columns_1}
              data={prices}
              className="bg-nav"
              bordered
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default PricesTable
