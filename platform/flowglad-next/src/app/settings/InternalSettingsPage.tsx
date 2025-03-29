'use client'

import { PageHeader } from '@/components/ion/PageHeader'
import type { TabData } from '@/components/ion/PageHeader'
import DeveloperSettingsPage from './DeveloperSettingsTab'
import TeammatesSettingsTab from './TeammatesSettingsTab'

const tabs: TabData[] = [
  {
    label: 'Developers',
    subPath: 'developers',
    Component: DeveloperSettingsPage,
  },
  {
    label: 'Teammates',
    subPath: 'teammates',
    Component: TeammatesSettingsTab,
  },
]

const InternalSettingsPage = () => {
  return (
    <div className="h-full flex justify-between items-center gap-2.5">
      <div className="bg-background flex-1 h-full w-full flex gap-6 p-6">
        <div className="flex-1 h-full w-full flex flex-col">
          <PageHeader title="Settings" tabs={tabs} />
        </div>
      </div>
    </div>
  )
}

export default InternalSettingsPage
