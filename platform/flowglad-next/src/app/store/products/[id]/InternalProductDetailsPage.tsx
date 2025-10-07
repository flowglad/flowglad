'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Price } from '@/db/schema/prices'
import { Clipboard, Ellipsis, Eye, Pencil } from 'lucide-react'
import { Product } from '@/db/schema/products'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
import InternalPageContainer from '@/components/InternalPageContainer'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import { PageHeader } from '@/components/ui/page-header'
import EditProductModal from '@/components/forms/EditProductModal'

import { Plus } from 'lucide-react'
import { useAuthenticatedContext } from '@/contexts/authContext'
import DateRangeRevenueChart from '@/components/DateRangeRevenueChart'
import { PricesDataTable } from './prices/data-table'
import CreatePriceModal from '@/components/forms/CreatePriceModal'
import MoreMenuTableCell from '@/components/MoreMenuTableCell'
import PopoverMenu, {
  PopoverMenuItem,
} from '@/components/PopoverMenu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export type InternalProductDetailsPageProps = {
  product: Product.ClientRecord
  prices: Price.ClientRecord[]
}

function InternalProductDetailsPage(
  props: InternalProductDetailsPageProps
) {
  const { product, prices } = props
  const { organization } = useAuthenticatedContext()
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

  return (
    <InternalPageContainer>
      <div className="w-full flex flex-col gap-6">
        <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
          <Breadcrumb />
          <div className="flex flex-row items-center justify-between">
            <div className="min-w-0 overflow-hidden mr-4">
              <PageHeader
                title={product.name}
                className="truncate whitespace-nowrap overflow-hidden text-ellipsis"
              />
            </div>
            <div className="flex flex-row gap-4 justify-end flex-shrink-0">
              <Button onClick={() => setIsEditOpen(true)}>
                <Pencil className="w-4 h-4 mr-2" />
                Edit
              </Button>
              <Popover>
                <PopoverTrigger className="flex">
                  <Button
                    className="flex justify-center items-center border-primary"
                    variant="outline"
                    asChild
                  >
                    <span>
                      <Ellipsis className="rotate-90 w-4 h-6" />
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-fit" align="end">
                  <PopoverMenu items={moreMenuItems} />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
        <div className="w-full min-w-40 flex flex-col gap-4">
          <div className="min-w-40 flex flex-col gap-5 pb-5">
            <DateRangeRevenueChart
              organizationCreatedAt={
                organization?.createdAt ?? new Date()
              }
              alignDatePicker="right"
              productId={product.id}
            />
          </div>
        </div>
        <PricesDataTable
          title="Prices"
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
