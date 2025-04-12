// Generated with Ion on 9/23/2024, 6:30:46 PM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=372:6968
'use client'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import Button from '@/components/ion/Button'
import { PageHeader } from '@/components/ion/PageHeader'
import { CreateProductModal } from '@/components/forms/CreateProductModal'
import { ProductWithPrices } from '@/db/schema/prices'
import { ProductsTable, ProductsTableFilters } from './ProductsTable'
import { trpc } from '@/app/_trpc/client'
import { Catalog } from '@/db/schema/catalogs'
import InternalPageContainer from '@/components/InternalPageContainer'
import { Tabs, TabsContent, TabsList } from '@/components/ion/Tab'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import PageTitle from '@/components/ion/PageTitle'

export enum FocusedTab {
  All = 'all',
  Active = 'active',
  Inactive = 'inactive',
}

type Props = {
  products: (ProductWithPrices & { catalog: Catalog.ClientRecord })[]
}

function InternalProductsPage({ products: initialProducts }: Props) {
  const [isCreateProductOpen, setIsCreateProductOpen] =
    useState(false)
  const [activeTab, setActiveTab] = useState<string>('all')
  const { data } = trpc.catalogs.getDefault.useQuery({})
  const defaultCatalog = data?.catalog

  const { data: countsData } =
    trpc.products.getCountsByStatus.useQuery({})

  const countsByStatus = countsData || []
  const countsByStatusMap = new Map(
    countsByStatus.map((item) => [item.status, item.count])
  )

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
        <div className="flex flex-row justify-between">
          <PageTitle>Products</PageTitle>
          <Button
            iconLeading={<Plus size={16} />}
            onClick={() => setIsCreateProductOpen(true)}
          >
            Create Product
          </Button>
        </div>
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full"
        >
          <TabsList className="mb-4">
            <TabsContent value="all" className="px-4 py-2">
              All
            </TabsContent>
            <TabsContent value="active" className="px-4 py-2">
              {countsByStatusMap.get('active') || 0} Active
            </TabsContent>
            <TabsContent value="inactive" className="px-4 py-2">
              {countsByStatusMap.get('inactive') || 0} Inactive
            </TabsContent>
          </TabsList>

          <TabsContent value="all">
            <ProductsTable filters={getFilterForTab('all')} />
          </TabsContent>

          <TabsContent value="active">
            <ProductsTable filters={getFilterForTab('active')} />
          </TabsContent>

          <TabsContent value="inactive">
            <ProductsTable filters={getFilterForTab('inactive')} />
          </TabsContent>
        </Tabs>
      </div>
      {defaultCatalog && (
        <CreateProductModal
          isOpen={isCreateProductOpen}
          setIsOpen={setIsCreateProductOpen}
          defaultCatalogId={defaultCatalog.id}
        />
      )}
    </InternalPageContainer>
  )
}

export default InternalProductsPage
