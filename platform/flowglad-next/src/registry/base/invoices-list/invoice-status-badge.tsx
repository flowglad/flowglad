'use client'

import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/registry/lib/cn'
import type { InvoiceStatus } from './types'

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus
  className?: string
}

export function InvoiceStatusBadge({
  status,
  className,
}: InvoiceStatusBadgeProps) {
  const getStatusConfig = (status: InvoiceStatus) => {
    switch (status) {
      case 'paid':
        return {
          label: 'Paid',
          variant: 'default' as const,
        }
      case 'open':
        return {
          label: 'Open',
          variant: 'secondary' as const,
        }
      case 'void':
        return {
          label: 'Void',
          variant: 'secondary' as const,
        }
      case 'uncollectible':
        return {
          label: 'Uncollectible',
          variant: 'destructive' as const,
        }
      case 'draft':
        return {
          label: 'Draft',
          variant: 'outline' as const,
        }
    }
    // Exhaustiveness check to catch future changes to InvoiceStatus
    // @ts-expect-error - This is a catch-all for future changes to InvoiceStatus
    const _exhaustiveStatus: never = status
    // biome-ignore lint/plugin: Exhaustive switch check - unreachable by design
    throw new Error(`Unhandled invoice status: ${_exhaustiveStatus}`)
  }

  const config = getStatusConfig(status)

  return (
    <Badge variant={config.variant} className={cn(className)}>
      {config.label}
    </Badge>
  )
}
