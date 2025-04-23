'use client'

import { PageHeader } from '@/components/ion/PageHeader'
import type { TabData } from '@/components/ion/PageHeader'
import TeammatesSettingsTab from './TeammatesSettingsTab'
import InternalPageContainer from '@/components/InternalPageContainer'
import ApiKeysTable from './ApiKeysTable'
import OrganizationDetailsTab from './OrganizationDetailsTab'

const tabs: TabData[] = [
  {
    label: 'Developers',
    subPath: 'developers',
    Component: ApiKeysTable,
  },
  {
    label: 'Teammates',
    subPath: 'teammates',
    Component: TeammatesSettingsTab,
  },
  {
    label: 'Organization Details',
    subPath: 'organization-details',
    Component: OrganizationDetailsTab,
  },
]

const InternalSettingsPage = () => {
  return (
    <InternalPageContainer>
      <PageHeader title="Settings" tabs={tabs} />
    </InternalPageContainer>
  )
}

export default InternalSettingsPage
