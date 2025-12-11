'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import { DataTableLinkableCell } from '@/components/ui/data-table-linkable-cell'
import type { Customer } from '@/db/schema/customers'
import type { Purchase } from '@/db/schema/purchases'
import { CurrencyCode } from '@/types'
import { formatDate } from '@/utils/core'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'

type PurchaseTableRowData = {
  purchase: Purchase.ClientRecord
  customer: Customer.ClientRecord
  revenue?: number
}

const PurchaseStatusCell = ({
  purchase,
}: {
  purchase: Purchase.ClientRecord
}) => {
  let badgeLabel: string = 'Pending'
  let badgeClassName: string = 'bg-muted text-muted-foreground'

  if (purchase.endDate) {
    badgeClassName = 'bg-muted text-muted-foreground'
    badgeLabel = 'Concluded'
  } else if (purchase.purchaseDate) {
    badgeClassName = 'bg-jade-background text-jade-foreground'
    badgeLabel = 'Paid'
  } else {
    badgeClassName = 'bg-muted text-muted-foreground'
    badgeLabel = 'Pending'
  }

  return (
    <Badge variant="secondary" className={badgeClassName}>
      {badgeLabel}
    </Badge>
  )
}

export const columns: ColumnDef<PurchaseTableRowData>[] = [
  {
    id: 'name',
    accessorFn: (row) => row.purchase.name,
    header: 'Name',
    size: 300,
    minSize: 150,
    maxSize: 400,
    cell: ({ row }) => {
      const name = row.getValue('name') as string
      const purchaseId = row.original.purchase.id
      return (
        <DataTableLinkableCell
          href={`/finance/purchases/${purchaseId}`}
        >
          <div className="truncate" title={name}>
            {name}
          </div>
        </DataTableLinkableCell>
      )
    },
  },
  {
    id: 'customer',
    accessorFn: (row) => row.customer.name || row.customer.email,
    header: 'Customer',
    size: 220,
    minSize: 150,
    maxSize: 300,
    cell: ({ row }) => {
      const original = row.original
      const displayName =
        original.customer.name.length === 0
          ? original.customer.email
          : original.customer.name
      return (
        <DataTableLinkableCell
          href={`/customers/${original.customer.id}`}
        >
          {displayName}
        </DataTableLinkableCell>
      )
    },
  },
  {
    id: 'status',
    accessorFn: (row) =>
      row.purchase.endDate
        ? 'Concluded'
        : row.purchase.purchaseDate
          ? 'Paid'
          : 'Pending',
    header: 'Status',
    size: 100,
    minSize: 80,
    maxSize: 120,
    cell: ({ row }) => {
      const purchase = row.original.purchase
      return <PurchaseStatusCell purchase={purchase} />
    },
  },
  {
    id: 'revenue',
    accessorFn: (row) => row.revenue ?? 0,
    header: 'Revenue',
    size: 120,
    minSize: 100,
    maxSize: 150,
    cell: ({ row }) => {
      const amount = row.getValue('revenue') as number
      const formatted =
        stripeCurrencyAmountToHumanReadableCurrencyAmount(
          CurrencyCode.USD,
          amount
        )
      return <div>{formatted}</div>
    },
  },
  {
    id: 'purchaseDate',
    accessorFn: (row) => row.purchase.purchaseDate,
    header: 'Purchase Date',
    size: 140,
    minSize: 125,
    maxSize: 160,
    cell: ({ row }) => {
      const date = row.getValue('purchaseDate') as Date | null
      return <div>{date ? formatDate(date) : '-'}</div>
    },
  },
  {
    id: 'id',
    accessorFn: (row) => row.purchase.id,
    header: 'ID',
    size: 200,
    minSize: 150,
    maxSize: 300,
    cell: ({ row }) => {
      const id = row.getValue('id') as string
      return (
        <DataTableCopyableCell copyText={id}>
          {id}
        </DataTableCopyableCell>
      )
    },
  },
]
