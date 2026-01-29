'use client'

import type { ColumnDef } from '@tanstack/react-table'
import * as React from 'react'
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import type { CurrencyCode } from '@/types'
import core from '@/utils/core'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'

export const columns = (
  currencyCode: CurrencyCode
): ColumnDef<SubscriptionItem.ClientRecord>[] => [
  {
    id: 'name',
    accessorFn: (row) => row.name,
    header: 'Name',
    cell: ({ row }) => (
      <div className="truncate" title={row.getValue('name')}>
        {row.getValue('name')}
      </div>
    ),
    size: 200,
    minSize: 150,
    maxSize: 300,
  },
  {
    id: 'quantity',
    accessorFn: (row) => row.quantity,
    header: 'Quantity',
    cell: ({ row }) => <div>{row.getValue('quantity')}</div>,
    size: 100,
    minSize: 80,
    maxSize: 120,
  },
  {
    id: 'unitPrice',
    accessorFn: (row) => row.unitPrice,
    header: 'Per Unit Price',
    cell: ({ row }) => {
      const unitPrice = row.getValue('unitPrice') as number
      return (
        <div className="whitespace-nowrap">
          {stripeCurrencyAmountToHumanReadableCurrencyAmount(
            currencyCode,
            unitPrice
          )}
        </div>
      )
    },
    size: 120,
    minSize: 100,
    maxSize: 150,
  },
  {
    id: 'addedDate',
    accessorFn: (row) => row.addedDate,
    header: 'Added Date',
    cell: ({ row }) => {
      const date = row.getValue('addedDate') as Date
      return (
        <div className="whitespace-nowrap">
          {core.formatDate(date)}
        </div>
      )
    },
    size: 100,
    minSize: 100,
    maxSize: 150,
  },
  {
    id: 'id',
    accessorFn: (row) => row.id,
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
