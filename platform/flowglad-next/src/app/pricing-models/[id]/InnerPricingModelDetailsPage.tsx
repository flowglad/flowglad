'use client'
import {
  Check,
  Copy,
  Download,
  Pencil,
  Sparkles,
  Star,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/app/_trpc/client'
import { CustomersDataTable } from '@/app/customers/data-table'
import { ProductsDataTable } from '@/app/products/data-table'
import { UsageMetersDataTable } from '@/app/usage-meters/data-table'
import CreateUsageMeterModal from '@/components/components/CreateUsageMeterModal'
import { FeaturesDataTable } from '@/components/features/data-table'
import ClonePricingModelModal from '@/components/forms/ClonePricingModelModal'
import CreateCustomerFormModal from '@/components/forms/CreateCustomerFormModal'
import CreateFeatureModal from '@/components/forms/CreateFeatureModal'
import CreateProductModal from '@/components/forms/CreateProductModal'
import EditPricingModelModal from '@/components/forms/EditPricingModelModal'
import { PricingModelIntegrationGuideModal } from '@/components/forms/PricingModelIntegrationGuideModal'
import SetPricingModelAsDefaultModal from '@/components/forms/SetPricingModelAsDefaultModal'
import InnerPageContainerNew from '@/components/InnerPageContainerNew'
import { MoreIcon } from '@/components/icons/MoreIcon'
import PopoverMenu, {
  type PopoverMenuItem,
} from '@/components/PopoverMenu'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { PricingModel } from '@/db/schema/pricingModels'

/**
 * Copyable field component for displaying values with a copy button.
 */
function CopyableField({
  value,
  label,
  displayText,
}: {
  value: string
  label: string
  displayText?: string
}) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  )

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="inline-flex items-center gap-1 cursor-pointer group"
            onClick={handleCopy}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleCopy()
              }
            }}
            aria-label={`Copy ${label}`}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-[hsl(var(--jade-muted-foreground))] flex-shrink-0" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            )}
            <span className="font-sans font-medium text-sm leading-5 text-muted-foreground group-hover:underline transition-colors">
              {copied && displayText
                ? displayText.replace(/^Copy/, 'Copied')
                : (displayText ?? value)}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="font-sans">{value}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export type InnerPricingModelDetailsPageProps = {
  pricingModel: PricingModel.ClientRecord
}

function InnerPricingModelDetailsPage({
  pricingModel,
}: InnerPricingModelDetailsPageProps) {
  const router = useRouter()
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isCloneOpen, setIsCloneOpen] = useState(false)
  const [isSetDefaultOpen, setIsSetDefaultOpen] = useState(false)
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false)
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
      label: 'Integrate',
      handler: () => {
        setIsMoreMenuOpen(false)
        setIsGetIntegrationGuideModalOpen(true)
      },
      icon: <Sparkles className="h-4 w-4" />,
    },
    ...(!pricingModel.isDefault
      ? [
          {
            label: 'Set as Default',
            handler: () => {
              setIsMoreMenuOpen(false)
              setIsSetDefaultOpen(true)
            },
            icon: <Star className="h-4 w-4" />,
          },
        ]
      : []),
    {
      label: 'Edit Name',
      handler: () => {
        setIsMoreMenuOpen(false)
        setIsEditOpen(true)
      },
      icon: <Pencil className="h-4 w-4" />,
    },
    {
      label: 'Duplicate',
      handler: () => {
        setIsMoreMenuOpen(false)
        setIsCloneOpen(true)
      },
      icon: <Copy className="h-4 w-4" />,
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
    <InnerPageContainerNew>
      <div className="w-full relative flex flex-col justify-center pb-6">
        <PageHeaderNew
          title={pricingModel.name}
          breadcrumb="All Pricing"
          onBreadcrumbClick={() => router.push('/pricing-models')}
          badges={
            pricingModel.isDefault
              ? [
                  {
                    icon: <Check className="h-3.5 w-3.5" />,
                    label: 'Default',
                    variant: 'active' as const,
                    tooltip: 'Assigned to new customers by default',
                  },
                ]
              : []
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
                    <MoreIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="font-sans font-medium text-sm leading-5 text-muted-foreground group-hover:underline transition-colors">
                      More options
                    </span>
                  </div>
                </PopoverTrigger>
                <PopoverContent className="w-fit p-1" align="start">
                  <PopoverMenu items={moreMenuItems} />
                </PopoverContent>
              </Popover>
            </div>
          }
        />

        <div className="flex flex-col gap-5 mt-6">
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
    </InnerPageContainerNew>
  )
}

export default InnerPricingModelDetailsPage
