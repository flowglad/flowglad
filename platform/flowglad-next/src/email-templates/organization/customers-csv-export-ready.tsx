import { Img } from '@react-email/components'
import * as React from 'react'
import { emailBaseUrl } from '@/utils/core'
import TestModeBanner from '../components/TestBanner'
import {
  EmailLayout,
  Footer,
  Header,
  Paragraph,
} from '../components/themed'

export interface CustomersCsvExportReadyEmailProps {
  organizationName: string
  livemode: boolean
}

export const CustomersCsvExportReadyEmail = ({
  organizationName,
  livemode,
}: CustomersCsvExportReadyEmailProps) => {
  return (
    <EmailLayout
      previewText={`Your customers CSV export for ${organizationName} is ready`}
      variant="organization"
    >
      <TestModeBanner livemode={livemode} />
      <Img
        src={`${emailBaseUrl}/images/email/Flowglad-email-logo.jpg`}
        width="40"
        height="40"
        alt="Flowglad Logo"
        style={{ marginBottom: '32px' }}
      />
      <Header
        title="Your CSV Export is Ready"
        variant="organization"
      />
      <Paragraph variant="organization">
        The file is attached to this email and ready to download.
      </Paragraph>
      <Footer
        organizationName={organizationName}
        variant="organization"
      />
    </EmailLayout>
  )
}
