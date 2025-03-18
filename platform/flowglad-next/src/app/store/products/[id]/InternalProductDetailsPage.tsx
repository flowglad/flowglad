// Generated with Ion on 11/15/2024, 6:09:53 PM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=1210:41903
'use client'
import Button from '@/components/ion/Button'
import { PageHeader } from '@/components/ion/PageHeader'
import { Price } from '@/db/schema/prices'
import { Clipboard, Eye } from 'lucide-react'
import ProductOverviewTabView from './ProductOverviewTabView'
import { Product } from '@/db/schema/products'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'

export type InternalProductDetailsPageProps = {
  product: Product.Record
  prices: Price.Record[]
}

function InternalProductDetailsPage(
  props: InternalProductDetailsPageProps
) {
  const { product, prices } = props
  const productURL = `${
    window ? window.location.origin : 'https://app.flowglad.com'
  }/product/${product.id}/purchase`
  const copyPurchaseLinkHandler = useCopyTextHandler({
    text: productURL,
  })
  const previewProductHandler = () => {
    window.open(productURL, '_blank')
  }
  return (
    <div className="bg-container h-full flex justify-between items-center">
      <div className="bg-internal flex-1 h-full w-full flex gap-6 p-6">
        <div className="flex-1 h-full w-full flex flex-col">
          <div className="w-full relative flex flex-col justify-center gap-8">
            <PageHeader
              hideTabs
              title={product.name}
              primaryButton={
                <div className="flex flex-row gap-2">
                  <Button
                    iconLeading={<Clipboard size={16} />}
                    onClick={copyPurchaseLinkHandler}
                  >
                    Copy Link
                  </Button>
                  <Button
                    iconLeading={<Eye size={16} />}
                    onClick={previewProductHandler}
                  >
                    Preview
                  </Button>
                </div>
              }
              tabs={[
                {
                  label: 'Overview',
                  subPath: 'overview',
                  Component: () => (
                    <ProductOverviewTabView
                      product={product}
                      prices={prices}
                    />
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

export default InternalProductDetailsPage
