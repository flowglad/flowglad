'use client'
import { useState } from 'react'
import ApiSettingsTab from '@/app/settings/ApiSettingsTab'
import OrganizationSettingsTab from '@/app/settings/OrganizationSettingsTab'
import InternalPageContainer from '@/components/InternalPageContainer'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import { FilterButtonGroup } from '@/components/ui/filter-button-group'
import { PageHeader } from '@/components/ui/page-header'

const SettingsPage = () => {
  const [activeSection, setActiveSection] = useState('overview')

  // Section options for the button group
  const sectionOptions = [
    { value: 'overview', label: 'Overview' },
    { value: 'api', label: 'API' },
  ]

  return (
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
        <PageHeader title="Settings" />
        <div className="w-full">
          <FilterButtonGroup
            options={sectionOptions}
            value={activeSection}
            onValueChange={setActiveSection}
            className="mb-6"
          />
          <div className="mt-6">
            {activeSection === 'overview' && (
              <OrganizationSettingsTab />
            )}
            {activeSection === 'api' && <ApiSettingsTab />}
          </div>
        </div>
      </div>
    </InternalPageContainer>
  )
}

export default SettingsPage
