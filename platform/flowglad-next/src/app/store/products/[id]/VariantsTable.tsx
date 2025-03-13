import { Plus } from 'lucide-react'
import Badge from '@/components/ion/Badge'
import Checkbox from '@/components/ion/Checkbox'
import { RotateCw, Check } from 'lucide-react'
import { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import Table from '@/components/ion/Table'
import { Variant } from '@/db/schema/variants'
import core from '@/utils/core'
import TableRowPopoverMenu from '@/components/TableRowPopoverMenu'
import {
  PopoverMenuItem,
  PopoverMenuItemState,
} from '@/components/PopoverMenu'
import CreateVariantModal from '@/components/forms/CreateVariantModal'
import EditVariantModal from '@/components/forms/EditVariantModal'
import ArchiveVariantModal from '@/components/forms/ArchiveVariantModal'
import SetVariantAsDefaultModal from '@/components/forms/SetVariantAsDefaultModal'
import { Product } from '@/db/schema/products'
import PricingCellView from '@/components/PricingCellView'
import { PriceType } from '@/types'
import TableTitle from '@/components/ion/TableTitle'
import SortableColumnHeaderCell from '@/components/ion/SortableColumnHeaderCell'

const MoreMenuCell = ({
  variant,
  otherVariants,
}: {
  variant: Variant.Record
  otherVariants: Variant.Record[]
}) => {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isArchiveOpen, setIsArchiveOpen] = useState(false)
  const [isSetDefaultOpen, setIsSetDefaultOpen] = useState(false)
  const items: PopoverMenuItem[] = [
    {
      label: 'Edit variant',
      handler: () => setIsEditOpen(true),
    },
  ]
  /**
   * Case 1: Variant is archived - show unarchive option
   * Case 2: Variant is not default AND it's active - show make default option
   */
  if (!variant.active) {
    items.push({
      label: 'Unarchive variant',
      handler: () => setIsArchiveOpen(true),
    })
  }
  if (!variant.isDefault && otherVariants.some((v) => v.isDefault)) {
    items.push({
      label: 'Make default',
      handler: () => setIsSetDefaultOpen(true),
    })
  }

  const canDelist = !variant.isDefault && otherVariants.length > 0
  /**
   * Only show archive option if variant is active,
   * but only have it enabled if there are other variants
   */
  if (variant.active) {
    let helperText: string | undefined = undefined
    if (variant.isDefault) {
      helperText = 'Make another variant default to archive this.'
    } else if (otherVariants.length === 0) {
      helperText =
        'Every product must have at least one active variant.'
    }
    items.push({
      label: 'Archive variant',
      handler: () => setIsArchiveOpen(true),
      disabled: !canDelist,
      helperText,
    })
  }
  items.push({
    label: 'Delete variant',
    state: PopoverMenuItemState.Danger,
    disabled: !canDelist,
    handler: () => {
      // TODO: Implement delete variant functionality
    },
  })
  return (
    <>
      <EditVariantModal
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        variant={variant}
      />
      <ArchiveVariantModal
        isOpen={isArchiveOpen}
        setIsOpen={setIsArchiveOpen}
        variant={variant}
      />
      <SetVariantAsDefaultModal
        isOpen={isSetDefaultOpen}
        setIsOpen={setIsSetDefaultOpen}
        variant={variant}
      />
      <div className="w-fit" onClick={(e) => e.stopPropagation()}>
        <TableRowPopoverMenu items={items} />
      </div>
    </>
  )
}

const PriceTypeCellView = ({
  priceType,
}: {
  priceType: PriceType
}) => {
  switch (priceType) {
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

const VariantsTable = ({
  variants,
  product,
}: {
  product: Product.ClientRecord
  variants: Variant.Record[]
}) => {
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  const columns_1 = useMemo(
    () =>
      [
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Variant"
              column={column}
            />
          ),
          accessorKey: 'variant',
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
            <PriceTypeCellView priceType={cellData.priceType} />
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
            <PricingCellView variants={[cellData]} />
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
              variant={cellData}
              otherVariants={variants.filter(
                (v) => v.id !== cellData.id
              )}
            />
          ),
        },
      ] as ColumnDef<Variant.Record>[],
    [variants]
  )

  return (
    <div className="w-full flex flex-col gap-5 pb-8">
      <CreateVariantModal
        isOpen={isCreateOpen}
        setIsOpen={setIsCreateOpen}
        productId={variants[0]?.productId} // Assuming all variants belong to same product
      />
      <TableTitle
        title="Variants"
        buttonLabel="Create Variant"
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
              data={variants}
              className="bg-nav"
              bordered
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default VariantsTable
