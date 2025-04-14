'use client'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import Button from '@/components/ion/Button'
import { PageHeader } from '@/components/ion/PageHeader'
import CreateDiscountModal from '@/components/forms/CreateDiscountModal'
import DiscountsTable, {
  DiscountsTableFilters,
} from './DiscountsTable'
import InternalPageContainer from '@/components/InternalPageContainer'

export enum FocusedTab {
  All = 'all',
  Active = 'active',
  Inactive = 'inactive',
}

function InternalDiscountsPage() {
  const [isCreateDiscountOpen, setIsCreateDiscountOpen] =
    useState(false)

  return (
    <InternalPageContainer>
      <PageHeader
        title="Discounts"
        tabs={[
          {
            label: 'All',
            subPath: 'all',
            Component: () => <DiscountsTable />,
          },
          {
            label: 'Active',
            subPath: 'active',
            Component: () => (
              <DiscountsTable filters={{ active: true }} />
            ),
          },
          {
            label: 'Inactive',
            subPath: 'inactive',
            Component: () => (
              <DiscountsTable filters={{ active: false }} />
            ),
          },
        ]}
        primaryButton={
          <Button
            iconLeading={<Plus size={16} />}
            onClick={() => setIsCreateDiscountOpen(true)}
          >
            Create Discount
          </Button>
        }
      />
      <CreateDiscountModal
        isOpen={isCreateDiscountOpen}
        setIsOpen={setIsCreateDiscountOpen}
      />
    </InternalPageContainer>
  )
}

export default InternalDiscountsPage
