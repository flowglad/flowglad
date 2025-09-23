'use client'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import CreateCustomerFormModal from '@/components/forms/CreateCustomerFormModal'
import InternalPageContainer from '@/components/InternalPageContainer'
import { useAuthenticatedContext } from '@/contexts/authContext'
import CustomersTable from './CustomersTable'
import { PageHeader } from '@/components/ui/page-header'
import Breadcrumb from '@/components/navigation/Breadcrumb'


function Internal() {
  const { organization } = useAuthenticatedContext()
  const activeTab = 'all'
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
          <PageHeader
            title="Customers"
            action={
              <Button onClick={() => setIsCreateCustomerOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Customer
              </Button>
            }
          />
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
