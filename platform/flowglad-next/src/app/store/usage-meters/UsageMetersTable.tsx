import { useMemo, useState } from 'react'
import { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { UsageMeter } from '@/db/schema/usageMeters'
import { core } from '@/utils/core'
import CreateUsageMeterModal from '@/components/components/CreateUsageMeterModal'
import { trpc } from '@/app/_trpc/client'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'

export interface UsageMetersTableFilters {
  pricingModelId?: string
}

const UsageMetersTable = ({
  filters = {},
}: {
  filters?: UsageMetersTableFilters
}) => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  const {
    pageIndex,
    pageSize,
    handlePaginationChange,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<
    {
      pricingModel: { id: string; name: string }
      usageMeter: UsageMeter.ClientRecord
    },
    UsageMetersTableFilters
  >({
    initialCurrentCursor: undefined,
    pageSize: 10,
    filters,
    useQuery: trpc.usageMeters.getTableRows.useQuery,
  })

  const columns = useMemo(
    () =>
      [
        {
          header: 'Name',
          accessorKey: 'usageMeter.name',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">
              {cellData.usageMeter.name}
            </span>
          ),
        },
        {
          header: 'Pricing Model',
          accessorKey: 'pricingModel.name',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">
              {cellData.pricingModel.name}
            </span>
          ),
        },
        {
          header: 'Aggregation Type',
          accessorKey: 'usageMeter.aggregationType',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">
              {cellData.usageMeter.aggregationType === 'sum'
                ? 'Sum'
                : 'Count Distinct Properties'}
            </span>
          ),
        },
        {
          header: 'Created',
          accessorKey: 'usageMeter.createdAt',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">
              {core.formatDate(cellData.usageMeter.createdAt)}
            </span>
          ),
        },
        {
          header: 'ID',
          accessorKey: 'usageMeter.id',
          cell: ({ row: { original: cellData } }) => (
            <CopyableTextTableCell copyText={cellData.usageMeter.id}>
              {cellData.usageMeter.id}
            </CopyableTextTableCell>
          ),
        },
      ] as ColumnDef<{
        pricingModel: { id: string; name: string }
        usageMeter: UsageMeter.ClientRecord
      }>[],
    []
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
      <CreateUsageMeterModal
        isOpen={isCreateModalOpen}
        setIsOpen={setIsCreateModalOpen}
      />
    </div>
  )
}

export default UsageMetersTable
