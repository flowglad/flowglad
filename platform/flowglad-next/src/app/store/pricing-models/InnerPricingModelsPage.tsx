'use client'
import { PageHeader } from '@/components/ui/page-header'
import { PricingModelsDataTable } from './data-table'
import InternalPageContainer from '@/components/InternalPageContainer'
import CreatePricingModelModal from '@/components/forms/CreatePricingModelModal'
import { useState } from 'react'
import Breadcrumb from '@/components/navigation/Breadcrumb'

const InnerPricingModelsPage = () => {
  const [isCreatePricingModelOpen, setIsCreatePricingModelOpen] =
    useState(false)

  return (
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
        <PageHeader title="Pricing Models" className="mb-6" />
        <div>
          <PricingModelsDataTable
            onCreatePricingModel={() =>
              setIsCreatePricingModelOpen(true)
            }
          />
        </div>
      </div>
      <CreatePricingModelModal
        isOpen={isCreatePricingModelOpen}
        setIsOpen={setIsCreatePricingModelOpen}
      />
    </InternalPageContainer>
  )
}

export default InnerPricingModelsPage
