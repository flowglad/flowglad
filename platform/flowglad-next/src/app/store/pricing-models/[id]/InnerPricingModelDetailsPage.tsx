'use client'
import { Button } from '@/components/ui/button'
import { ProductsDataTable } from '@/app/store/products/data-table'
import { PricingModel } from '@/db/schema/pricingModels'
import { useState } from 'react'
import InternalPageContainer from '@/components/InternalPageContainer'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import { PageHeader } from '@/components/ui/page-header'
import { Pencil, Plus, Ellipsis } from 'lucide-react'
import EditPricingModelModal from '@/components/forms/EditPricingModelModal'
import { CustomersDataTable } from '@/app/customers/data-table'
import { TableHeader } from '@/components/ui/table-header'
import { FeaturesDataTable } from '@/app/features/data-table'
import CreateProductModal from '@/components/forms/CreateProductModal'
import CreateFeatureModal from '@/components/forms/CreateFeatureModal'
import CreateCustomerFormModal from '@/components/forms/CreateCustomerFormModal'
import DefaultBadge from '@/components/DefaultBadge'
import { UsageMetersDataTable } from '@/app/store/usage-meters/data-table'
import CreateUsageMeterModal from '@/components/components/CreateUsageMeterModal'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import PopoverMenu, {
  PopoverMenuItem,
} from '@/components/PopoverMenu'
import { PricingModelIntegrationGuideModal } from '@/components/forms/PricingModelIntegrationGuideModal'
import { trpc } from '@/app/_trpc/client'
import { toast } from 'sonner'

export type InnerPricingModelDetailsPageProps = {
  pricingModel: PricingModel.ClientRecord
}

function InnerPricingModelDetailsPage({
  pricingModel,
}: InnerPricingModelDetailsPageProps) {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isCreateProductModalOpen, setIsCreateProductModalOpen] =
    useState(false)
  const [isCreateCustomerModalOpen, setIsCreateCustomerModalOpen] =
    useState(false)
  const [isCreateFeatureModalOpen, setIsCreateFeatureModalOpen] =
    useState(false)
  const [
    isGetIntegrationGuideModalOpen,
    setIsGetIntegrationGuideModalOpen,
  ] = useState(false)
  const [
    isCreateUsageMeterModalOpen,
    setIsCreateUsageMeterModalOpen,
  ] = useState(false)
  const [activeProductFilter, setActiveProductFilter] =
    useState<string>('all')
  const {
    data: exportPricingModelData,
    refetch,
    isFetching,
  } = trpc.pricingModels.export.useQuery(
    {
      id: pricingModel.id,
    },
    {
      enabled: false, // Only fetch when user clicks export
    }
  )

  // Filter options for the button group
  const productFilterOptions = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ]

  const getProductFilterForTab = (tab: string) => {
    const baseFilter = { pricingModelId: pricingModel.id }

    if (tab === 'all') {
      return baseFilter
    }

    return {
      ...baseFilter,
      active: tab === 'active',
    }
  }

  const exportPricingModelHandler = async () => {
    const result = await refetch()
    const pricingModelYAML = result.data?.pricingModelYAML

    if (pricingModelYAML) {
      const blob = new Blob([pricingModelYAML], { type: 'text/yaml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `pricing-${pricingModel.id}.yaml`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Pricing model exported successfully')
    } else {
      toast.error('Failed to export pricing model')
    }
  }

  const moreMenuItems: PopoverMenuItem[] = [
    {
      label: 'Export',
      handler: () => exportPricingModelHandler(),
      helperText: 'Export pricing model as YAML file',
    },
    {
      label: 'Integrate via Prompt',
      handler: () => setIsGetIntegrationGuideModalOpen(true),
      helperText: 'Integrate into your app in one shot',
    },
  ]

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

        <div className="flex flex-col gap-5">
          <ProductsDataTable
            filters={getProductFilterForTab(activeProductFilter)}
            filterOptions={productFilterOptions}
            activeFilter={activeProductFilter}
            onFilterChange={setActiveProductFilter}
            onCreateProduct={() => setIsCreateProductModalOpen(true)}
            buttonVariant="outline"
          />
        </div>
        <div className="flex flex-col gap-5">
          <FeaturesDataTable
            title="Features"
            filters={{ pricingModelId: pricingModel.id }}
            onCreateFeature={() => setIsCreateFeatureModalOpen(true)}
            buttonVariant="outline"
          />
        </div>
        <div className="flex flex-col gap-5">
          <UsageMetersDataTable
            title="Usage Meters"
            filters={{ pricingModelId: pricingModel.id }}
            onCreateUsageMeter={() =>
              setIsCreateUsageMeterModalOpen(true)
            }
            buttonVariant="outline"
          />
        </div>
        <div className="flex flex-col gap-5">
          <CustomersDataTable
            title="Customers"
            filters={{ pricingModelId: pricingModel.id }}
            onCreateCustomer={() =>
              setIsCreateCustomerModalOpen(true)
            }
            buttonVariant="outline"
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
        hidePricingModelSelect={true}
      />
      <CreateCustomerFormModal
        isOpen={isCreateCustomerModalOpen}
        setIsOpen={setIsCreateCustomerModalOpen}
      />
      <CreateFeatureModal
        isOpen={isCreateFeatureModalOpen}
        setIsOpen={setIsCreateFeatureModalOpen}
        defaultPricingModelId={pricingModel.id}
      />
      <CreateUsageMeterModal
        isOpen={isCreateUsageMeterModalOpen}
        setIsOpen={setIsCreateUsageMeterModalOpen}
        defaultPricingModelId={pricingModel.id}
        hidePricingModelSelect={true}
      />
      <PricingModelIntegrationGuideModal
        isOpen={isGetIntegrationGuideModalOpen}
        setIsOpen={setIsGetIntegrationGuideModalOpen}
        pricingModelId={pricingModel.id}
      />
    </InternalPageContainer>
  )
}

export default InnerPricingModelDetailsPage
