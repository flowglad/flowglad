'use client'

import { sentenceCase } from 'change-case'
import { DollarSign } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { trpc } from '@/app/_trpc/client'
import EditUsageMeterModal from '@/components/components/EditUsageMeterModal'
import { ExpandSection } from '@/components/ExpandSection'
import CreateUsagePriceModal from '@/components/forms/CreateUsagePriceModal'
import EditUsagePriceModal from '@/components/forms/EditUsagePriceModal'
import InnerPageContainerNew from '@/components/InnerPageContainerNew'
import { UsagePricesGridSection } from '@/components/UsagePricesGridSection'
import { CopyableField } from '@/components/ui/copyable-field'
import {
  ContentSection,
  HelperText,
  SectionLabel,
  SectionValue,
} from '@/components/ui/detail-section'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import type { Price } from '@/db/schema/prices'
import { PricingModel } from '@/db/schema/pricingModels'
import { UsageMeter } from '@/db/schema/usageMeters'
import { UsageMeterAggregationType } from '@/types'

interface InnerUsageMeterDetailsPageProps {
  usageMeter: UsageMeter.ClientRecord
  pricingModel: PricingModel.ClientRecord | null
}

/**
 * Get the description for the aggregation type
 */
function getAggregationTypeDescription(
  aggregationType: UsageMeterAggregationType
): string {
  switch (aggregationType) {
    case UsageMeterAggregationType.Sum:
      return 'Sums all usage event amounts for each billing period.'
    case UsageMeterAggregationType.CountDistinctProperties:
      return 'Counts the number of distinct property values for each billing period.'
    default:
      return ''
  }
}

function InnerUsageMeterDetailsPage({
  usageMeter,
  pricingModel,
}: InnerUsageMeterDetailsPageProps) {
  const router = useRouter()
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [
    isCreateUsagePriceModalOpen,
    setIsCreateUsagePriceModalOpen,
  ] = useState(false)
  const [isEditUsagePriceModalOpen, setIsEditUsagePriceModalOpen] =
    useState(false)
  const [selectedPriceId, setSelectedPriceId] = useState<
    string | null
  >(null)
  const [activePriceFilter, setActivePriceFilter] =
    useState<string>('active')

  // Fetch the selected price data when a price is clicked
  const { data: selectedPriceData } = trpc.prices.get.useQuery(
    { id: selectedPriceId! },
    { enabled: !!selectedPriceId && isEditUsagePriceModalOpen }
  )

  // Handler for when a price card is clicked
  const handlePriceClick = (priceId: string) => {
    setSelectedPriceId(priceId)
    setIsEditUsagePriceModalOpen(true)
  }

  // Handler for closing the edit modal
  const handleEditModalClose = (open: boolean) => {
    setIsEditUsagePriceModalOpen(open)
    if (!open) {
      setSelectedPriceId(null)
    }
  }

  // Filter options for the status toggle
  const priceFilterOptions = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ]

  // Build badges array
  const badges = [
    ...(pricingModel
      ? [
          {
            icon: <DollarSign className="h-3.5 w-3.5" />,
            label: (
              <Link
                href={`/pricing-models/${pricingModel.id}`}
                className="hover:underline hover:text-foreground transition-colors"
              >
                {pricingModel.name}
              </Link>
            ),
            variant: 'muted' as const,
          },
        ]
      : []),
    {
      label: sentenceCase(usageMeter.aggregationType),
      variant: 'muted' as const,
    },
  ]

  // Handlers for page header actions
  const handleEdit = () => {
    setIsEditModalOpen(true)
  }

  const handleBreadcrumbClick = () => {
    if (pricingModel) {
      router.push(`/pricing-models/${pricingModel.id}`)
    } else {
      router.push('/pricing-models')
    }
  }

  return (
    <InnerPageContainerNew>
      <div className="w-full relative flex flex-col justify-center gap-0 pb-32">
        <PageHeaderNew
          title={usageMeter.name}
          breadcrumb={pricingModel?.name || 'Pricing Model'}
          onBreadcrumbClick={handleBreadcrumbClick}
          badges={badges}
          actions={[
            {
              label: 'Edit',
              onClick: handleEdit,
              variant: 'secondary',
            },
          ]}
        />

        {/* Content sections */}
        <div className="flex flex-col gap-8 py-8 px-4 w-full">
          {/* Slug */}
          <ContentSection>
            <SectionLabel>Slug</SectionLabel>
            <CopyableField value={usageMeter.slug} label="slug" />
            <HelperText>
              Used to identify this meter when recording usage events
              via the SDK.
            </HelperText>
          </ContentSection>

          {/* ID */}
          <ContentSection>
            <SectionLabel>ID</SectionLabel>
            <CopyableField value={usageMeter.id} label="ID" />
          </ContentSection>

          {/* Aggregation Type */}
          <ContentSection>
            <SectionLabel>Aggregation Type</SectionLabel>
            <SectionValue>
              {sentenceCase(usageMeter.aggregationType)}
            </SectionValue>
            <HelperText>
              {getAggregationTypeDescription(
                usageMeter.aggregationType
              )}
            </HelperText>
          </ContentSection>
        </div>

        {/* Prices Section */}
        <ExpandSection
          title="Prices"
          defaultExpanded={true}
          contentPadding={false}
        >
          <UsagePricesGridSection
            usageMeterId={usageMeter.id}
            filterOptions={priceFilterOptions}
            activeFilter={activePriceFilter}
            onFilterChange={setActivePriceFilter}
            onCreateUsagePrice={() =>
              setIsCreateUsagePriceModalOpen(true)
            }
            onPriceClick={handlePriceClick}
          />
        </ExpandSection>
      </div>

      {/* Edit Usage Meter Modal */}
      <EditUsageMeterModal
        isOpen={isEditModalOpen}
        setIsOpen={setIsEditModalOpen}
        usageMeter={usageMeter}
      />

      {/* Create Usage Price Modal */}
      <CreateUsagePriceModal
        isOpen={isCreateUsagePriceModalOpen}
        setIsOpen={setIsCreateUsagePriceModalOpen}
        usageMeter={usageMeter}
      />

      {/* Edit Usage Price Modal */}
      {selectedPriceData?.price &&
        selectedPriceData.price.type === 'usage' && (
          <EditUsagePriceModal
            isOpen={isEditUsagePriceModalOpen}
            setIsOpen={handleEditModalClose}
            price={selectedPriceData.price as Price.ClientUsageRecord}
            usageMeterId={usageMeter.id}
            pricingModelId={usageMeter.pricingModelId}
          />
        )}
    </InnerPageContainerNew>
  )
}

export default InnerUsageMeterDetailsPage
