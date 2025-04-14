import { Image as ImageIcon, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import StatusBadge from '@/components/StatusBadge'
import EditProductModal from '@/components/forms/EditProductModal'
import Image from 'next/image'
import { useAuthenticatedContext } from '@/contexts/authContext'
import DateRangeRevenueChart from '@/components/DateRangeRevenueChart'
import { Product } from '@/db/schema/products'
import TableTitle from '@/components/ion/TableTitle'
import { Price } from '@/db/schema/prices'
import Label from '@/components/ion/Label'
import PricingCellView from '@/components/PricingCellView'
import PricesTable from './PricesTable'
import CreatePriceModal from '@/components/forms/CreatePriceModal'

interface ProductDetailsOverviewProps {
  product: Product.ClientRecord
  prices: Price.ClientRecord[]
}

const ProductDetailsRow = ({
  product,
  prices,
}: ProductDetailsOverviewProps) => {
  const [isEditOpen, setIsEditOpen] = useState(false)
  return (
    <>
      <TableTitle
        title="Product"
        buttonLabel="Edit Product"
        buttonIcon={<Pencil size={16} />}
        buttonOnClick={() => setIsEditOpen(true)}
      />
      <div className="w-full flex justify-between items-start rounded-radius-sm border border-stroke-subtle bg-nav">
        <div className="w-full flex flex-col gap-2 p-4">
          <div className="w-full flex flex-row gap-5 justify-between items-start">
            <div className="flex flex-col gap-4 justify-start">
              {product.imageURL ? (
                <Image
                  src={product.imageURL}
                  alt={product.name}
                  width={126}
                  height={72}
                />
              ) : (
                <ImageIcon size={20} />
              )}
              <Label>Title</Label>
              <div className="text-sm font-medium">
                {product.name}
              </div>
              <Label>Pricing</Label>
              <div className="text-sm font-medium">
                <PricingCellView prices={prices} />
              </div>
              <Label>Description</Label>
              <div className="text-sm font-medium">
                {product.description}
              </div>
            </div>
            <div className="flex">
              <StatusBadge active={product.active} />
            </div>
          </div>
        </div>
      </div>
      <EditProductModal
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        product={product}
        prices={prices}
      />
    </>
  )
}

const ProductOverviewTabView = ({
  product,
  prices,
}: ProductDetailsOverviewProps) => {
  const { organization } = useAuthenticatedContext()
  const [isCreatePriceOpen, setIsCreatePriceOpen] = useState(false)
  return (
    <>
      <div className="w-full flex flex-row gap-4">
        <div className="w-full flex flex-col gap-5">
          <ProductDetailsRow product={product} prices={prices} />
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
      </div>
      <TableTitle
        title="Prices"
        buttonLabel="Create Price"
        buttonIcon={<Plus size={8} strokeWidth={2} />}
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
    </>
  )
}

export default ProductOverviewTabView
