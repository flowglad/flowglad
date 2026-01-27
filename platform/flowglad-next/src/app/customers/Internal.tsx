'use client'
import { useState } from 'react'
import CreateCustomerFormModal from '@/components/forms/CreateCustomerFormModal'
import PageContainer from '@/components/PageContainer'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { CustomersDataTable } from './data-table'

type CustomerTab = 'active' | 'archived'

function Internal() {
  const { organization } = useAuthenticatedContext()
  const [activeTab, setActiveTab] = useState<CustomerTab>('active')
  const [isCreateCustomerOpen, setIsCreateCustomerOpen] =
    useState(false)

  const getFiltersForTab = (tab: CustomerTab) => {
    const baseFilters = {
      organizationId: organization?.id!,
    }

    if (tab === 'archived') {
      return {
        ...baseFilters,
        archived: true,
      }
    }

    // Active tab - explicitly filter out archived customers
    return {
      ...baseFilters,
      archived: false,
    }
  }

  return (
    <>
      <PageContainer>
        <PageHeaderNew
          title="Customers"
          hideBorder
          className="pb-2"
        />
        <div className="px-6 pb-4">
          <Tabs
            value={activeTab}
            onValueChange={(value) =>
              setActiveTab(value as CustomerTab)
            }
          >
            <TabsList>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="archived">Archived</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
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
