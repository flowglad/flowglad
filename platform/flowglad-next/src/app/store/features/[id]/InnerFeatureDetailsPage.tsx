'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, Copy, X } from 'lucide-react'
import InnerPageContainerNew from '@/components/InnerPageContainerNew'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import { Feature } from '@/db/schema/features'
import { PricingModel } from '@/db/schema/pricingModels'
import { UsageMeter } from '@/db/schema/usageMeters'
import { FeatureType, FeatureUsageGrantFrequency } from '@/types'
import EditFeatureModal from '@/components/forms/EditFeatureModal'
import ToggleFeatureModal from './ToggleFeatureModal'
import type { NavigationContext } from '@/lib/navigation-context'

interface InnerFeatureDetailsPageProps {
  feature: Feature.ClientRecord
  pricingModel: PricingModel.ClientRecord | null
  usageMeter: UsageMeter.ClientRecord | null
  /** Optional navigation context for smart breadcrumbs */
  navigationContext?: NavigationContext
}

/**
 * Copyable field component for displaying values with a copy button.
 * Based on Figma design - copy icon is always visible.
 */
function CopyableField({
  value,
  label,
}: {
  value: string
  label: string
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  return (
    <div
      className="inline-flex items-center gap-2 cursor-pointer group"
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
      title={`Click to copy ${label}`}
    >
      <span className="font-sans font-normal text-base leading-6 text-foreground group-hover:underline transition-colors">
        {value}
      </span>
      {copied ? (
        <Check className="h-4 w-4 text-[hsl(var(--jade-muted-foreground))] flex-shrink-0" />
      ) : (
        <Copy className="h-4 w-4 text-foreground flex-shrink-0" />
      )}
    </div>
  )
}

/**
 * Section label component with monospace font (Berkeley Mono style)
 */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono font-medium text-sm text-muted-foreground leading-[1.2]">
      {children}
    </p>
  )
}

/**
 * Section value component with standard font
 */
function SectionValue({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-sans font-normal text-base text-foreground leading-6">
      {children}
    </p>
  )
}

/**
 * Helper text component for descriptions under fields
 */
function HelperText({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-sans font-normal text-sm text-muted-foreground leading-tight">
      {children}
    </p>
  )
}

/**
 * Content section container component
 */
