'use client'

import { useMemo, useState } from 'react'
import { Pencil, Copy, Star } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { type ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { PricingModel } from '@/db/schema/pricingModels'
import EditPricingModelModal from '@/components/forms/EditPricingModelModal'
import ClonePricingModelModal from '@/components/forms/ClonePricingModelModal'
import { PopoverMenuItem } from '@/components/PopoverMenu'
import { trpc } from '@/app/_trpc/client'
import MoreMenuTableCell from '@/components/MoreMenuTableCell'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'
import { useRouter } from 'next/navigation'
import SetPricingModelAsDefaultModal from '@/components/forms/SetPricingModelAsDefaultModal'

const MoreMenuCell = ({
  pricingModel,
}: {
  pricingModel: PricingModel.ClientRecord
}) => {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isCloneOpen, setIsCloneOpen] = useState(false)
  const [isSetDefaultOpen, setIsSetDefaultOpen] = useState(false)
  const menuItems: PopoverMenuItem[] = [
    {
      label: 'Edit Pricing Model',
      icon: <Pencil />,
      handler: () => setIsEditOpen(true),
    },
    {
      label: 'Clone Pricing Model',
      icon: <Copy />,
      handler: () => setIsCloneOpen(true),
    },
  ]
  if (!pricingModel.isDefault) {
    menuItems.push({
      label: 'Set as Default',
      icon: <Star />,
      handler: () => setIsSetDefaultOpen(true),
    })
  }
  return (
    <MoreMenuTableCell items={menuItems}>
      <EditPricingModelModal
        pricingModel={pricingModel}
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
      />
      <ClonePricingModelModal
        isOpen={isCloneOpen}
        setIsOpen={setIsCloneOpen}
        pricingModel={pricingModel}
      />
      <SetPricingModelAsDefaultModal
        isOpen={isSetDefaultOpen}
        setIsOpen={setIsSetDefaultOpen}
        pricingModel={pricingModel}
      />
    </MoreMenuTableCell>
  )
}

export interface PricingModelsTableFilters {
  organizationId?: string
  isDefault?: boolean
}

const PricingModelsTable = ({
  filters = {},
}: {
  filters?: PricingModelsTableFilters
}) => {
  const router = useRouter()
  const {
    pageIndex,
    pageSize,
    handlePaginationChange,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<
    PricingModel.TableRow,
    PricingModelsTableFilters
  >({
    initialCurrentCursor: undefined,
    pageSize: 10,
    filters,
    useQuery: trpc.pricingModels.getTableRows.useQuery,
  })

  const columns = useMemo(
    () =>
      [
        {
          header: 'Name',
          accessorKey: 'pricingModel.name',
          cell: ({ row: { original: cellData } }) => (
            <div className="flex items-center gap-2">
              <span className="text-sm">
                {cellData.pricingModel.name}
              </span>
              {cellData.pricingModel.isDefault && (
                <Badge
                  variant="secondary"
                  className="bg-green-100 text-green-800 text-xs"
                >
                  Default
                </Badge>
              )}
            </div>
          ),
        },
        {
          header: 'Products',
          accessorKey: 'productsCount',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.productsCount}</span>
          ),
        },
        {
          header: 'ID',
          accessorKey: 'pricingModel.id',
          cell: ({ row: { original: cellData } }) => (
            <CopyableTextTableCell
              copyText={cellData.pricingModel.id}
            >
              {cellData.pricingModel.id}
            </CopyableTextTableCell>
          ),
        },
        {
          id: '_',
          size: 40,
          maxSize: 40,
          cell: ({ row: { original: cellData } }) => (
            <MoreMenuCell pricingModel={cellData.pricingModel} />
          ),
        },
      ] as ColumnDef<PricingModel.TableRow, string>[],
    []
  )

  const tableData = data?.items || []
  const total = data?.total || 0

  return (
    <DataTable
      columns={columns}
      data={tableData}
      className="bg-background"
      bordered
      onClickRow={(row) => {
        router.push(`/store/pricing-models/${row.pricingModel.id}`)
      }}
      pagination={{
        pageIndex,
        pageSize,
        total,
        onPageChange: handlePaginationChange,
        isLoading,
        isFetching,
      }}
    />
  )
}

export default PricingModelsTable
