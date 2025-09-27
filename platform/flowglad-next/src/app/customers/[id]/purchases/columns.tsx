'use client'

import * as React from 'react'
import { ColumnDef } from '@tanstack/react-table'
// UI components
import { Badge } from '@/components/ui/badge'
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
// Other imports
import { Purchase } from '@/db/schema/purchases'
import { Customer } from '@/db/schema/customers'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { CurrencyCode } from '@/types'
import core from '@/utils/core'

export type PurchaseTableRowData = {
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
    badgeClassName =
      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
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
    cell: ({ row }) => (
      <div className="truncate">{row.getValue('name')}</div>
    ),
    size: 300,
    minSize: 120,
    maxSize: 350,
  },
  {
    id: 'status',
    accessorFn: (row) => row.purchase.status,
    header: 'Status',
    cell: ({ row }) => {
      const purchase = row.original.purchase
      return <PurchaseStatusCell purchase={purchase} />
    },
    size: 110,
    minSize: 105,
    maxSize: 115,
  },
  {
    id: 'revenue',
    accessorFn: (row) => row.revenue,
    header: 'Revenue',
    cell: ({ row }) => {
      const revenue = row.getValue('revenue') as number | undefined
      return (
        <div className="font-normal whitespace-nowrap">
          {stripeCurrencyAmountToHumanReadableCurrencyAmount(
            CurrencyCode.USD,
            revenue ?? 0
          )}
        </div>
      )
    },
    size: 100,
    minSize: 80,
    maxSize: 120,
  },
  {
    id: 'customer',
    accessorFn: (row) => row.customer.name || row.customer.email,
    header: 'Customer',
    cell: ({ row }) => {
      const customer = row.original.customer
      return (
        <div className="truncate">
          {customer.name.length === 0
            ? customer.email
            : customer.name}
        </div>
      )
    },
    size: 180,
    minSize: 120,
    maxSize: 220,
  },
  {
    id: 'purchaseDate',
    accessorFn: (row) => row.purchase.purchaseDate,
    header: 'Purchase Date',
    cell: ({ row }) => {
      const date = row.getValue('purchaseDate') as Date | null
      return (
        <div className="whitespace-nowrap">
          {date ? core.formatDate(date) : '-'}
        </div>
      )
    },
    size: 100,
    minSize: 100,
    maxSize: 150,
  },
  {
    id: 'id',
    accessorFn: (row) => row.purchase.id,
    header: 'ID',
    cell: ({ row }) => {
      const id = row.getValue('id') as string
      return (
        <DataTableCopyableCell copyText={id}>
          {id}
        </DataTableCopyableCell>
      )
    },
    size: 120,
    minSize: 80,
    maxSize: 180,
  },
]
