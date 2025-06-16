import { Text } from '@react-email/components'
import * as React from 'react'

const detailsValue = {
  color: '#32325d',
  fontSize: '16px',
  fontWeight: 'bold' as const,
  marginBottom: '16px',
}

export const DetailValue = ({
  children,
  style,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
}) => {
  return <Text style={{ ...detailsValue, ...style }}>{children}</Text>
}
