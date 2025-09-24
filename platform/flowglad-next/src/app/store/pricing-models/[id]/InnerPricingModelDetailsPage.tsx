'use client'
import { Button } from '@/components/ui/button'
import { ProductsTable } from '@/app/store/products/ProductsTable'
import { PricingModel } from '@/db/schema/pricingModels'
import { useState } from 'react'
import InternalPageContainer from '@/components/InternalPageContainer'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import { PageHeader } from '@/components/ui/page-header'
import { Pencil, Plus } from 'lucide-react'
import EditPricingModelModal from '@/components/forms/EditPricingModelModal'
import { CustomersDataTable } from '@/app/customers/data-table'
import { TableHeader } from '@/components/ui/table-header'
import FeaturesTable from '@/app/features/FeaturesTable'
import CreateProductModal from '@/components/forms/CreateProductModal'
import CreateFeatureModal from '@/components/forms/CreateFeatureModal'
import DefaultBadge from '@/components/DefaultBadge'
import UsageMetersTable from '@/app/store/usage-meters/UsageMetersTable'
import CreateUsageMeterModal from '@/components/components/CreateUsageMeterModal'

export type InnerPricingModelDetailsPageProps = {
  pricingModel: PricingModel.ClientRecord
}

function InnerPricingModelDetailsPage({
  pricingModel,
}: InnerPricingModelDetailsPageProps) {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isCreateProductModalOpen, setIsCreateProductModalOpen] =
    useState(false)
  const [isCreateFeatureModalOpen, setIsCreateFeatureModalOpen] =
    useState(false)
  const [
    isCreateUsageMeterModalOpen,
    setIsCreateUsageMeterModalOpen,
  ] = useState(false)

  return (
    <InternalPageContainer>
      <div className="w-full flex flex-col gap-6">
        <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
          <Breadcrumb />
          <div className="flex flex-row items-center justify-between">
            <div className="flex flex-row items-center gap-2 min-w-0 overflow-hidden mr-4">
              <PageHeader
                title={pricingModel.name}
                className="truncate whitespace-nowrap overflow-hidden text-ellipsis"
              />
              {pricingModel.isDefault && <DefaultBadge />}
            </div>
            <div className="flex flex-row gap-4 justify-end flex-shrink-0">
              <Button onClick={() => setIsEditOpen(true)}>
                <Pencil className="w-4 h-4 mr-2" />
                Edit
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <TableHeader
            title="Products"
            buttonLabel="Create Product"
            buttonIcon={<Plus size={16} />}
            buttonOnClick={() => {
              setIsCreateProductModalOpen(true)
            }}
          />
          <ProductsTable
            filters={{ pricingModelId: pricingModel.id }}
          />
        </div>
        <div className="flex flex-col gap-5">
          <TableHeader title="Customers" noButtons />
          <CustomersDataTable
            filters={{ pricingModelId: pricingModel.id }}
          />
        </div>
        <div className="flex flex-col gap-5">
          <TableHeader
            title="Features"
            buttonLabel="Create Feature"
            buttonIcon={<Plus size={16} />}
            buttonOnClick={() => {
              setIsCreateFeatureModalOpen(true)
            }}
          />
          <FeaturesTable
            filters={{ pricingModelId: pricingModel.id }}
          />
        </div>
        <div className="flex flex-col gap-5">
          <TableHeader
            title="Usage Meters"
            buttonLabel="Create Usage Meter"
            buttonIcon={<Plus size={16} />}
            buttonOnClick={() => {
              setIsCreateUsageMeterModalOpen(true)
            }}
          />
          <UsageMetersTable
            filters={{ pricingModelId: pricingModel.id }}
          />
        </div>
      </div>
      <EditPricingModelModal
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        pricingModel={pricingModel}
      />
      <CreateProductModal
        isOpen={isCreateProductModalOpen}
        setIsOpen={setIsCreateProductModalOpen}
        defaultPricingModelId={pricingModel.id}
      />
      <CreateFeatureModal
        isOpen={isCreateFeatureModalOpen}
        setIsOpen={setIsCreateFeatureModalOpen}
        defaultPricingModelId={pricingModel.id}
      />
      <CreateUsageMeterModal
        isOpen={isCreateUsageMeterModalOpen}
        setIsOpen={setIsCreateUsageMeterModalOpen}
      />
    </InternalPageContainer>
  )
}

export default InnerPricingModelDetailsPage
