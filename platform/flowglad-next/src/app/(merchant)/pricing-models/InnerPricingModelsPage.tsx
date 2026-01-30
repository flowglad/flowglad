'use client'
import { useState } from 'react'
import CreatePricingModelModal from '@/components/forms/CreatePricingModelModal'
import PageContainer from '@/components/PageContainer'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import { useAuthContext } from '@/contexts/authContext'
import { PricingModelsDataTable } from './data-table'

const InnerPricingModelsPage = () => {
  const [isCreatePricingModelOpen, setIsCreatePricingModelOpen] =
    useState(false)

  const { livemode } = useAuthContext()

  // Track pricing model count to determine if create button should be shown
  const [pricingModelCount, setPricingModelCount] = useState<
    number | null
  >(null)

  // In testmode, always allow creation
  // In livemode, only allow if no livemode PM exists (count === 0)
  const canShowCreateButton = !livemode || pricingModelCount === 0

  return (
    <>
      <PageContainer>
        <PageHeaderNew
          title="Pricing Models"
          hideBorder
          className="pb-2"
        />
        <PricingModelsDataTable
          onCreatePricingModel={
            canShowCreateButton
              ? () => setIsCreatePricingModelOpen(true)
              : undefined
          }
          onTotalCountChange={setPricingModelCount}
          hiddenColumns={['id']}
        />
      </PageContainer>
      {canShowCreateButton && (
        <CreatePricingModelModal
          isOpen={isCreatePricingModelOpen}
          setIsOpen={setIsCreatePricingModelOpen}
        />
      )}
    </>
  )
}

export default InnerPricingModelsPage
