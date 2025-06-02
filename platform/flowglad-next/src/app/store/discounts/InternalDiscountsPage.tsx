'use client'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import Button from '@/components/ion/Button'
import CreateDiscountModal from '@/components/forms/CreateDiscountModal'
import DiscountsTable, {
  DiscountsTableFilters,
} from './DiscountsTable'
import InternalPageContainer from '@/components/InternalPageContainer'
import { Tabs, TabsContent, TabsList } from '@/components/ion/Tab'
import { Tab } from '@/components/ion/Tab'
import { sentenceCase } from 'change-case'
import PageTitle from '@/components/ion/PageTitle'
import Breadcrumb from '@/components/navigation/Breadcrumb'

interface DiscountStatusTabProps {
  status: 'all' | 'active' | 'inactive'
  isActive: boolean
}

export const DiscountStatusTab = ({
  status,
  isActive,
}: DiscountStatusTabProps) => {
  const label = status === 'all' ? 'All' : sentenceCase(status)

  return (
    <Tab value={status} state={isActive ? 'selected' : 'default'}>
      <div className="flex items-center gap-2">
        <span>{label}</span>
      </div>
    </Tab>
  )
}

export enum FocusedTab {
  All = 'all',
  Active = 'active',
  Inactive = 'inactive',
}

function InternalDiscountsPage() {
  const [isCreateDiscountOpen, setIsCreateDiscountOpen] =
    useState(false)
  const [activeTab, setActiveTab] = useState<string>('all')
  const getFilterForTab = (tab: string): DiscountsTableFilters => {
    if (tab === 'all') {
      return {}
    }

    return {
      active: tab === 'active',
    }
  }

  return (
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
        <div className="flex flex-row justify-between">
          <PageTitle>Discounts</PageTitle>
          <Button
            iconLeading={<Plus size={16} />}
            onClick={() => setIsCreateDiscountOpen(true)}
          >
            Create Discount
          </Button>
        </div>
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full"
        >
          <TabsList className="gap-8 border-b border-stroke-subtle">
            <DiscountStatusTab
              status="all"
              isActive={activeTab === 'all'}
            />
            <DiscountStatusTab
              status="active"
              isActive={activeTab === 'active'}
            />
            <DiscountStatusTab
              status="inactive"
              isActive={activeTab === 'inactive'}
            />
          </TabsList>

          <TabsContent value={activeTab}>
            <DiscountsTable filters={getFilterForTab(activeTab)} />
          </TabsContent>
        </Tabs>
        <CreateDiscountModal
          isOpen={isCreateDiscountOpen}
          setIsOpen={setIsCreateDiscountOpen}
        />
      </div>
    </InternalPageContainer>
  )
}

export default InternalDiscountsPage
