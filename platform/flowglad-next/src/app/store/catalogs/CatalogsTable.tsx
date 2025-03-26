'use client'

import { useMemo, useState } from 'react'
import Table, {
  type ColumnDefWithWidth,
} from '@/components/ion/Table'
import SortableColumnHeaderCell from '@/components/ion/SortableColumnHeaderCell'
import Badge from '@/components/ion/Badge'
import { Catalog } from '@/db/schema/catalogs'
import TableRowPopoverMenu from '@/components/TableRowPopoverMenu'
import EditCatalogModal from '@/components/forms/EditCatalogModal'
import CloneCatalogModal from '@/components/forms/CloneCatalogModal'
import { PopoverMenuItem } from '@/components/PopoverMenu'

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
    <>
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
      <TableRowPopoverMenu items={menuItems} />
    </>
  )
}

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
        {
          id: '_',
          width: '10%',
          cell: ({ row: { original: cellData } }) => (
            <div className="flex justify-end">
              <MoreMenuCell catalog={cellData.catalog} />
            </div>
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