function ContentSection({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2 w-full">{children}</div>
}

/**
 * Get the display text for feature type
 */
function getFeatureTypeDisplayName(type: FeatureType): string {
  switch (type) {
    case FeatureType.Toggle:
      return 'Toggle'
    case FeatureType.UsageCreditGrant:
      return 'Usage Credit Grant'
    default:
      return type
  }
}

/**
 * Get the renewal frequency label
 */
function getRenewalFrequencyLabel(
  frequency: FeatureUsageGrantFrequency | null
): string {
  switch (frequency) {
    case FeatureUsageGrantFrequency.EveryBillingPeriod:
      return 'renews every billing period'
    case FeatureUsageGrantFrequency.Once:
      return 'one-time grant'
    default:
      return ''
  }
}

/**
 * Determines the breadcrumb configuration based on navigation context.
 * Falls back to pricing model if no context is provided.
 */
function getBreadcrumbConfig(
  navigationContext: NavigationContext | undefined,
  pricingModel: PricingModel.ClientRecord | null
): { text: string; href: string } {
  // If user came from a subscription, show subscription breadcrumb
  if (navigationContext?.from === 'subscription' && navigationContext.refId) {
    return {
      text: navigationContext.refName || 'Subscription',
      href: `/finance/subscriptions/${navigationContext.refId}`,
    }
  }

  // If user came from a customer page
  if (navigationContext?.from === 'customer' && navigationContext.refId) {
    return {
      text: navigationContext.refName || 'Customer',
      href: `/customers/${navigationContext.refId}`,
    }
  }

  // If user came from a pricing model page (via navigation context)
  if (navigationContext?.from === 'pricing-model' && navigationContext.refId) {
    return {
      text: navigationContext.refName || 'Pricing Model',
      href: `/store/pricing-models/${navigationContext.refId}`,
    }
  }

  // Default: use pricingModel prop if available (existing behavior)
  if (pricingModel) {
    return {
      text: pricingModel.name,
      href: `/store/pricing-models/${pricingModel.id}`,
    }
  }

  return {
    text: 'Pricing Models',
    href: '/store/pricing-models',
  }
}

function InnerFeatureDetailsPage({
  feature,
  pricingModel,
  usageMeter,
  navigationContext,
}: InnerFeatureDetailsPageProps) {
  const router = useRouter()
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isToggleModalOpen, setIsToggleModalOpen] = useState(false)

  const isUsageCreditGrant =
    feature.type === FeatureType.UsageCreditGrant

  // Get breadcrumb configuration based on navigation context
  const breadcrumbConfig = getBreadcrumbConfig(navigationContext, pricingModel)

  // Determine the status badge configuration
  const statusBadge = feature.active
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
    ...(pricingModel
      ? [
          {
            label: (
              <Link
                href={`/store/pricing-models/${pricingModel.id}`}
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
      label: getFeatureTypeDisplayName(feature.type),
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
    router.push(breadcrumbConfig.href)
  }

  return (
    <InnerPageContainerNew>
      <div className="w-full relative flex flex-col justify-center gap-0 pb-32">
        <PageHeaderNew
          title={feature.name}
          breadcrumb={breadcrumbConfig.text}
          onBreadcrumbClick={handleBreadcrumbClick}
          badges={badges}
          actions={[
            {
              label: 'Edit',
              onClick: handleEdit,
              variant: 'secondary',
            },
            {
              label: feature.active ? 'Deactivate' : 'Activate',
              onClick: handleToggle,
              variant: 'secondary',
            },
          ]}
        />

        {/* Content sections */}
        <div className="flex flex-col gap-8 py-8 w-full">
          {/* Description - only show if provided */}
          {feature.description && (
            <ContentSection>
              <SectionLabel>Description</SectionLabel>
              <SectionValue>{feature.description}</SectionValue>
            </ContentSection>
          )}

          {/* Slug */}
          <ContentSection>
            <SectionLabel>Slug</SectionLabel>
            <CopyableField value={feature.slug} label="slug" />
            <HelperText>
              Used to check access on the SDK. Must be unique within each
              pricing model.
            </HelperText>
          </ContentSection>

          {/* ID */}
          <ContentSection>
            <SectionLabel>ID</SectionLabel>
            <CopyableField value={feature.id} label="ID" />
          </ContentSection>

          {/* Usage Credit Grant - only show for UsageCreditGrant type */}
          {isUsageCreditGrant && feature.amount !== null && (
            <>
              <ContentSection>
                <SectionLabel>Credit Amount</SectionLabel>
                <SectionValue>
                  <span className="font-medium">
                    {feature.amount.toLocaleString()}
                  </span>{' '}
                  credits{' '}
                  {getRenewalFrequencyLabel(feature.renewalFrequency)}
                </SectionValue>
                <HelperText>
                  Credits granted when a customer subscribes to this feature.
                </HelperText>
              </ContentSection>

              {usageMeter && (
                <ContentSection>
                  <SectionLabel>Linked Usage Meter</SectionLabel>
                  <div className="flex flex-col gap-3 p-4 rounded-lg border border-border bg-muted/20">
                    <span className="font-medium text-foreground">
                      {usageMeter.name}
                    </span>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground w-10">
                          Slug
                        </span>
                        <CopyableField
                          value={usageMeter.slug}
                          label="meter slug"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground w-10">
                          ID
                        </span>
                        <CopyableField
                          value={usageMeter.id}
                          label="meter ID"
                        />
                      </div>
                    </div>
                  </div>
                  <HelperText>
                    Usage events recorded against this meter consume credits.
                  </HelperText>
                </ContentSection>
              )}
            </>
          )}
        </div>
      </div>

      {/* Edit Feature Modal */}
      <EditFeatureModal
        isOpen={isEditModalOpen}
        setIsOpen={setIsEditModalOpen}
        feature={feature}
      />

      {/* Toggle Feature Modal */}
      <ToggleFeatureModal
        isOpen={isToggleModalOpen}
        setIsOpen={setIsToggleModalOpen}
        feature={feature}
      />
    </InnerPageContainerNew>
  )
}

export default InnerFeatureDetailsPage

