'use client'
import { useState } from 'react'
import { trpc } from '@/app/_trpc/client'
import CreateProductModal from '@/components/forms/CreateProductModal'
import PageContainer from '@/components/PageContainer'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import { ProductsDataTable } from './data-table'

function Internal() {
  const [isCreateProductOpen, setIsCreateProductOpen] =
    useState(false)

  // Get focused pricing model for filtering
  const focusedMembership =
    trpc.organizations.getFocusedMembership.useQuery()
  const focusedPricingModelId =
    focusedMembership.data?.pricingModel?.id ?? ''

  return (
    <>
      <PageContainer>
        <PageHeaderNew title="Products" hideBorder className="pb-2" />
        <ProductsDataTable
          filters={{ pricingModelId: focusedPricingModelId }}
          onCreateProduct={() => setIsCreateProductOpen(true)}
          hiddenColumns={['productId']}
        />
      </PageContainer>
      <CreateProductModal
        isOpen={isCreateProductOpen}
        setIsOpen={setIsCreateProductOpen}
        defaultPricingModelId={focusedPricingModelId}
      />
    </>
  )
}

export default Internal
