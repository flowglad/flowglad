'use client'

import { PageHeader } from '@/components/ion/PageHeader'
import type { TabData } from '@/components/ion/PageHeader'
import TeammatesSettingsTab from './TeammatesSettingsTab'
import InternalPageContainer from '@/components/InternalPageContainer'
import ApiKeysTable from './ApiKeysTable'

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
]

const InternalSettingsPage = () => {
  return (
    <InternalPageContainer>
      <PageHeader title="Settings" tabs={tabs} />
    </InternalPageContainer>
  )
}

export default InternalSettingsPage
