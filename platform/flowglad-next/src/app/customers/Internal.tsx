// Generated with Ion on 9/20/2024, 10:31:46 PM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=372:12322
'use client'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Tabs, TabsList, TabsContent } from '@/components/ion/Tab'
import { Button } from '@/components/ui/button'
import CreateCustomerFormModal from '@/components/forms/CreateCustomerFormModal'
import InternalPageContainer from '@/components/InternalPageContainer'
import { useAuthenticatedContext } from '@/contexts/authContext'
import CustomersTable from './CustomersTable'
import PageTitle from '@/components/ion/PageTitle'
import Breadcrumb from '@/components/navigation/Breadcrumb'

import { Tab } from '@/components/ion/Tab'

interface CustomerTabProps {
  label: string
  isActive: boolean
}

const CustomerTab = ({ label, isActive }: CustomerTabProps) => {
  return (
    <Tab value={label} state={isActive ? 'selected' : 'default'}>
      <div className="flex items-center gap-2">
        <span>{label}</span>
      </div>
    </Tab>
  )
}

function Internal() {
  const { organization } = useAuthenticatedContext()
  const [activeTab, setActiveTab] = useState('all')
  const [isCreateCustomerOpen, setIsCreateCustomerOpen] =
    useState(false)

  const getFiltersForTab = (tab: string) => {
    const baseFilters = {
      organizationId: organization?.id!,
    }

    if (tab === 'archived') {
      return {
        ...baseFilters,
        archived: true,
      }
    }

    return baseFilters
  }

  return (
    <>
      <InternalPageContainer>
        <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
          <Breadcrumb />
          <div className="flex flex-row justify-between">
            <PageTitle>Customers</PageTitle>
            <Button
              size="sm"
              className="gap-x-1 px-3 text-sm h-8 rounded-radius-sm bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-pressed"
              onClick={() => setIsCreateCustomerOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Customer
            </Button>
          </div>
          <div>
            <CustomersTable filters={getFiltersForTab(activeTab)} />
          </div>
        </div>
      </InternalPageContainer>
      <CreateCustomerFormModal
        isOpen={isCreateCustomerOpen}
        setIsOpen={setIsCreateCustomerOpen}
      />
    </>
  )
}

export default Internal
