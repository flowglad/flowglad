'use client'
import { useState } from 'react'
import InternalPageContainer from '@/components/InternalPageContainer'
import PageTitle from '@/components/ion/PageTitle'
import {
  Tabs,
  TabsContent,
  TabsList,
  Tab,
} from '@/components/ion/Tab'
import OrganizationSettingsTab from '@/app/settings/OrganizationSettingsTab'
import ApiSettingsTab from '@/app/settings/ApiSettingsTab'
import Breadcrumb from '@/components/navigation/Breadcrumb'

const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
        <PageTitle>Settings</PageTitle>
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full"
        >
          <TabsList className="gap-8 border-b border-stroke-subtle">
            <Tab
              value="overview"
              state={
                activeTab === 'overview' ? 'selected' : 'default'
              }
            >
              <div className="flex items-center gap-2">
                <span>Overview</span>
              </div>
            </Tab>
            <Tab
              value="api"
              state={activeTab === 'api' ? 'selected' : 'default'}
            >
              <div className="flex items-center gap-2">
                <span>API</span>
              </div>
            </Tab>
          </TabsList>
          <TabsContent value="overview" className="mt-6">
            <OrganizationSettingsTab />
          </TabsContent>
          <TabsContent value="api" className="mt-6">
            <ApiSettingsTab />
          </TabsContent>
        </Tabs>
      </div>
    </InternalPageContainer>
  )
}

export default SettingsPage
