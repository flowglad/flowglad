'use client'
import { useMemo } from 'react'
import { DisplayColumnDef } from '@tanstack/react-table'
import Table from '@/components/ion/Table'
import ColumnHeaderCell from '@/components/ion/ColumnHeaderCell'
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
          header: ({ column }) => (
            <ColumnHeaderCell title="Name" column={column} />
          ),
          accessorKey: 'name' as const,
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.name}</span>
          ),
        },
        {
          header: ({ column }) => (
            <ColumnHeaderCell title="Quantity" column={column} />
          ),
          accessorKey: 'quantity' as const,
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.quantity}</span>
          ),
        },
        {
          header: ({ column }) => (
            <ColumnHeaderCell
              title="Per Unit Price"
              column={column}
            />
          ),
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
          header: ({ column }) => (
            <ColumnHeaderCell title="Added Date" column={column} />
          ),
          accessorKey: 'addedDate' as const,
          cell: ({ row: { original: cellData } }) => (
            <>{core.formatDate(cellData.addedDate)}</>
          ),
        },
        {
          header: ({ column }) => (
            <ColumnHeaderCell title="ID" column={column} />
          ),
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
    <Table
      columns={columns}
      data={tableData}
      className="bg-background"
      bordered
    />
  )
}

export default SubscriptionItemsTable
