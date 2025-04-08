import { useMemo, useState } from 'react'
import { ColumnDef } from '@tanstack/react-table'
import Table from '@/components/ion/Table'
import SortableColumnHeaderCell from '@/components/ion/SortableColumnHeaderCell'
import { UsageMeter } from '@/db/schema/usageMeters'
import { core } from '@/utils/core'
import TableTitle from '@/components/ion/TableTitle'
import { Plus } from 'lucide-react'
import CreateUsageMeterModal from '@/components/components/CreateUsageMeterModal'

const UsageMetersTable = ({
  data,
}: {
  data: UsageMeter.TableRow[]
}) => {
  const [createUsageMeterModalOpen, setCreateUsageMeterModalOpen] =
    useState(false)

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

  return (
    <div className="w-full flex flex-col gap-5">
      <TableTitle
        title="Usage Meters"
        buttonLabel="Create Usage Meter"
        buttonIcon={<Plus size={8} strokeWidth={2} />}
        buttonOnClick={() => setCreateUsageMeterModalOpen(true)}
      />
      <Table
        columns={columns}
        data={data}
        className="bg-nav"
        bordered
      />
      <CreateUsageMeterModal
        isOpen={createUsageMeterModalOpen}
        setIsOpen={setCreateUsageMeterModalOpen}
      />
    </div>
  )
}

export default UsageMetersTable
