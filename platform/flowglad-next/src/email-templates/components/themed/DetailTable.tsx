import {
  Column,
  Link,
  Row,
  Section,
  Text,
} from '@react-email/components'
import type * as React from 'react'

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  margin: '24px 0',
}

const labelCellStyle: React.CSSProperties = {
  textAlign: 'right',
  paddingRight: '16px',
  paddingTop: '6px',
  paddingBottom: '6px',
  verticalAlign: 'top',
  width: '40%',
}

const valueCellStyle: React.CSSProperties = {
  textAlign: 'left',
  paddingTop: '6px',
  paddingBottom: '6px',
  verticalAlign: 'top',
}

const labelTextStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#333333',
  margin: 0,
  fontWeight: 500,
}

const valueTextStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#333333',
  margin: 0,
}

const linkStyle: React.CSSProperties = {
  color: '#2563eb',
  textDecoration: 'none',
}

export interface DetailRowData {
  label: string
  value: string
  href?: string
  dataTestId?: string
}

/**
 * Apple-style two-column detail row with right-aligned labels
 */
export const DetailRow = ({
  label,
  value,
  href,
  dataTestId,
}: DetailRowData) => {
  return (
    <Row data-testid={dataTestId}>
      <Column style={labelCellStyle}>
        <Text style={labelTextStyle}>{label}</Text>
      </Column>
      <Column style={valueCellStyle}>
        {href ? (
          <Link
            href={href}
            style={{ ...valueTextStyle, ...linkStyle }}
          >
            {value}
          </Link>
        ) : (
          <Text style={valueTextStyle}>{value}</Text>
        )}
      </Column>
    </Row>
  )
}

/**
 * Apple-style two-column detail table for subscription confirmation emails
 */
export const DetailTable = ({
  children,
  style,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
}) => {
  return (
    <Section style={{ ...tableStyle, ...style }}>{children}</Section>
  )
}
