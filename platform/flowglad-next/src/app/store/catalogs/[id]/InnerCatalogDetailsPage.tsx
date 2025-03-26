// Generated with Ion on 11/15/2024, 6:09:53 PM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=1210:41903
'use client'
import Button from '@/components/ion/Button'
import { PageHeader } from '@/components/ion/PageHeader'
import { Clipboard, Eye } from 'lucide-react'
import { ProductsTable } from '@/app/store/products/ProductsTable'
import { ProductWithPrices } from '@/db/schema/prices'
import { Catalog } from '@/db/schema/catalogs'
import core from '@/utils/core'

export type InnerCatalogDetailsPageProps = {
  products: ProductWithPrices[]
  catalog: Catalog.ClientRecord
}

function InnerCatalogDetailsPage({
  products,
  catalog,
}: InnerCatalogDetailsPageProps) {
  return (
    <div className="bg-container h-full flex justify-between items-center">
      <div className="bg-internal flex-1 h-full w-full flex gap-6 p-6">
        <div className="flex-1 h-full w-full flex flex-col">
          <div className="w-full relative flex flex-col justify-center gap-8">
            <PageHeader
              hideTabs
              title={catalog.name}
              primaryButton={
                <div className="flex flex-row gap-2">
                  <Button
                    iconLeading={<Clipboard size={16} />}
                    onClick={core.noOp}
                  >
                    Copy Link
                  </Button>
                  <Button
                    iconLeading={<Eye size={16} />}
                    onClick={core.noOp}
                  >
                    Preview
                  </Button>
                </div>
              }
              tabs={[
                {
                  label: 'Products',
                  subPath: 'products',
                  Component: () => (
                    <ProductsTable products={products} />
                  ),
                },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default InnerCatalogDetailsPage
