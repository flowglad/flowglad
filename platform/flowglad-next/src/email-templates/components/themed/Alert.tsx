import { Section, Text } from '@react-email/components'
import type * as React from 'react'

export type AlertVariant = 'info' | 'warning' | 'error' | 'success'

export interface AlertProps {
  /** The visual variant of the alert */
  variant?: AlertVariant
  /** Alert title (optional) */
  title?: string
  /** Alert content */
  children: React.ReactNode
  /** Custom styles to apply to the container */
  style?: React.CSSProperties
}

const variantStyles: Record<AlertVariant, React.CSSProperties> = {
  info: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
    color: '#1e40af',
  },
  warning: {
    backgroundColor: '#fffbeb',
    borderColor: '#f59e0b',
    color: '#92400e',
  },
  error: {
    backgroundColor: '#fef2f2',
    borderColor: '#ef4444',
    color: '#991b1b',
  },
  success: {
    backgroundColor: '#f0fdf4',
    borderColor: '#22c55e',
    color: '#166534',
  },
}

const baseContainerStyle: React.CSSProperties = {
  padding: '16px',
  borderRadius: '8px',
  borderWidth: '1px',
  borderStyle: 'solid',
  marginTop: '16px',
  marginBottom: '16px',
}

const titleStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 'bold',
  margin: '0 0 8px 0',
}

const contentStyle: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '20px',
  margin: 0,
}

/**
 * Alert component for email templates.
 *
 * Provides visual highlighting for important information, warnings,
 * errors, or success messages.
 *
 * @example
 * ```tsx
 * // Info alert
 * <Alert variant="info" title="Note">
 *   Your subscription will renew automatically.
 * </Alert>
 *
 * // Warning alert
 * <Alert variant="warning">
 *   Your payment method is about to expire.
 * </Alert>
 *
 * // Error alert
 * <Alert variant="error" title="Payment Failed">
 *   We were unable to process your payment.
 * </Alert>
 *
 * // Success alert
 * <Alert variant="success">
 *   Your subscription has been updated successfully.
 * </Alert>
 * ```
 */
export const Alert = ({
  variant = 'info',
  title,
  children,
  style,
}: AlertProps) => {
  const variantStyle = variantStyles[variant]

  const containerStyle: React.CSSProperties = {
    ...baseContainerStyle,
    ...variantStyle,
    ...style,
  }

  return (
    <Section style={containerStyle} data-testid={`alert-${variant}`}>
      {title && (
        <Text
          style={{
            ...titleStyle,
            color: variantStyle.color,
          }}
          data-testid="alert-title"
        >
          {title}
        </Text>
      )}
      <Text
        style={{
          ...contentStyle,
          color: variantStyle.color,
        }}
        data-testid="alert-content"
      >
        {children}
      </Text>
    </Section>
  )
}
