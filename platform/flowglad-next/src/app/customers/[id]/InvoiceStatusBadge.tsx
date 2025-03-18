import React from 'react'
import { Badge } from '@/components/ion/Badge'
import { InvoiceStatus } from '@/types'
import { sentenceCase } from 'change-case'

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus
}

const getColorForStatus = (
  status: InvoiceStatus
): 'blue' | 'green' | 'yellow' | 'red' | 'grey' => {
  switch (status) {
    case InvoiceStatus.Draft:
      return 'grey'
    case InvoiceStatus.Open:
      return 'blue'
    case InvoiceStatus.Paid:
      return 'green'
    case InvoiceStatus.Uncollectible:
      return 'yellow'
    case InvoiceStatus.Void:
      return 'red'
    default:
      return 'grey'
  }
}

export const InvoiceStatusBadge: React.FC<
  InvoiceStatusBadgeProps
> = ({ status }) => {
  const color = getColorForStatus(status)
  const displayText = sentenceCase(status)

  return (
    <Badge color={color} variant="soft">
      {displayText}
    </Badge>
  )
}

export default InvoiceStatusBadge
