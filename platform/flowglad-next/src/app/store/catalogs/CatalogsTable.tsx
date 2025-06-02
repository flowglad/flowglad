'use client'

import { useMemo, useState } from 'react'
import Table, {
  type ColumnDefWithWidth,
} from '@/components/ion/Table'
import ColumnHeaderCell from '@/components/ion/ColumnHeaderCell'
import Badge from '@/components/ion/Badge'
import { Catalog } from '@/db/schema/catalogs'
import EditCatalogModal from '@/components/forms/EditCatalogModal'
import CloneCatalogModal from '@/components/forms/CloneCatalogModal'
import { PopoverMenuItem } from '@/components/PopoverMenu'
import { trpc } from '@/app/_trpc/client'
import MoreMenuTableCell from '@/components/MoreMenuTableCell'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'

const MoreMenuCell = ({
  catalog,
}: {
  catalog: Catalog.ClientRecord
}) => {
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
  const {
    pageIndex,
    pageSize,
    handlePaginationChange,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<Catalog.TableRow, CatalogsTableFilters>({
    initialCurrentCursor: undefined,
    pageSize: 10,
    filters,
    useQuery: trpc.catalogs.getTableRows.useQuery,
  })

  const columns = useMemo(
    () =>
      [
        {
          header: ({ column }) => (
            <ColumnHeaderCell title="Name" column={column} />
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
          accessorKey: 'catalog.id',
          width: '30%',
          cell: ({ row: { original: cellData } }) => (
            <CopyableTextTableCell copyText={cellData.catalog.id}>
              {cellData.catalog.id}
            </CopyableTextTableCell>
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

  const tableData = data?.items || []
  const total = data?.total || 0

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
