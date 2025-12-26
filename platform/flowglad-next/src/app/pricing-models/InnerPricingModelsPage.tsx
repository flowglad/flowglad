'use client'
import { useState } from 'react'
import CreatePricingModelModal from '@/components/forms/CreatePricingModelModal'
import InnerPageContainerNew from '@/components/InnerPageContainerNew'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import { PricingModelsDataTable } from './data-table'

const InnerPricingModelsPage = () => {
  const [isCreatePricingModelOpen, setIsCreatePricingModelOpen] =
    useState(false)

  return (
    <>
      <InnerPageContainerNew>
        <PageHeaderNew
          title="Pricing Models"
          hideBorder
          className="pb-2"
        />
        <PricingModelsDataTable
          onCreatePricingModel={() =>
            setIsCreatePricingModelOpen(true)
          }
          hiddenColumns={['id']}
        />
      </InnerPageContainerNew>
      <CreatePricingModelModal
        isOpen={isCreatePricingModelOpen}
        setIsOpen={setIsCreatePricingModelOpen}
      />
    </>
  )
}

export default InnerPricingModelsPage
