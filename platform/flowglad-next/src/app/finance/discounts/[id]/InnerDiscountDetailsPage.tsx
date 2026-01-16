'use client'

import { Check, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import EditDiscountModal from '@/components/forms/EditDiscountModal'
import PageContainer from '@/components/PageContainer'
import { CopyableField } from '@/components/ui/copyable-field'
import {
  ContentSection,
  HelperText,
  SectionLabel,
  SectionValue,
} from '@/components/ui/detail-section'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { Discount } from '@/db/schema/discounts'
import {
  CurrencyCode,
  DiscountAmountType,
  DiscountDuration,
} from '@/types'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import ToggleDiscountModal from './ToggleDiscountModal'

interface InnerDiscountDetailsPageProps {
  discount: Discount.ClientRecord
  redemptionCount: number
}

/**
 * Get the display text for discount amount type
 */
function getAmountTypeDisplayName(type: DiscountAmountType): string {
  switch (type) {
    case DiscountAmountType.Percent:
      return 'Percentage'
    case DiscountAmountType.Fixed:
      return 'Fixed Amount'
    default:
      return type
  }
}

/**
 * Get the display text for discount duration
 */
function getDurationDisplayName(
  discount: Discount.ClientRecord
): string {
  if (discount.duration === DiscountDuration.Once) {
    return 'One-time'
  }
  if (discount.duration === DiscountDuration.Forever) {
    return 'Forever'
  }
  if (discount.duration === DiscountDuration.NumberOfPayments) {
    return `${discount.numberOfPayments} payment${discount.numberOfPayments !== 1 ? 's' : ''}`
  }
  // Exhaustive check - should never reach here
  const _exhaustive: never = discount
  return _exhaustive
}

/**
 * Get the duration helper text
 */
function getDurationHelperText(duration: DiscountDuration): string {
  switch (duration) {
    case DiscountDuration.Once:
      return 'This discount will only be applied to the first payment.'
    case DiscountDuration.Forever:
      return 'This discount will be applied to all payments for the lifetime of the subscription.'
    case DiscountDuration.NumberOfPayments:
      return 'This discount will be applied for the specified number of payments.'
    default:
      return ''
  }
}

/**
 * Format the discount amount for display
 */
function formatDiscountAmount(
  discount: Discount.ClientRecord,
  currency: CurrencyCode
): string {
  if (discount.amountType === DiscountAmountType.Percent) {
    return `${discount.amount}%`
  }
  return stripeCurrencyAmountToHumanReadableCurrencyAmount(
    currency,
    discount.amount
  )
}

function InnerDiscountDetailsPage({
  discount,
  redemptionCount,
}: InnerDiscountDetailsPageProps) {
  const router = useRouter()
  const { organization } = useAuthenticatedContext()
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isToggleModalOpen, setIsToggleModalOpen] = useState(false)

  const currency = organization?.defaultCurrency ?? CurrencyCode.USD

  // Determine the status badge configuration
  const statusBadge = discount.active
    ? {
        icon: (
          <Check
            className="w-full h-full stroke-current"
            strokeWidth={3}
          />
        ),
        label: 'Active',
        variant: 'active' as const,
      }
    : {
        icon: (
          <X
            className="w-full h-full stroke-current"
            strokeWidth={3}
          />
        ),
        label: 'Inactive',
        variant: 'destructive' as const,
      }

  // Build badges array
  const badges = [
    statusBadge,
    {
      label: getAmountTypeDisplayName(discount.amountType),
      variant: 'muted' as const,
    },
    {
      label: getDurationDisplayName(discount),
      variant: 'muted' as const,
    },
  ]

  // Handlers for page header actions
  const handleEdit = () => {
    setIsEditModalOpen(true)
  }

  const handleToggle = () => {
    setIsToggleModalOpen(true)
  }

  const handleBreadcrumbClick = () => {
    router.push('/finance/discounts')
  }

  return (
    <PageContainer>
      <div className="w-full relative flex flex-col justify-center gap-0 pb-32">
        <PageHeaderNew
          title={discount.name}
          breadcrumb="Discounts"
          onBreadcrumbClick={handleBreadcrumbClick}
          badges={badges}
          actions={[
            {
              label: 'Edit',
              onClick: handleEdit,
              variant: 'secondary',
            },
            {
              label: discount.active ? 'Deactivate' : 'Activate',
              onClick: handleToggle,
              variant: 'secondary',
            },
          ]}
        />

        {/* Content sections */}
        <div className="flex flex-col gap-8 py-8 px-4 w-full">
          {/* Code */}
          <ContentSection>
            <SectionLabel>Code</SectionLabel>
            <CopyableField value={discount.code} label="code" />
            <HelperText>
              Customers enter this code at checkout to apply the
              discount.
            </HelperText>
          </ContentSection>

          {/* Amount */}
          <ContentSection>
            <SectionLabel>Discount Amount</SectionLabel>
            <SectionValue>
              <span className="font-medium">
                {formatDiscountAmount(discount, currency)}
              </span>{' '}
              off
            </SectionValue>
            <HelperText>
              {discount.amountType === DiscountAmountType.Percent
                ? 'Percentage discount applied to the total price.'
                : 'Fixed amount discount applied to the total price.'}
            </HelperText>
          </ContentSection>

          {/* Duration */}
          <ContentSection>
            <SectionLabel>Duration</SectionLabel>
            <SectionValue>
              {getDurationDisplayName(discount)}
            </SectionValue>
            <HelperText>
              {getDurationHelperText(discount.duration)}
            </HelperText>
          </ContentSection>

          {/* Redemptions */}
          <ContentSection>
            <SectionLabel>Redemptions</SectionLabel>
            <SectionValue>
              <span className="font-medium">{redemptionCount}</span>{' '}
              {redemptionCount === 1 ? 'time' : 'times'} redeemed
            </SectionValue>
            <HelperText>
              Total number of times this discount has been applied.
            </HelperText>
          </ContentSection>

          {/* ID */}
          <ContentSection>
            <SectionLabel>ID</SectionLabel>
            <CopyableField value={discount.id} label="ID" />
          </ContentSection>

          {/* Pricing Model ID */}
          <ContentSection>
            <SectionLabel>Pricing Model ID</SectionLabel>
            <CopyableField
              value={discount.pricingModelId}
              label="Pricing Model ID"
            />
          </ContentSection>
        </div>
      </div>

      {/* Edit Discount Modal - only render when organization is loaded */}
      {organization && (
        <EditDiscountModal
          isOpen={isEditModalOpen}
          setIsOpen={setIsEditModalOpen}
          discount={discount}
        />
      )}

      {/* Toggle Discount Modal */}
      <ToggleDiscountModal
        isOpen={isToggleModalOpen}
        setIsOpen={setIsToggleModalOpen}
        discount={discount}
      />
    </PageContainer>
  )
}

export default InnerDiscountDetailsPage
