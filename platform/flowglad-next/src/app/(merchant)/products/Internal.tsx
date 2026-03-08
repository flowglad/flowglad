'use client'
import { useState } from 'react'
import { trpc } from '@/app/_trpc/client'
import CreateProductModal from '@/components/forms/CreateProductModal'
import PageContainer from '@/components/PageContainer'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import { ProductsDataTable } from './data-table'

interface InternalProps {
  /** Optional pricing model ID from URL params. Falls back to focused membership if not provided. */
  pricingModelId?: string
}

function Internal({ pricingModelId }: InternalProps) {
  const [isCreateProductOpen, setIsCreateProductOpen] =
    useState(false)

  // Get focused pricing model for filtering (used as fallback)
  const focusedMembership =
    trpc.organizations.getFocusedMembership.useQuery()
  const focusedPricingModelId =
    focusedMembership.data?.pricingModel?.id ?? ''

  // Use URL param if provided, otherwise fall back to focused membership
  const effectivePricingModelId =
    pricingModelId || focusedPricingModelId

  return (
    <>
      <PageContainer>
        <PageHeaderNew title="Products" hideBorder className="pb-2" />
        <ProductsDataTable
          externalFilters={{
            pricingModelId: effectivePricingModelId,
          }}
          onCreateProduct={() => setIsCreateProductOpen(true)}
          hiddenColumns={['productId']}
        />
      </PageContainer>
      <CreateProductModal
        isOpen={isCreateProductOpen}
        setIsOpen={setIsCreateProductOpen}
      />
    </>
  )
}

export default Internal
