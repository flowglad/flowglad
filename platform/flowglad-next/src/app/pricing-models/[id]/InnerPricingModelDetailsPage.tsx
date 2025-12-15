'use client'
import {
  Copy,
  Download,
  Ellipsis,
  Pencil,
  Plus,
  Sparkles,
  Star,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/app/_trpc/client'
import { CustomersDataTable } from '@/app/customers/data-table'
import { ProductsDataTable } from '@/app/products/data-table'
import { UsageMetersDataTable } from '@/app/usage-meters/data-table'
import CreateUsageMeterModal from '@/components/components/CreateUsageMeterModal'
import DefaultBadge from '@/components/DefaultBadge'
import { FeaturesDataTable } from '@/components/features/data-table'
import ClonePricingModelModal from '@/components/forms/ClonePricingModelModal'
import CreateCustomerFormModal from '@/components/forms/CreateCustomerFormModal'
import CreateFeatureModal from '@/components/forms/CreateFeatureModal'
import CreateProductModal from '@/components/forms/CreateProductModal'
import EditPricingModelModal from '@/components/forms/EditPricingModelModal'
import { PricingModelIntegrationGuideModal } from '@/components/forms/PricingModelIntegrationGuideModal'
import SetPricingModelAsDefaultModal from '@/components/forms/SetPricingModelAsDefaultModal'
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
import { TableHeader } from '@/components/ui/table-header'
import type { PricingModel } from '@/db/schema/pricingModels'

export type InnerPricingModelDetailsPageProps = {
  pricingModel: PricingModel.ClientRecord
}

function InnerPricingModelDetailsPage({
  pricingModel,
}: InnerPricingModelDetailsPageProps) {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isCloneOpen, setIsCloneOpen] = useState(false)
  const [isSetDefaultOpen, setIsSetDefaultOpen] = useState(false)
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
    useState<string>('active')
  const [activeFeatureFilter, setActiveFeatureFilter] =
    useState<string>('active')
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

  const featureFilterOptions = [
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

  const getFeatureFilterForTab = (tab: string) => {
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
      console.error('Failed to export pricing model', result)
    }
  }

  const moreMenuItems: PopoverMenuItem[] = [
    {
      label: 'Duplicate',
      handler: () => setIsCloneOpen(true),
      icon: <Copy className="h-4 w-4" />,
    },
    ...(!pricingModel.isDefault
      ? [
          {
            label: 'Set Default',
            handler: () => setIsSetDefaultOpen(true),
            icon: <Star className="h-4 w-4" />,
          },
        ]
      : []),
    {
      label: 'Export as YAML',
      handler: () => exportPricingModelHandler(),
      icon: <Download className="h-4 w-4" />,
    },
    {
      label: 'Integrate via Prompt',
      handler: () => setIsGetIntegrationGuideModalOpen(true),
      icon: <Sparkles className="h-4 w-4" />,
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
            filters={getFeatureFilterForTab(activeFeatureFilter)}
            filterOptions={featureFilterOptions}
            activeFilter={activeFeatureFilter}
            onFilterChange={setActiveFeatureFilter}
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
      <ClonePricingModelModal
        isOpen={isCloneOpen}
        setIsOpen={setIsCloneOpen}
        pricingModel={pricingModel}
      />
      <SetPricingModelAsDefaultModal
        isOpen={isSetDefaultOpen}
        setIsOpen={setIsSetDefaultOpen}
        pricingModel={pricingModel}
      />
    </InternalPageContainer>
  )
}

export default InnerPricingModelDetailsPage
