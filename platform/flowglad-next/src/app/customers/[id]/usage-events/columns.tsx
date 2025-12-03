'use client'

import type { ColumnDef } from '@tanstack/react-table'
import * as React from 'react'
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import type { Customer } from '@/db/schema/customers'
import type { Price } from '@/db/schema/prices'
import type { Subscription } from '@/db/schema/subscriptions'
import type { UsageEvent } from '@/db/schema/usageEvents'
import type { UsageMeter } from '@/db/schema/usageMeters'
import core from '@/utils/core'

export type UsageEventTableRowData = {
  usageEvent: UsageEvent.ClientRecord
  customer: Customer.ClientRecord
  subscription: Subscription.ClientRecord
  usageMeter: UsageMeter.ClientRecord
  price: Price.ClientRecord
}

export const columns: ColumnDef<UsageEventTableRowData>[] = [
  {
    id: 'usageMeterName',
    accessorFn: (row) => row.usageMeter.name,
    header: 'Usage Meter',
    cell: ({ row }) => (
      <div
        className="truncate"
        title={row.getValue('usageMeterName')}
      >
        {row.getValue('usageMeterName')}
      </div>
    ),
    size: 200,
    minSize: 150,
    maxSize: 250,
  },
  {
    id: 'amount',
    accessorFn: (row) => row.usageEvent.amount,
    header: 'Amount',
    cell: ({ row }) => {
      const amount = row.getValue('amount') as number
      return <div className="font-medium">{amount}</div>
    },
    size: 100,
    minSize: 80,
    maxSize: 120,
  },
  {
    id: 'usageDate',
    accessorFn: (row) => row.usageEvent.usageDate,
    header: 'Usage Date',
    cell: ({ row }) => {
      const date = row.getValue('usageDate') as Date | null
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
    id: 'transactionId',
    accessorFn: (row) => row.usageEvent.transactionId,
    header: 'Transaction ID',
    cell: ({ row }) => {
      const transactionId = row.getValue('transactionId') as string
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <DataTableCopyableCell copyText={transactionId}>
            {transactionId}
          </DataTableCopyableCell>
        </div>
      )
    },
    size: 150,
    minSize: 120,
    maxSize: 180,
  },
  {
    id: 'subscriptionId',
    accessorFn: (row) => row.subscription.id,
    header: 'Subscription',
    cell: ({ row }) => {
      const subscriptionId = row.getValue('subscriptionId') as string
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <DataTableCopyableCell copyText={subscriptionId}>
            {subscriptionId}
          </DataTableCopyableCell>
        </div>
      )
    },
    size: 180,
    minSize: 150,
    maxSize: 200,
  },
  {
    id: 'priceId',
    accessorFn: (row) => row.price.id,
    header: 'Price',
    cell: ({ row }) => {
      const priceId = row.getValue('priceId') as string
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <DataTableCopyableCell copyText={priceId}>
            {priceId}
          </DataTableCopyableCell>
        </div>
      )
    },
    size: 180,
    minSize: 150,
    maxSize: 200,
  },
  {
    id: 'id',
    accessorFn: (row) => row.usageEvent.id,
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
