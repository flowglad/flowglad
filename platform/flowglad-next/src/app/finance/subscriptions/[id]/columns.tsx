'use client'

import * as React from 'react'
import { ColumnDef } from '@tanstack/react-table'
// UI components
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
// Other imports
import { SubscriptionItem } from '@/db/schema/subscriptionItems'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { CurrencyCode } from '@/types'
import core from '@/utils/core'

export const columns: ColumnDef<SubscriptionItem.ClientRecord>[] = [
  {
    id: 'name',
    accessorFn: (row) => row.name,
    header: 'Name',
    cell: ({ row }) => <div>{row.getValue('name')}</div>,
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
      const formatted =
        stripeCurrencyAmountToHumanReadableCurrencyAmount(
          CurrencyCode.USD,
          unitPrice
        )
      return <div>{formatted}</div>
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
    size: 125,
    minSize: 125,
    maxSize: 150,
  },
  {
    id: 'id',
    accessorFn: (row) => row.id,
    header: 'ID',
    cell: ({ row }) => {
      const id = row.getValue('id') as string
      return (
        <DataTableCopyableCell copyText={id}>
          {id}
        </DataTableCopyableCell>
      )
    },
    size: 180,
    minSize: 125,
    maxSize: 250,
  },
]
