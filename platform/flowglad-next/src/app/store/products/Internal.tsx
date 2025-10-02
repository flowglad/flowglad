'use client'
import { useState } from 'react'
import { CreateProductModal } from '@/components/forms/CreateProductModal'
import { ProductWithPrices } from '@/db/schema/prices'
import { ProductsDataTable, ProductsTableFilters } from './data-table'
import { trpc } from '@/app/_trpc/client'
import { PricingModel } from '@/db/schema/pricingModels'
import InternalPageContainer from '@/components/InternalPageContainer'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import { PageHeader } from '@/components/ui/page-header'

export enum FocusedTab {
  All = 'all',
  Active = 'active',
  Inactive = 'inactive',
}

type Props = {
  products: (ProductWithPrices & {
    pricingModel: PricingModel.ClientRecord
  })[]
}

function InternalProductsPage({ products: initialProducts }: Props) {
  const [isCreateProductOpen, setIsCreateProductOpen] =
    useState(false)
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const { data } = trpc.pricingModels.getDefault.useQuery({})
  const defaultPricingModel = data?.pricingModel

  // Filter options for the button group
  const filterOptions = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ]

  const getFilterForTab = (tab: string): ProductsTableFilters => {
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
        <PageHeader title="Products" />
        <div className="w-full">
          <ProductsDataTable
            filters={getFilterForTab(activeFilter)}
            filterOptions={filterOptions}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            onCreateProduct={() => setIsCreateProductOpen(true)}
          />
        </div>
      </div>
      {defaultPricingModel && (
        <CreateProductModal
          isOpen={isCreateProductOpen}
          setIsOpen={setIsCreateProductOpen}
          defaultPricingModelId={defaultPricingModel.id}
        />
      )}
    </InternalPageContainer>
  )
}

export default InternalProductsPage
