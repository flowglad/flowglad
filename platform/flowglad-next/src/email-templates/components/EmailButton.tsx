import * as React from 'react'
import { Button } from '@react-email/components'

const buttonStyle = {
  backgroundColor: '#000',
  borderRadius: '3px',
  color: '#fff',
  fontSize: '16px',
  padding: '8px 24px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  width: '100%',
  margin: '30px 0',
}

export function EmailButton({
  children,
  href,
  backgroundColor = '#000',
  textColor = '#fff',
  testId,
}: {
  children: React.ReactNode
  href: string
  backgroundColor?: string
  textColor?: string
  testId?: string
}) {
  return (
    <Button
      style={{ ...buttonStyle, backgroundColor, color: textColor }}
      href={href}
      data-testid={testId}
    >
      {children}
    </Button>
  )
}
