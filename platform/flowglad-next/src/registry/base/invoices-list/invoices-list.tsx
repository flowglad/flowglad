'use client'

import * as React from 'react'
import { cn } from '@/utils/core'
import { InvoiceRow } from './invoice-row'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { Invoice, InvoicesListProps } from './types'
import { sortInvoices } from './utils'

export function InvoicesList({
  invoices,
  onInvoiceClick,
  onDownload,
  loading = false,
  pagination,
  className,
  ...props
}: InvoicesListProps & React.HTMLAttributes<HTMLDivElement>) {
  const [sortColumn, setSortColumn] = React.useState<
    keyof Invoice | null
  >(null)
  const [sortDirection, setSortDirection] = React.useState<
    'asc' | 'desc'
  >('desc')

  const handleSort = (column: keyof Invoice) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('desc')
    }
  }

  const sortedInvoices = React.useMemo(() => {
    if (!sortColumn) return invoices

    return sortInvoices({ invoices, sortColumn, sortDirection })
  }, [invoices, sortColumn, sortDirection])

  if (loading) {
    return (
      <div className={cn('space-y-4', className)} {...props}>
        <div className="rounded-lg border">
          <div className="space-y-2 p-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!invoices || invoices.length === 0) {
    return (
      <div
        className={cn('rounded-lg border p-8', className)}
        {...props}
      >
        <div className="text-center">
          <svg
            className="mx-auto h-12 w-12 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-semibold">
            No invoices found
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Your invoices will appear here once generated.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', className)} {...props}>
      <div className="rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b bg-muted/50">
              <tr>
                <th
                  className="cursor-pointer px-4 py-3 text-left text-sm font-medium hover:bg-muted/70"
                  onClick={() => handleSort('number')}
                >
                  <div className="flex items-center gap-1">
                    Invoice
                    {sortColumn === 'number' && (
                      <span className="text-xs">
                        {sortDirection === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
                <th
                  className="cursor-pointer px-4 py-3 text-left text-sm font-medium hover:bg-muted/70"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center gap-1">
                    Status
                    {sortColumn === 'status' && (
                      <span className="text-xs">
                        {sortDirection === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
                <th
                  className="cursor-pointer px-4 py-3 text-left text-sm font-medium hover:bg-muted/70"
                  onClick={() => handleSort('created')}
                >
                  <div className="flex items-center gap-1">
                    Date
                    {sortColumn === 'created' && (
                      <span className="text-xs">
                        {sortDirection === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
                <th
                  className="cursor-pointer px-4 py-3 text-left text-sm font-medium hover:bg-muted/70"
                  onClick={() => handleSort('amountDue')}
                >
                  <div className="flex items-center gap-1">
                    Amount
                    {sortColumn === 'amountDue' && (
                      <span className="text-xs">
                        {sortDirection === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedInvoices.map((invoice) => (
                <InvoiceRow
                  key={invoice.id}
                  invoice={invoice}
                  onInvoiceClick={onInvoiceClick}
                  onDownload={onDownload}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {pagination && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(pagination.page - 1) * pagination.pageSize + 1}{' '}
            to{' '}
            {Math.min(
              pagination.page * pagination.pageSize,
              pagination.total
            )}{' '}
            of {pagination.total} invoices
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                pagination.onPageChange(pagination.page - 1)
              }
              disabled={pagination.page === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                pagination.onPageChange(pagination.page + 1)
              }
              disabled={
                pagination.page * pagination.pageSize >=
                pagination.total
              }
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
