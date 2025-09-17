import { useMemo } from 'react'
import { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
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
          header: 'Customer',
          id: 'customer',
          size: 280,
          minSize: 220,
          maxSize: 350,
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{`${cellData.customer.name} (${cellData.customer.email})`}</span>
          ),
        },
        {
          header: 'Product',
          accessorKey: 'product',
          size: 200,
          minSize: 150,
          maxSize: 250,
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.product.name}</span>
          ),
        },
        {
          header: 'Status',
          accessorKey: 'status',
          size: 110,
          minSize: 105,
          maxSize: 115,
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">
              {cellData.purchase.status}
            </span>
          ),
        },
        {
          header: 'Date',
          accessorKey: 'purchaseDate',
          size: 125,
          minSize: 125,
          maxSize: 125,
          cell: ({ row: { original: cellData } }) => (
            <>
              {cellData.purchase.purchaseDate
                ? formatDate(cellData.purchase.purchaseDate)
                : '-'}
            </>
          ),
        },
      ] as ColumnDef<Purchase.PurchaseTableRowData>[],
    [data]
  )

  return (
    <DataTable
      columns={columns}
      data={data}
      className="bg-background"
      bordered
    />
  )
}

export default PurchasesTable
