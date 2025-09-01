'use client'

import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/utils/core'
import type { InvoiceStatus } from '../types'

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
          className: 'bg-green-500 hover:bg-green-600 text-white',
        }
      case 'open':
        return {
          label: 'Open',
          variant: 'secondary' as const,
          className: 'bg-yellow-500 hover:bg-yellow-600 text-white',
        }
      case 'void':
        return {
          label: 'Void',
          variant: 'secondary' as const,
          className: 'bg-gray-500 hover:bg-gray-600 text-white',
        }
      case 'uncollectible':
        return {
          label: 'Uncollectible',
          variant: 'destructive' as const,
          className: '',
        }
      case 'draft':
        return {
          label: 'Draft',
          variant: 'outline' as const,
          className: '',
        }
      default:
        const unknownStatus = status as string
        return {
          label:
            unknownStatus.charAt(0).toUpperCase() +
            unknownStatus.slice(1),
          variant: 'secondary' as const,
          className: '',
        }
    }
  }

  const config = getStatusConfig(status)

  return (
    <Badge
      variant={config.variant}
      className={cn(config.className, className)}
    >
      {config.label}
    </Badge>
  )
}
