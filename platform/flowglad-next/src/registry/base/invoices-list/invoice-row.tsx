'use client'

import * as React from 'react'
import { cn } from '@/utils/core'
import { Button } from '@/components/ui/button'
import { InvoiceStatusBadge } from './invoice-status-badge'
import { InvoiceAmount } from './invoice-amount'
import type { Invoice } from './types'
import { formatDate } from './utils'

interface InvoiceRowProps {
  invoice: Invoice
  onInvoiceClick?: (invoiceId: string) => void
  onDownload?: (invoiceId: string) => void
}

export function InvoiceRow({
  invoice,
  onInvoiceClick,
  onDownload,
}: InvoiceRowProps) {
  const handleRowClick = () => {
    if (onInvoiceClick) {
      onInvoiceClick(invoice.id)
    }
  }

  const handleDownloadClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onDownload) {
      onDownload(invoice.id)
    }
  }

  return (
    <tr
      className={cn(
        'group transition-colors',
        onInvoiceClick && 'cursor-pointer hover:bg-muted/50'
      )}
      onClick={handleRowClick}
    >
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium">
            {invoice.number ||
              `INV-${invoice.id.slice(-8).toUpperCase()}`}
          </span>
          {invoice.description && (
            <span className="text-xs text-muted-foreground">
              {invoice.description}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <InvoiceStatusBadge status={invoice.status} />
      </td>
      <td className="px-4 py-3">
        <span className="text-sm text-muted-foreground">
          {formatDate(invoice.created)}
        </span>
      </td>
      <td className="px-4 py-3">
        <InvoiceAmount
          amount={invoice.amountDue}
          currency={invoice.currency}
        />
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          {onDownload && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDownloadClick}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                />
              </svg>
              <span className="ml-1">Download</span>
            </Button>
          )}
          {onInvoiceClick && (
            <svg
              className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          )}
        </div>
      </td>
    </tr>
  )
}
