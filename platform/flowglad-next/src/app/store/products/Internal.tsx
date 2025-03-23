// Generated with Ion on 9/23/2024, 6:30:46 PM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=372:6968
'use client'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import Button from '@/components/ion/Button'
import { PageHeader } from '@/components/ion/PageHeader'
import { Product } from '@/db/schema/products'
import { CreateProductModal } from '@/components/forms/CreateProductModal'
import { Price } from '@/db/schema/prices'
import { ProductsTable } from './ProductsTable'
import { trpc } from '@/app/_trpc/client'

export enum FocusedTab {
  All = 'all',
  Active = 'active',
  Inactive = 'inactive',
}

type Props = {
  products: {
    product: Product.ClientRecord
    prices: Price.ClientRecord[]
  }[]
}

function Internal({ products }: Props) {
  const [isCreateProductOpen, setIsCreateProductOpen] =
    useState(false)
  const { data: defaultCatalog } = trpc.catalogs.getDefault.useQuery()
  const activeProducts = products.filter(
    (product) => product.product.active
  )
  const inactiveProducts = products.filter(
    (product) => !product.product.active
  )
  const activeProductsCount = activeProducts.length
  const inactiveProductsCount = inactiveProducts.length
  return (
    <div className="h-full flex justify-between items-center gap-2.5">
      <div className="bg-background flex-1 h-full w-full flex gap-6 p-6">
        <div className="flex-1 h-full w-full flex flex-col">
          <PageHeader
            title="Products"
            tabs={[
              {
                label: 'All',
                subPath: 'all',
                Component: () => (
                  <ProductsTable products={products} />
                ),
              },
              {
                label: `${activeProductsCount} Active`,
                subPath: 'active',
                Component: () => (
                  <ProductsTable products={activeProducts} />
                ),
              },
              {
                label: `${inactiveProductsCount} Inactive`,
                subPath: 'inactive',
                Component: () => (
                  <ProductsTable products={inactiveProducts} />
                ),
              },
            ]}
            primaryButton={
              <Button
                iconLeading={<Plus size={16} />}
                onClick={() => setIsCreateProductOpen(true)}
              >
                Create Product
              </Button>
            }
          />
          {defaultCatalog && (
            <CreateProductModal
              isOpen={isCreateProductOpen}
              setIsOpen={setIsCreateProductOpen}
              defaultCatalogId={defaultCatalog.id}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default Internal
