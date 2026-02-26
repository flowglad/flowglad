'use client'
import type { PricingModel } from '@db-core/schema/pricingModels'
import type { Resource } from '@db-core/schema/resources'
import {
  ArrowUpFromLine,
  Check,
  Circle,
  CopyPlus,
  Download,
  Pencil,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import yaml from 'yaml'
import { trpc } from '@/app/_trpc/client'
import CreateResourceModal from '@/components/components/CreateResourceModal'
import CreateUsageMeterModal from '@/components/components/CreateUsageMeterModal'
import EditResourceModal from '@/components/components/EditResourceModal'
import { ExpandSection } from '@/components/ExpandSection'
import { FeaturesDataTable } from '@/components/features/data-table'
import ClonePricingModelModal from '@/components/forms/ClonePricingModelModal'
import CreateFeatureModal from '@/components/forms/CreateFeatureModal'
import CreateProductModal from '@/components/forms/CreateProductModal'
import EditPricingModelModal from '@/components/forms/EditPricingModelModal'
import MakeLivePricingModelModal from '@/components/forms/MakeLivePricingModelModal'
import { PricingModelIntegrationGuideModal } from '@/components/forms/PricingModelIntegrationGuideModal'
import ReplaceLivePricingModelModal from '@/components/forms/ReplaceLivePricingModelModal'
import { MoreIcon } from '@/components/icons/MoreIcon'
import PageContainer from '@/components/PageContainer'
import PopoverMenu, {
  type PopoverMenuItem,
} from '@/components/PopoverMenu'
import { ProductsGridSection } from '@/components/ProductsGridSection'
import { ResourcesDataTable } from '@/components/resources/data-table'
import { Button } from '@/components/ui/button'
import { CopyableField } from '@/components/ui/copyable-field'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { UsageMetersDataTable } from '@/components/usage-meters/data-table'

export type InnerPricingModelDetailsPageProps = {
  pricingModel: PricingModel.ClientRecord
}

function InnerPricingModelDetailsPage({
  pricingModel,
}: InnerPricingModelDetailsPageProps) {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isCloneOpen, setIsCloneOpen] = useState(false)
  const [isMakeLiveOpen, setIsMakeLiveOpen] = useState(false)
  const [isReplaceOpen, setIsReplaceOpen] = useState(false)
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false)
  const [isCreateProductModalOpen, setIsCreateProductModalOpen] =
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
  const [isCreateResourceModalOpen, setIsCreateResourceModalOpen] =
    useState(false)
  const [isEditResourceModalOpen, setIsEditResourceModalOpen] =
    useState(false)
  const [resourceToEdit, setResourceToEdit] =
    useState<Resource.ClientRecord | null>(null)
  const [activeProductFilter, setActiveProductFilter] =
    useState<string>('active')
  const [activeFeatureFilter, setActiveFeatureFilter] =
    useState<string>('active')
  const { refetch, isFetching } = trpc.pricingModels.export.useQuery(
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
    { value: 'archived', label: 'Archived' },
  ]

  const featureFilterOptions = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'archived', label: 'Archived' },
  ]

  const getProductFilterForTab = (tab: string) => {
    const baseFilter = {
      pricingModelId: pricingModel.id,
      excludeProductsWithNoPrices: true,
    }

    if (tab === 'all') {
      return baseFilter
    }

    // Map 'archived' to active: false, 'active' to active: true
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

    // Map 'archived' to active: false, 'active' to active: true
    return {
      ...baseFilter,
      active: tab === 'active',
    }
  }

  const exportPricingModelHandler = async () => {
    const result = await refetch()
    const pricingModelData = result.data?.pricingModel

    if (pricingModelData) {
      // Convert JSON to YAML for human-readable export
      const pricingModelYAML = yaml.stringify(pricingModelData)
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
      label: 'Edit name',
      handler: () => {
        setIsMoreMenuOpen(false)
        setIsEditOpen(true)
      },
      icon: <Pencil className="h-4 w-4" />,
    },
    {
      label: 'Integrate',
      handler: () => {
        setIsMoreMenuOpen(false)
        setIsGetIntegrationGuideModalOpen(true)
      },
      icon: <Sparkles className="h-4 w-4" />,
    },
    {
      label: 'Duplicate',
      handler: () => {
        setIsMoreMenuOpen(false)
        setIsCloneOpen(true)
      },
      icon: <CopyPlus className="h-4 w-4" />,
    },
    {
      label: 'Export',
      handler: () => {
        setIsMoreMenuOpen(false)
        exportPricingModelHandler()
      },
      icon: <Download className="h-4 w-4" />,
    },
  ]

  return (
    <PageContainer>
      <div className="w-full relative flex flex-col justify-center pb-6">
        <PageHeaderNew
          title={pricingModel.name}
          className="pb-4"
          badges={
            pricingModel.livemode
              ? [
                  {
                    icon: <Check className="h-3.5 w-3.5" />,
                    label: 'Live',
                    variant: 'active' as const,
                    tooltip:
                      'Production pricing. Changes here affect customers paying real money.',
                  },
                ]
              : [
                  {
                    icon: <Circle className="h-3.5 w-3.5" />,
                    label: 'Test',
                    variant: 'warning' as const,
                    tooltip: pricingModel.isDefault
                      ? 'Your sandbox. Test changes risk-free before going live. New customers without a specified pricing model are assigned here.'
                      : 'Your sandbox. Test changes risk-free before going live.',
                  },
                ]
          }
          description={
            <div className="flex items-center gap-2">
              <CopyableField
                value={pricingModel.id}
                label="ID"
                displayText="Copy ID"
              />
              <div className="h-[22px] w-px bg-muted-foreground opacity-10" />
              <Popover
                open={isMoreMenuOpen}
                onOpenChange={setIsMoreMenuOpen}
              >
                <PopoverTrigger asChild>
                  <div
                    className="inline-flex items-center gap-1 cursor-pointer group"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setIsMoreMenuOpen(true)
                      }
                    }}
                    aria-label="More options"
                  >
                    <MoreIcon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground flex-shrink-0 transition-colors" />
                    <span className="font-sans font-medium text-sm leading-5 text-muted-foreground group-hover:underline group-hover:text-foreground transition-colors">
                      More options
                    </span>
                  </div>
                </PopoverTrigger>
                <PopoverContent className="w-fit p-1" align="start">
                  <PopoverMenu items={moreMenuItems} />
                </PopoverContent>
              </Popover>
              {!pricingModel.livemode && (
                <>
                  <div className="h-[22px] w-px bg-muted-foreground opacity-10" />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 gap-1.5"
                    onClick={() => setIsMakeLiveOpen(true)}
                    title="Replace your livemode pricing model setup with this test model's configuration"
                  >
                    <ArrowUpFromLine className="h-3.5 w-3.5" />
                    Make Live
                  </Button>
                </>
              )}
              {pricingModel.livemode && (
                <>
                  <div className="h-[22px] w-px bg-muted-foreground opacity-10" />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 gap-1.5"
                    onClick={() => setIsReplaceOpen(true)}
                    title="Replace this livemode setup with a test pricing model's configuration"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Replace
                  </Button>
                </>
              )}
            </div>
          }
        />

        <ExpandSection
          title="Products"
          defaultExpanded={true}
          contentPadding={false}
        >
          <ProductsGridSection
            filters={getProductFilterForTab(activeProductFilter)}
            filterOptions={productFilterOptions}
            activeFilter={activeProductFilter}
            onFilterChange={setActiveProductFilter}
            onCreateProduct={() => setIsCreateProductModalOpen(true)}
            viewAllHref={`/products?pricingModelId=${pricingModel.id}`}
          />
        </ExpandSection>
        <ExpandSection
          title="Features"
          defaultExpanded={false}
          contentPadding={false}
        >
          <FeaturesDataTable
            filters={getFeatureFilterForTab(activeFeatureFilter)}
            filterOptions={featureFilterOptions}
            activeFilter={activeFeatureFilter}
            onFilterChange={setActiveFeatureFilter}
            onCreateFeature={() => setIsCreateFeatureModalOpen(true)}
            buttonVariant="secondary"
            hiddenColumns={['slug', 'id', 'status']}
          />
        </ExpandSection>
        <ExpandSection
          title="Usage Meters"
          defaultExpanded={false}
          contentPadding={false}
        >
          <UsageMetersDataTable
            filters={{ pricingModelId: pricingModel.id }}
            onCreateUsageMeter={() =>
              setIsCreateUsageMeterModalOpen(true)
            }
            buttonVariant="secondary"
          />
        </ExpandSection>
        <ExpandSection
          title="Resources"
          defaultExpanded={false}
          contentPadding={false}
        >
          <ResourcesDataTable
            filters={{ pricingModelId: pricingModel.id }}
            onCreateResource={() =>
              setIsCreateResourceModalOpen(true)
            }
            onEditResource={(resource: Resource.ClientRecord) => {
              setResourceToEdit(resource)
              setIsEditResourceModalOpen(true)
            }}
            buttonVariant="secondary"
          />
        </ExpandSection>
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
      <CreateFeatureModal
        isOpen={isCreateFeatureModalOpen}
        setIsOpen={setIsCreateFeatureModalOpen}
        defaultPricingModelId={pricingModel.id}
      />
      <CreateUsageMeterModal
        isOpen={isCreateUsageMeterModalOpen}
        setIsOpen={setIsCreateUsageMeterModalOpen}
        defaultPricingModelId={pricingModel.id}
      />
      <CreateResourceModal
        isOpen={isCreateResourceModalOpen}
        setIsOpen={setIsCreateResourceModalOpen}
        defaultPricingModelId={pricingModel.id}
        hidePricingModelSelect={true}
      />
      {resourceToEdit && (
        <EditResourceModal
          isOpen={isEditResourceModalOpen}
          setIsOpen={setIsEditResourceModalOpen}
          resource={resourceToEdit}
        />
      )}
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
      {!pricingModel.livemode && (
        <MakeLivePricingModelModal
          isOpen={isMakeLiveOpen}
          setIsOpen={setIsMakeLiveOpen}
          pricingModel={pricingModel}
        />
      )}
      {pricingModel.livemode && (
        <ReplaceLivePricingModelModal
          isOpen={isReplaceOpen}
          setIsOpen={setIsReplaceOpen}
          pricingModel={pricingModel}
        />
      )}
    </PageContainer>
  )
}

export default InnerPricingModelDetailsPage
