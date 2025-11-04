import { Img } from '@react-email/components'
import * as React from 'react'
import {
  EmailLayout,
  Header,
  Paragraph,
} from '../components/themed'

export interface CustomersCsvExportReadyEmailProps {
  organizationName: string
}

export const CustomersCsvExportReadyEmail = ({
  organizationName
}: CustomersCsvExportReadyEmailProps) => {
  return (
    <EmailLayout
      previewText={`Your customers CSV export for ${organizationName} is ready`}
      variant="organization"
    >
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
        The file is attached to this email and ready to
        download.
      </Paragraph>
    </EmailLayout>
  )
}
