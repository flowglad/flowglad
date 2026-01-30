import { Button } from '@react-email/components'
import type * as React from 'react'

/**
 * Brand colors from globals.css (light mode):
 * --primary: hsl(24, 5.9%, 16.7%) → #3d3833 (warm dark brown)
 * --primary-foreground: hsl(51, 46.7%, 97.1%) → #fbfaf5 (cream white)
 */
const BRAND_PRIMARY = '#3d3833'
const BRAND_PRIMARY_FOREGROUND = '#fbfaf5'

const buttonStyle: React.CSSProperties = {
  backgroundColor: BRAND_PRIMARY,
  borderRadius: '8px', // App-like corners
  color: BRAND_PRIMARY_FOREGROUND,
  fontSize: '16px',
  fontWeight: 'normal',
  padding: '12px 14px',
  textDecoration: 'none',
  textAlign: 'center',
  display: 'block', // Block display naturally fills container width
  margin: '24px 0',
}

export function EmailButton({
  children,
  href,
  backgroundColor = BRAND_PRIMARY,
  textColor = BRAND_PRIMARY_FOREGROUND,
  fontWeight = 400,
  testId,
}: {
  children: React.ReactNode
  href: string
  backgroundColor?: string
  textColor?: string
  fontWeight?: React.CSSProperties['fontWeight']
  testId?: string
}) {
  return (
    <Button
      style={{
        ...buttonStyle,
        backgroundColor,
        color: textColor,
        fontWeight,
      }}
      href={href}
      data-testid={testId}
    >
      {children}
    </Button>
  )
}
