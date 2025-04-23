'use client'

import { useMemo, useState } from 'react'
import Table, {
  type ColumnDefWithWidth,
} from '@/components/ion/Table'
import SortableColumnHeaderCell from '@/components/ion/SortableColumnHeaderCell'
import Badge from '@/components/ion/Badge'
import { Catalog } from '@/db/schema/catalogs'
import EditCatalogModal from '@/components/forms/EditCatalogModal'
import CloneCatalogModal from '@/components/forms/CloneCatalogModal'
import { PopoverMenuItem } from '@/components/PopoverMenu'
import { trpc } from '@/app/_trpc/client'
import MoreMenuTableCell from '@/components/MoreMenuTableCell'

const MoreMenuCell = ({ catalog }: { catalog: Catalog.Record }) => {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isCloneOpen, setIsCloneOpen] = useState(false)
  const menuItems: PopoverMenuItem[] = [
    {
      label: 'Edit Catalog',
      handler: () => setIsEditOpen(true),
    },
    {
      label: 'Clone Catalog',
      handler: () => setIsCloneOpen(true),
    },
  ]
  return (
    <MoreMenuTableCell items={menuItems}>
      <EditCatalogModal
        catalog={catalog}
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
      />
      <CloneCatalogModal
        isOpen={isCloneOpen}
        setIsOpen={setIsCloneOpen}
        catalog={catalog}
      />
    </MoreMenuTableCell>
  )
}

export interface CatalogsTableFilters {
  organizationId?: string
  isDefault?: boolean
}

const CatalogsTable = ({
  filters = {},
}: {
  filters?: CatalogsTableFilters
}) => {
  const [pageIndex, setPageIndex] = useState(0)
  const pageSize = 10

  const { data, isLoading, isFetching } =
    trpc.catalogs.getTableRows.useQuery({
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
        {
          id: '_',
          width: '10%',
          cell: ({ row: { original: cellData } }) => (
            <MoreMenuCell catalog={cellData.catalog} />
          ),
        },
      ] as ColumnDefWithWidth<Catalog.TableRow, string>[],
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

export default CatalogsTable
