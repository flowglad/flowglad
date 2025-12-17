'use client'

import type { ColumnDef } from '@tanstack/react-table'
import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import type { Customer } from '@/db/schema/customers'
import type { Purchase } from '@/db/schema/purchases'
import { CurrencyCode } from '@/types'
import core from '@/utils/core'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'

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
    cell: ({ row }) => (
      <div className="truncate" title={row.getValue('name')}>
        {row.getValue('name')}
      </div>
    ),
    size: 300,
    minSize: 150,
    maxSize: 400,
  },
  {
    id: 'status',
    accessorFn: (row) => row.purchase,
    header: 'Status',
    cell: ({ row }) => {
      const purchase = row.getValue('status') as Purchase.ClientRecord
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
        <div className="whitespace-nowrap">
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
    id: 'customerName',
    accessorFn: (row) => row.customer.name || row.customer.email,
    header: 'Customer',
    cell: ({ row }) => (
      <div className="truncate" title={row.getValue('customerName')}>
        {row.getValue('customerName')}
      </div>
    ),
    size: 150,
    minSize: 120,
    maxSize: 200,
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
    size: 125,
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
        <div onClick={(e) => e.stopPropagation()}>
          <DataTableCopyableCell copyText={id}>
            {id}
          </DataTableCopyableCell>
        </div>
      )
    },
    size: 180,
    minSize: 125,
    maxSize: 250,
  },
]
