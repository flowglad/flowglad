'use client'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import CreateDiscountModal from '@/components/forms/CreateDiscountModal'
import DiscountsTable, {
  DiscountsTableFilters,
} from './DiscountsTable'
import InternalPageContainer from '@/components/InternalPageContainer'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { sentenceCase } from 'change-case'
import { PageHeader } from '@/components/ui/page-header'
import Breadcrumb from '@/components/navigation/Breadcrumb'

interface DiscountStatusTabProps {
  status: 'all' | 'active' | 'inactive'
}

export const DiscountStatusTab = ({
  status,
}: DiscountStatusTabProps) => {
  const label = status === 'all' ? 'All' : sentenceCase(status)

  return (
    <TabsTrigger value={status}>
      <div className="flex items-center gap-2">
        <span>{label}</span>
      </div>
    </TabsTrigger>
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
        <PageHeader
          title="Discounts"
          action={
            <Button onClick={() => setIsCreateDiscountOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Discount
            </Button>
          }
        />
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full"
        >
          <TabsList className="gap-8 border-b border-stroke-subtle">
            <DiscountStatusTab status="all" />
            <DiscountStatusTab status="active" />
            <DiscountStatusTab status="inactive" />
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
