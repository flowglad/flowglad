'use client'
import { useMemo } from 'react'
import { DisplayColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { SubscriptionItem } from '@/db/schema/subscriptionItems'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import core from '@/utils/core'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { useAuthContext } from '@/contexts/authContext'

export interface SubscriptionItemsTableFilters {
  subscriptionId?: string
}

const SubscriptionItemsTable = ({
  subscriptionItems,
}: {
  subscriptionItems: SubscriptionItem.ClientRecord[]
}) => {
  const { organization } = useAuthContext()

  const columns = useMemo(
    () =>
      [
        {
          header: 'Name',
          accessorKey: 'name' as const,
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.name}</span>
          ),
        },
        {
          header: 'Quantity',
          accessorKey: 'quantity' as const,
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.quantity}</span>
          ),
        },
        {
          header: 'Per Unit Price',
          accessorKey: 'unitPrice' as const,
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">
              {organization &&
                stripeCurrencyAmountToHumanReadableCurrencyAmount(
                  organization.defaultCurrency,
                  cellData.unitPrice
                )}
            </span>
          ),
        },
        {
          header: 'Added Date',
          accessorKey: 'addedDate' as const,
          cell: ({ row: { original: cellData } }) => (
            <>{core.formatDate(cellData.addedDate)}</>
          ),
        },
        {
          header: 'ID',
          id: 'id' as const,
          cell: ({ row: { original: cellData } }) => (
            <CopyableTextTableCell copyText={cellData.id}>
              {cellData.id}
            </CopyableTextTableCell>
          ),
        },
      ] as DisplayColumnDef<SubscriptionItem.ClientRecord>[],
    [organization]
  )

  const tableData = subscriptionItems

  return (
    <DataTable
      columns={columns}
      data={tableData}
      className="bg-background"
    />
  )
}

export default SubscriptionItemsTable
