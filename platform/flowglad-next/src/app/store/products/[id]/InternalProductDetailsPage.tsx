// Generated with Ion on 11/15/2024, 6:09:53 PM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=1210:41903
'use client'
import { useState } from 'react'
import { MigrationButton as Button } from '@/components/ui/button-migration'
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
import TableTitle from '@/components/ion/TableTitle'
import PricesTable from './PricesTable'
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
    },
    {
      label: 'Preview',
      handler: () => previewProductHandler(),
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
              <Button
                iconLeading={<Pencil size={16} />}
                onClick={() => setIsEditOpen(true)}
              >
                Edit
              </Button>
              <Popover>
                <PopoverTrigger className="flex">
                  <Button
                    className="flex justify-center items-center border-primary"
                    variant="outline"
                    asDiv={true}
                  >
                    <Ellipsis className="rotate-90 w-4 h-6" />
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
        <TableTitle
          title="Prices"
          buttonLabel="Create Price"
          buttonIcon={<Plus className="w-4 h-4" strokeWidth={2} />}
          buttonOnClick={() => setIsCreatePriceOpen(true)}
          buttonDisabledTooltip="Product must be selected"
        />
        <PricesTable
          productId={product.id}
          filters={{
            productId: product.id,
          }}
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
