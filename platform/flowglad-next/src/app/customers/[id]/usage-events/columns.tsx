'use client'

import * as React from 'react'
import { ColumnDef } from '@tanstack/react-table'

import { UsageEvent } from '@/db/schema/usageEvents'
import { Customer } from '@/db/schema/customers'
import { Subscription } from '@/db/schema/subscriptions'
import { UsageMeter } from '@/db/schema/usageMeters'
import { Price } from '@/db/schema/prices'
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import core from '@/utils/core'

interface UsageEventRow {
  usageEvent: UsageEvent.ClientRecord
  customer: Customer.ClientRecord
  subscription: Subscription.ClientRecord
  usageMeter: UsageMeter.ClientRecord
  price: Price.ClientRecord
}

export const columns: ColumnDef<UsageEventRow>[] = [
  {
    id: 'usageMeterName',
    accessorFn: (row) => row.usageMeter.name,
    header: 'Usage Meter',
    size: 200,
    minSize: 150,
    maxSize: 250,
    cell: ({ row }) => (
      <div
        className="truncate"
        title={row.getValue('usageMeterName')}
      >
        {row.getValue('usageMeterName')}
      </div>
    ),
  },
  {
    id: 'amount',
    accessorFn: (row) => row.usageEvent.amount,
    header: 'Amount',
    size: 100,
    minSize: 80,
    maxSize: 120,
    cell: ({ row }) => (
      <div className="truncate" title={row.getValue('amount')}>
        {row.getValue('amount')}
      </div>
    ),
  },
  {
    id: 'usageDate',
    accessorFn: (row) => row.usageEvent.usageDate,
    header: 'Usage Date',
    size: 125,
    minSize: 125,
    maxSize: 125,
    cell: ({ row }) => {
      const date = row.getValue('usageDate') as Date | null
      return (
        <div
          className="w-[125px] max-w-[125px] min-w-[125px] overflow-hidden whitespace-nowrap text-ellipsis box-border"
          style={{
            width: '125px',
            maxWidth: '125px',
            minWidth: '125px',
          }}
        >
          {date ? core.formatDate(date) : '-'}
        </div>
      )
    },
  },
  {
    id: 'transactionId',
    accessorFn: (row) => row.usageEvent.transactionId,
    header: 'Transaction ID',
    size: 150,
    minSize: 120,
    maxSize: 180,
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()}>
        <DataTableCopyableCell
          copyText={row.getValue('transactionId')}
        >
          {row.getValue('transactionId')}
        </DataTableCopyableCell>
      </div>
    ),
  },
  {
    id: 'subscriptionId',
    accessorFn: (row) => row.subscription.id,
    header: 'Subscription',
    size: 180,
    minSize: 150,
    maxSize: 200,
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()}>
        <DataTableCopyableCell
          copyText={row.getValue('subscriptionId')}
        >
          {row.getValue('subscriptionId')}
        </DataTableCopyableCell>
      </div>
    ),
  },
  {
    id: 'priceId',
    accessorFn: (row) => row.price.id,
    header: 'Price',
    size: 180,
    minSize: 150,
    maxSize: 200,
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()}>
        <DataTableCopyableCell copyText={row.getValue('priceId')}>
          {row.getValue('priceId')}
        </DataTableCopyableCell>
      </div>
    ),
  },
  {
    id: 'usageEventId',
    accessorFn: (row) => row.usageEvent.id,
    header: 'ID',
    size: 180,
    minSize: 125,
    maxSize: 250,
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()}>
        <DataTableCopyableCell
          copyText={row.getValue('usageEventId')}
        >
          {row.getValue('usageEventId')}
        </DataTableCopyableCell>
      </div>
    ),
  },
]
