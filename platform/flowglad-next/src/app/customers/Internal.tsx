'use client'
import { useState } from 'react'
import CreateCustomerFormModal from '@/components/forms/CreateCustomerFormModal'
import PageContainer from '@/components/PageContainer'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { CustomersDataTable } from './data-table'

function Internal() {
  const { organization } = useAuthenticatedContext()
  const [isCreateCustomerOpen, setIsCreateCustomerOpen] =
    useState(false)

  return (
    <>
      <PageContainer>
        <PageHeaderNew
          title="Customers"
          hideBorder
          className="pb-2"
        />
        <CustomersDataTable
          externalFilters={{ organizationId: organization?.id! }}
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
