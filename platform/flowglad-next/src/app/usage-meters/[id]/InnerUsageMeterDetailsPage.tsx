'use client'

import { sentenceCase } from 'change-case'
import { DollarSign } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import EditUsageMeterModal from '@/components/components/EditUsageMeterModal'
import InnerPageContainerNew from '@/components/InnerPageContainerNew'
import { CopyableField } from '@/components/ui/copyable-field'
import {
  ContentSection,
  HelperText,
  SectionLabel,
  SectionValue,
} from '@/components/ui/detail-section'
import { PageHeaderNew } from '@/components/ui/page-header-new'
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
      </div>

      {/* Edit Usage Meter Modal */}
      <EditUsageMeterModal
        isOpen={isEditModalOpen}
        setIsOpen={setIsEditModalOpen}
        usageMeter={usageMeter}
      />
    </InnerPageContainerNew>
  )
}

export default InnerUsageMeterDetailsPage
