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

export interface UsageMetersTableFilters {
  catalogId?: string
}

const UsageMetersTable = ({
  filters = {},
}: {
  filters?: UsageMetersTableFilters
}) => {
  const [pageIndex, setPageIndex] = useState(0)
  const pageSize = 10

  const { data, isLoading, isFetching } =
    trpc.usageMeters.getTableRows.useQuery({
      cursor: pageIndex.toString(),
      limit: pageSize,
      filters,
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
      ] as ColumnDef<UsageMeter.TableRow>[],
    []
  )

  const handlePaginationChange = (newPageIndex: number) => {
    setPageIndex(newPageIndex)
  }

  const tableData = data?.data || []
  const total = data?.total || 0
  const pageCount = Math.ceil(total / pageSize)

  return (
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
  )
}

export default UsageMetersTable
