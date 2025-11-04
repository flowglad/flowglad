import { Img, Section, Text } from '@react-email/components'
import * as React from 'react'
import { EmailButton } from '../components/EmailButton'
import {
  EmailLayout,
  Header,
  Paragraph,
  DetailSection,
  DetailItem,
  DetailValue,
} from '../components/themed'
import { emailBaseUrl } from '@/utils/core'

export interface CustomersCsvExportReadyEmailProps {
  organizationName: string
  totalCustomers: number
  filename: string
  downloadUrl: string
}

export const CustomersCsvExportReadyEmail = ({
  organizationName,
  totalCustomers,
  filename,
  downloadUrl,
}: CustomersCsvExportReadyEmailProps) => {
  return (
    <EmailLayout
      previewText={`Your customers CSV export for ${organizationName} is ready`}
      variant="organization"
    >
      <Img
        src={`${emailBaseUrl}/static/flowglad-logo.png`}
        width={48}
        height={48}
        alt="Flowglad"
        style={{ margin: '0 auto', marginBottom: '32px' }}
      />
      <Header
        title="Your CSV Export is Ready"
        variant="organization"
      />
      <Paragraph variant="organization">
        We have successfully generated your customers CSV export. Use
        the button below to open it instantly whenever you&apos;re
        ready.
      </Paragraph>

      <DetailSection>
        <DetailItem variant="organization">Organization</DetailItem>
        <DetailValue>{organizationName}</DetailValue>

        <DetailItem variant="organization">
          Total Customers Exported
        </DetailItem>
        <DetailValue>{totalCustomers.toLocaleString()}</DetailValue>

        <DetailItem variant="organization">File Name</DetailItem>
        <DetailValue>{filename}</DetailValue>
      </DetailSection>

      <Section
        style={{ textAlign: 'center' as const, marginTop: '32px' }}
      >
        <EmailButton href={downloadUrl}>Open CSV Export</EmailButton>
      </Section>

      <Paragraph variant="organization" style={{ marginTop: '24px' }}>
        Need a fresh export later? You can generate a new file anytime
        from the Flowglad customers dashboard.
      </Paragraph>
    </EmailLayout>
  )
}
