// Generated with Ion on 9/23/2024, 6:30:46 PM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=372:6968
'use client'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CreateProductModal } from '@/components/forms/CreateProductModal'
import { ProductWithPrices } from '@/db/schema/prices'
import { ProductsTable, ProductsTableFilters } from './ProductsTable'
import { trpc } from '@/app/_trpc/client'
import { PricingModel } from '@/db/schema/pricingModels'
import InternalPageContainer from '@/components/InternalPageContainer'
import { Tabs, TabsContent, TabsList } from '@/components/ui/tabs'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import { PageHeader } from '@/components/ui/page-header'
import { ProductStatusTab } from './components/ProductStatusTab'

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
  const [activeTab, setActiveTab] = useState<string>('all')
  const { data } = trpc.pricingModels.getDefault.useQuery({})
  const defaultPricingModel = data?.pricingModel

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
        <PageHeader
          title="Products"
          action={
            <Button onClick={() => setIsCreateProductOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Product
            </Button>
          }
        />
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full"
        >
          <TabsList className="gap-8 border-b border-muted w-full">
            <ProductStatusTab status="all" />
            <ProductStatusTab status="active" />
            <ProductStatusTab status="inactive" />
          </TabsList>

          <TabsContent value={activeTab} className="mt-6">
            <ProductsTable filters={getFilterForTab(activeTab)} />
          </TabsContent>
        </Tabs>
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
