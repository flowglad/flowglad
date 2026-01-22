import { Hr } from '@react-email/components'
import type * as React from 'react'

export interface DividerProps {
  /** Top margin - defaults to '16px' */
  marginTop?: string
  /** Bottom margin - defaults to '16px' */
  marginBottom?: string
  /** Border color - defaults to '#e6e6e6' */
  color?: string
  /** Custom styles to apply */
  style?: React.CSSProperties
}

/**
 * Divider component for email templates.
 *
 * Provides a horizontal rule with customizable margins and color.
 *
 * @example
 * ```tsx
 * // Default divider
 * <Divider />
 *
 * // Custom margins
 * <Divider marginTop="32px" marginBottom="32px" />
 *
 * // Custom color
 * <Divider color="#cccccc" />
 * ```
 */
export const Divider = ({
  marginTop = '16px',
  marginBottom = '16px',
  color = '#e6e6e6',
  style,
}: DividerProps) => {
  const dividerStyle: React.CSSProperties = {
    borderColor: color,
    borderTop: 'none',
    borderLeft: 'none',
    borderRight: 'none',
    borderBottomWidth: '1px',
    borderBottomStyle: 'dashed',
    marginTop,
    marginBottom,
    ...style,
  }

  return <Hr style={dividerStyle} data-testid="divider" />
}
