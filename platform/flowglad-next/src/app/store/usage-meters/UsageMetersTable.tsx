import { useMemo, useState } from 'react'
import { ColumnDef } from '@tanstack/react-table'
import Table from '@/components/ion/Table'
import SortableColumnHeaderCell from '@/components/ion/SortableColumnHeaderCell'
import { UsageMeter } from '@/db/schema/usageMeters'
import { core } from '@/utils/core'
import TableTitle from '@/components/ion/TableTitle'
import { Plus } from 'lucide-react'
import CreateUsageMeterModal from '@/components/components/CreateUsageMeterModal'
import { trpc } from '@/app/_trpc/client'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'

export interface UsageMetersTableFilters {
  catalogId?: string
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
      catalog: { id: string; name: string }
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
            <SortableColumnHeaderCell title="Name" column={column} />
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
            <SortableColumnHeaderCell
              title="Catalog"
              column={column}
            />
          ),
          accessorKey: 'catalog.name',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.catalog.name}</span>
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
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
            <SortableColumnHeaderCell
              title="Created"
              column={column}
            />
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
            <SortableColumnHeaderCell title="ID" column={column} />
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
      <TableTitle
        title="Usage Meters"
        buttonIcon={<Plus size={16} strokeWidth={2} />}
        buttonLabel="Create Usage Meter"
        buttonOnClick={() => {
          setIsCreateModalOpen(true)
        }}
      />
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
