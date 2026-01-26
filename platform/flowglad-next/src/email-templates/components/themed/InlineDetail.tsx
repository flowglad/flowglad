import type * as React from 'react'

const labelStyle: React.CSSProperties = {
  fontWeight: 600,
}

export interface InlineDetailProps {
  /** The label text (e.g., "Order #") */
  label: string
  /** The value text (e.g., "381353") */
  value: string
  /** Optional data-testid for testing */
  dataTestId?: string
}

/**
 * Inline label + value component for compact detail display.
 * Renders as: **Label:** Value<br />
 *
 * @example
 * ```tsx
 * <Paragraph>
 *   <InlineDetail label="Order #" value="381353" />
 *   <InlineDetail label="Date" value="21 Jan 2026" />
 *   <InlineDetail label="Payment" value="$4.99 from VISA •••• 4242" />
 * </Paragraph>
 * ```
 */
export const InlineDetail = ({
  label,
  value,
  dataTestId,
}: InlineDetailProps) => {
  return (
    <>
      <strong style={labelStyle} data-testid={dataTestId}>
        {label}:
      </strong>{' '}
      {value}
      <br />
    </>
  )
}
