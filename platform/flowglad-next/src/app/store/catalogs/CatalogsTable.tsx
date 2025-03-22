'use client'

import { useMemo } from 'react'
import Table, {
  type ColumnDefWithWidth,
} from '@/components/ion/Table'
import SortableColumnHeaderCell from '@/components/ion/SortableColumnHeaderCell'
import Badge from '@/components/ion/Badge'
import { Catalog } from '@/db/schema/catalogs'

const CatalogsTable = ({ data }: { data: Catalog.TableRow[] }) => {
  const columns = useMemo(
    () =>
      [
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell title="Name" column={column} />
          ),
          accessorKey: 'catalog.name',
          width: '20%',
          cell: ({ row: { original: cellData } }) => (
            <div className="flex items-center gap-2">
              <span className="text-sm">{cellData.catalog.name}</span>
              {cellData.catalog.isDefault && (
                <Badge color="green" size="sm">
                  Default
                </Badge>
              )}
            </div>
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Products"
              column={column}
            />
          ),
          accessorKey: 'productsCount',
          width: '30%',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.productsCount}</span>
          ),
        },
      ] as ColumnDefWithWidth<Catalog.TableRow, string>[],
    []
  )

  return (
    <Table
      columns={columns}
      data={data}
      className="bg-nav"
      bordered
    />
  )
}

export default CatalogsTable
