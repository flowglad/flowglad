import { sentenceCase } from 'change-case'
import type React from 'react'
import { Badge } from '@/components/ui/badge'
import { InvoiceStatus } from '@/types'

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus
}

const getClassNameForStatus = (status: InvoiceStatus): string => {
  switch (status) {
    case InvoiceStatus.Draft:
      return 'bg-gray-100 text-gray-800'
    case InvoiceStatus.Open:
      return 'bg-blue-100 text-blue-800'
    case InvoiceStatus.Paid:
      return 'bg-jade-background text-jade-foreground'
    case InvoiceStatus.Uncollectible:
      return 'bg-yellow-100 text-yellow-800'
    case InvoiceStatus.Void:
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

export const InvoiceStatusBadge: React.FC<
  InvoiceStatusBadgeProps
> = ({ status }) => {
  const className = getClassNameForStatus(status)
  const displayText = sentenceCase(status)

  return (
    <Badge variant="secondary" className={className}>
      {displayText}
    </Badge>
  )
}

export default InvoiceStatusBadge
