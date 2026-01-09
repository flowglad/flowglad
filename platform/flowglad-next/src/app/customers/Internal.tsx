'use client'
import { useState } from 'react'
import CreateCustomerFormModal from '@/components/forms/CreateCustomerFormModal'
import PageContainer from '@/components/PageContainer'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { CustomersDataTable } from './data-table'

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
      <PageContainer>
        <PageHeaderNew
          title="Customers"
          hideBorder
          className="pb-2"
        />
        <CustomersDataTable
          filters={getFiltersForTab(activeTab)}
          onCreateCustomer={() => setIsCreateCustomerOpen(true)}
          hiddenColumns={['payments', 'createdAt', 'customerId']}
        />
      </PageContainer>
      <CreateCustomerFormModal
        isOpen={isCreateCustomerOpen}
        setIsOpen={setIsCreateCustomerOpen}
      />
    </>
  )
}

export default Internal
