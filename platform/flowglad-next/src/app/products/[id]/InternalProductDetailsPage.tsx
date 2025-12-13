'use client'
import { Ellipsis, Pencil } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
import DateRangeRevenueChart from '@/components/DateRangeRevenueChart'
import CreatePriceModal from '@/components/forms/CreatePriceModal'
import EditProductModal from '@/components/forms/EditProductModal'
import InternalPageContainer from '@/components/InternalPageContainer'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import PopoverMenu, {
  type PopoverMenuItem,
} from '@/components/PopoverMenu'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useAuthenticatedContext } from '@/contexts/authContext'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import { PricesDataTable } from './prices/data-table'

export type InternalProductDetailsPageProps = {
  product: Product.ClientRecord
  prices: Price.ClientRecord[]
  pricingModel: PricingModel.Record
}

function InternalProductDetailsPage(
  props: InternalProductDetailsPageProps
) {
  const { product, prices, pricingModel } = props
  const { organization } = useAuthenticatedContext()
  const router = useRouter()
  const [isCreatePriceOpen, setIsCreatePriceOpen] = useState(false)

  const productURL = `${
    window ? window.location.origin : 'https://app.flowglad.com'
  }/product/${product.id}/purchase`
  const [isEditOpen, setIsEditOpen] = useState(false)

  const copyPurchaseLinkHandler = useCopyTextHandler({
    text: productURL,
  })
  const previewProductHandler = () => {
    window.open(productURL, '_blank')
  }

  const moreMenuItems: PopoverMenuItem[] = [
    {
      label: 'Copy Link',
      handler: () => copyPurchaseLinkHandler(),
      disabled: product.default,
      helperText: product.default
        ? 'Cannot copy checkout link for default products. Default products are automatically assigned to customers.'
        : undefined,
    },
    {
      label: 'Preview',
      handler: () => previewProductHandler(),
      disabled: product.default,
      helperText: product.default
        ? 'Cannot preview checkout for default products. Default products are automatically assigned to customers.'
        : undefined,
    },
  ]

  const handleBreadcrumbClick = () => {
    router.push(`/pricing-models/${pricingModel.id}`)
  }

  return (
    <InternalPageContainer>
      <div className="w-full flex flex-col gap-6">
        <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
          <Breadcrumb
            label={pricingModel.name}
            onClick={handleBreadcrumbClick}
          />
          <div className="flex flex-row items-center justify-between">
            <div className="min-w-0 overflow-hidden mr-4">
              <PageHeader
                title={product.name}
                className="truncate whitespace-nowrap overflow-hidden text-ellipsis"
              />
            </div>
            <div className="flex flex-row gap-2 justify-end flex-shrink-0">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Ellipsis className="rotate-90 w-4 h-6" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-fit p-1" align="end">
                  <PopoverMenu items={moreMenuItems} />
                </PopoverContent>
              </Popover>
              <Button onClick={() => setIsEditOpen(true)}>
                <Pencil className="w-4 h-4 mr-2" />
                Edit
              </Button>
            </div>
          </div>
        </div>
        <div className="w-full min-w-40 flex flex-col gap-4">
          <div className="min-w-40 flex flex-col gap-5 pb-5">
            <DateRangeRevenueChart
              organizationCreatedAt={
                organization?.createdAt
                  ? new Date(organization.createdAt)
                  : new Date()
              }
              alignDatePicker="left"
              productId={product.id}
            />
          </div>
        </div>
        <PricesDataTable
          title="Price History"
          productId={product.id}
          filters={{
            productId: product.id,
          }}
          onCreatePrice={
            product.default
              ? undefined
              : () => setIsCreatePriceOpen(true)
          }
        />
        <CreatePriceModal
          isOpen={isCreatePriceOpen}
          setIsOpen={setIsCreatePriceOpen}
          productId={product.id}
          previousPrice={prices[prices.length - 1]}
        />
      </div>
      <EditProductModal
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        product={product}
        prices={prices}
      />
    </InternalPageContainer>
  )
}

export default InternalProductDetailsPage
