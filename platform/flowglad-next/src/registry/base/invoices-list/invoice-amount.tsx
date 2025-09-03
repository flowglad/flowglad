'use client'

import * as React from 'react'
import { cn } from '@/registry/lib/cn'
import { formatCurrency } from '@/registry/lib/currency'

interface InvoiceAmountProps {
  amount: number
  currency: string
  className?: string
}

export function InvoiceAmount({
  amount,
  currency,
  className,
}: InvoiceAmountProps) {
  const formattedAmount = formatCurrency(amount, currency)

  return (
    <span className={cn('text-sm font-medium', className)}>
      {formattedAmount}
    </span>
  )
}
