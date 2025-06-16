import { Section } from '@react-email/components'
import * as React from 'react'

const sectionStyle = {
  margin: '30px 0',
}

export const DetailSection = ({
  children,
  style,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
}) => (
  <Section style={{ ...sectionStyle, ...style }}>{children}</Section>
)
