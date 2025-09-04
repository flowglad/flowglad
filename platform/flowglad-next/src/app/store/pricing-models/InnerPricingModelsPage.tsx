'use client'
import PageTitle from '@/components/ion/PageTitle'
import PricingModelsTable from './PricingModelsTable'
import InternalPageContainer from '@/components/InternalPageContainer'
import CreatePricingModelModal from '@/components/forms/CreatePricingModelModal'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Breadcrumb from '@/components/navigation/Breadcrumb'

const InnerPricingModelsPage = () => {
  const [isCreatePricingModelOpen, setIsCreatePricingModelOpen] =
    useState(false)

  return (
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
        <div className="flex flex-row justify-between items-center mb-6 gap-8">
          <PageTitle>Pricing Models</PageTitle>
          <Button onClick={() => setIsCreatePricingModelOpen(true)}>
            <Plus size={16} strokeWidth={2} />
            Create Pricing Model
          </Button>
        </div>
        <PricingModelsTable />
      </div>
      <CreatePricingModelModal
        isOpen={isCreatePricingModelOpen}
        setIsOpen={setIsCreatePricingModelOpen}
      />
    </InternalPageContainer>
  )
}

export default InnerPricingModelsPage
