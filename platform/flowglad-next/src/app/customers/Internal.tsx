// Generated with Ion on 9/20/2024, 10:31:46 PM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=372:12322
'use client'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/ion/PageHeader'
import Button from '@/components/ion/Button'
import CreateCustomerFormModal from '@/components/forms/CreateCustomerFormModal'
import InternalPageContainer from '@/components/InternalPageContainer'
import { useAuthenticatedContext } from '@/contexts/authContext'
import CustomersTable from './CustomersTable'

function Internal() {
  const { organization } = useAuthenticatedContext()
  const [focusedTab, setFocusedTab] = useState('all')
  const [isCreateCustomerOpen, setIsCreateCustomerOpen] =
    useState(false)

  const tabs = [
    {
      label: 'All',
      subPath: 'all',
      active: focusedTab === 'all',
      Component: () => (
        <CustomersTable
          filters={{
            organizationId: organization?.id!,
          }}
        />
      ),
    },
    {
      label: 'Top Spending',
      subPath: 'top-spending',
      active: focusedTab === 'top-spending',
      Component: () => (
        <CustomersTable
          filters={{
            organizationId: organization?.id!,
          }}
        />
      ),
    },
    {
      label: 'Newest',
      subPath: 'newest',
      active: focusedTab === 'newest',
      Component: () => (
        <CustomersTable
          filters={{
            organizationId: organization?.id!,
          }}
        />
      ),
    },
    {
      label: 'Archived',
      subPath: 'archived',
      active: focusedTab === 'archived',
      Component: () => (
        <CustomersTable
          filters={{
            organizationId: organization?.id!,
            archived: focusedTab === 'archived',
          }}
        />
      ),
    },
  ]
  return (
    <>
      <InternalPageContainer>
        <PageHeader
          title="Customers"
          tabs={tabs}
          onTabChange={setFocusedTab}
          primaryButton={
            <Button
              iconLeading={<Plus size={16} />}
              onClick={() => setIsCreateCustomerOpen(true)}
            >
              Create Customer
            </Button>
          }
        />
      </InternalPageContainer>
      <CreateCustomerFormModal
        isOpen={isCreateCustomerOpen}
        setIsOpen={setIsCreateCustomerOpen}
      />
    </>
  )
}

export default Internal
