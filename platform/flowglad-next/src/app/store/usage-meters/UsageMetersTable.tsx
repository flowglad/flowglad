import { useMemo, useState } from 'react'
import { ColumnDef } from '@tanstack/react-table'
import Table from '@/components/ion/Table'
import ColumnHeaderCell from '@/components/ion/ColumnHeaderCell'
import { UsageMeter } from '@/db/schema/usageMeters'
import { core } from '@/utils/core'
import TableTitle from '@/components/ion/TableTitle'
import { Plus } from 'lucide-react'
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
          header: ({ column }) => (
            <ColumnHeaderCell title="Name" column={column} />
          ),
          accessorKey: 'usageMeter.name',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">
              {cellData.usageMeter.name}
            </span>
          ),
        },
        {
          header: ({ column }) => (
            <ColumnHeaderCell title="Pricing Model" column={column} />
          ),
          accessorKey: 'pricingModel.name',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">
              {cellData.pricingModel.name}
            </span>
          ),
        },
        {
          header: ({ column }) => (
            <ColumnHeaderCell
              title="Aggregation Type"
              column={column}
            />
          ),
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
          header: ({ column }) => (
            <ColumnHeaderCell title="Created" column={column} />
          ),
          accessorKey: 'usageMeter.createdAt',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">
              {core.formatDate(cellData.usageMeter.createdAt)}
            </span>
          ),
        },
        {
          header: ({ column }) => (
            <ColumnHeaderCell title="ID" column={column} />
          ),
          accessorKey: 'usageMeter.id',
          cell: ({ row: { original: cellData } }) => (
            <CopyableTextTableCell copyText={cellData.usageMeter.id}>
              {cellData.usageMeter.id}
            </CopyableTextTableCell>
          ),
        },
      ] as ColumnDef<{
        catalog: { id: string; name: string }
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
            <Table
              columns={columns}
              data={tableData}
              className="bg-nav"
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
