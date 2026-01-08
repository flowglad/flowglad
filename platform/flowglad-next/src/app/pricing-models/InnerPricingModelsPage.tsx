'use client'
import { useState } from 'react'
import CreatePricingModelModal from '@/components/forms/CreatePricingModelModal'
import PageContainer from '@/components/PageContainer'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import { PricingModelsDataTable } from './data-table'

const InnerPricingModelsPage = () => {
  const [isCreatePricingModelOpen, setIsCreatePricingModelOpen] =
    useState(false)

  return (
    <>
      <PageContainer>
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
      </PageContainer>
      <CreatePricingModelModal
        isOpen={isCreatePricingModelOpen}
        setIsOpen={setIsCreatePricingModelOpen}
      />
    </>
  )
}

export default InnerPricingModelsPage
