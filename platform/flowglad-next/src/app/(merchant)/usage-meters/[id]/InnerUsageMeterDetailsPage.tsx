'use client'

import { UsageMeterAggregationType } from '@db-core/enums'
import type { Price } from '@db-core/schema/prices'
import { PricingModel } from '@db-core/schema/pricingModels'
import { UsageMeter } from '@db-core/schema/usageMeters'
import { sentenceCase } from 'change-case'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { trpc } from '@/app/_trpc/client'
import EditUsageMeterModal from '@/components/components/EditUsageMeterModal'
import { ExpandSection } from '@/components/ExpandSection'
import CreateUsagePriceModal from '@/components/forms/CreateUsagePriceModal'
import EditUsagePriceModal from '@/components/forms/EditUsagePriceModal'
import PageContainer from '@/components/PageContainer'
import { UsagePricesGridSection } from '@/components/UsagePricesGridSection'
import { CopyableField } from '@/components/ui/copyable-field'
import { PageHeaderNew } from '@/components/ui/page-header-new'

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
    {
      label: sentenceCase(usageMeter.aggregationType),
      variant: 'muted' as const,
      tooltip: getAggregationTypeDescription(
        usageMeter.aggregationType
      ),
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
    <PageContainer>
      <div className="w-full relative flex flex-col justify-center gap-0 pb-32">
        <PageHeaderNew
          title={usageMeter.name}
          breadcrumb={pricingModel?.name || 'Pricing Model'}
          onBreadcrumbClick={handleBreadcrumbClick}
          badges={badges}
          description={
            <div className="flex items-center gap-2">
              <CopyableField
                value={usageMeter.id}
                label="ID"
                displayText="Copy ID"
              />
              <div className="h-[22px] w-px bg-muted-foreground opacity-10" />
              <CopyableField
                value={usageMeter.slug}
                label="Slug"
                displayText="Copy Slug"
              />
            </div>
          }
          actions={[
            {
              label: 'Edit',
              onClick: handleEdit,
              variant: 'secondary',
            },
          ]}
        />

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
          />
        )}
    </PageContainer>
  )
}

export default InnerUsageMeterDetailsPage
