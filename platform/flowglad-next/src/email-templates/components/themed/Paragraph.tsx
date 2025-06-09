import { Text } from '@react-email/components'
import * as React from 'react'

const paragraph = {
  color: '#333',
  fontSize: '14px',
  margin: '0 0 20px',
}

export const Paragraph = ({
  children,
  style,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
}) => {
  return <Text style={{ ...paragraph, ...style }}>{children}</Text>
}
