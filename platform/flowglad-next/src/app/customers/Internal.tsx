'use client'
import { useState } from 'react'
import CreateCustomerFormModal from '@/components/forms/CreateCustomerFormModal'
import InternalPageContainer from '@/components/InternalPageContainer'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import { PageHeader } from '@/components/ui/page-header'
import { TabsTrigger } from '@/components/ui/tabs'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { CustomersDataTable } from './data-table'

interface CustomerTabProps {
  label: string
}

const CustomerTab = ({ label }: CustomerTabProps) => {
  return (
    <TabsTrigger value={label}>
      <div className="flex items-center gap-2">
        <span>{label}</span>
      </div>
    </TabsTrigger>
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
          <PageHeader title="Customers" />
          <div>
            <CustomersDataTable
              filters={getFiltersForTab(activeTab)}
              onCreateCustomer={() => setIsCreateCustomerOpen(true)}
            />
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
