'use client'
import { PageHeader } from '@/components/ui/page-header'
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
        <PageHeader
          title="Pricing Models"
          className="mb-6"
          action={
            <Button onClick={() => setIsCreatePricingModelOpen(true)}>
              <Plus className="w-4 h-4 mr-2" strokeWidth={2} />
              Create Pricing Model
            </Button>
          }
        />
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
