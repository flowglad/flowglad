import { Img } from '@react-email/components'
import * as React from 'react'
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
        src={`https://cdn-flowglad.com/flowglad-banner-rounded.png`}
        width="540"
        height="199"
        alt="Flowglad Logo"
        style={{ margin: '0 auto', marginBottom: '32px' }}
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
