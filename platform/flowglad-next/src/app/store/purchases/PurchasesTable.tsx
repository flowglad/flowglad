import { useMemo } from 'react'
import { DisplayColumnDef } from '@tanstack/react-table'
import Table from '@/components/ion/Table'
import SortableColumnHeaderCell from '@/components/ion/SortableColumnHeaderCell'
import { formatDate } from '@/utils/core'
import { Purchase } from '@/db/schema/purchases'

const PurchasesTable = ({
  data,
}: {
  data: Purchase.PurchaseTableRowData[]
}) => {
  const columns = useMemo(
    () =>
      [
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Customer"
              column={column}
            />
          ),
          id: 'customer',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{`${cellData.customer.name} (${cellData.customer.email})`}</span>
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Product"
              column={column}
            />
          ),
          accessorKey: 'product',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.product.name}</span>
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Status"
              column={column}
            />
          ),
          accessorKey: 'status',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">
              {cellData.purchase.status}
            </span>
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell title="Date" column={column} />
          ),
          accessorKey: 'purchaseDate',
          cell: ({ row: { original: cellData } }) => (
            <>
              {cellData.purchase.purchaseDate
                ? formatDate(cellData.purchase.purchaseDate)
                : '-'}
            </>
          ),
        },
      ] as DisplayColumnDef<Purchase.PurchaseTableRowData>[],
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

export default PurchasesTable
