import { useMemo } from 'react'
import { DisplayColumnDef } from '@tanstack/react-table'
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
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{`${cellData.customer.name} (${cellData.customer.email})`}</span>
          ),
        },
        {
          header: 'Product',
          accessorKey: 'product',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.product.name}</span>
          ),
        },
        {
          header: 'Status',
          accessorKey: 'status',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">
              {cellData.purchase.status}
            </span>
          ),
        },
        {
          header: 'Date',
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
    <DataTable
      columns={columns}
      data={data}
      className="bg-background"
      bordered
    />
  )
}

export default PurchasesTable
