'use client'

import { useMemo, useState } from 'react'
import Table, {
  type ColumnDefWithWidth,
} from '@/components/ion/Table'
import ColumnHeaderCell from '@/components/ion/ColumnHeaderCell'
import Badge from '@/components/ion/Badge'
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
      handler: () => setIsEditOpen(true),
    },
    {
      label: 'Clone Pricing Model',
      handler: () => setIsCloneOpen(true),
    },
  ]
  if (!pricingModel.isDefault) {
    menuItems.push({
      label: 'Set as Default',
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
          header: ({ column }) => (
            <ColumnHeaderCell title="Name" column={column} />
          ),
          accessorKey: 'pricingModel.name',
          width: '20%',
          cell: ({ row: { original: cellData } }) => (
            <div className="flex items-center gap-2">
              <span className="text-sm">
                {cellData.pricingModel.name}
              </span>
              {cellData.pricingModel.isDefault && (
                <Badge color="green" size="sm">
                  Default
                </Badge>
              )}
            </div>
          ),
        },
        {
          header: ({ column }) => (
            <ColumnHeaderCell title="Products" column={column} />
          ),
          accessorKey: 'productsCount',
          width: '30%',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.productsCount}</span>
          ),
        },
        {
          header: ({ column }) => (
            <ColumnHeaderCell title="ID" column={column} />
          ),
          accessorKey: 'pricingModel.id',
          width: '30%',
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
          width: '10%',
          cell: ({ row: { original: cellData } }) => (
            <MoreMenuCell pricingModel={cellData.pricingModel} />
          ),
        },
      ] as ColumnDefWithWidth<PricingModel.TableRow, string>[],
    []
  )

  const tableData = data?.items || []
  const total = data?.total || 0

  return (
    <Table
      columns={columns}
      data={tableData}
      className="bg-nav"
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
