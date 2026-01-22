'use client'

import { DollarSign, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CustomerCardNew } from '@/components/CustomerCardNew'
import { ExpandSection } from '@/components/ExpandSection'
import CancelSubscriptionModal from '@/components/forms/CancelSubscriptionModal'
import { ItemFeature } from '@/components/ItemFeature'
import PageContainer from '@/components/PageContainer'
import { ProductCard } from '@/components/ProductCard'
import { SubscriptionResourceUsage } from '@/components/subscriptions/SubscriptionResourceUsage'
import { CopyableField } from '@/components/ui/copyable-field'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import {
  statusConfigToPageHeaderBadge,
  subscriptionStatusConfig,
} from '@/components/ui/status-tag'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useAuthContext } from '@/contexts/authContext'
import type { Customer } from '@/db/schema/customers'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { PricingModel } from '@/db/schema/pricingModels'
import { getSubscriptionDateInfo } from '@/lib/subscription-utils'
import type { RichSubscription } from '@/subscriptions/schemas'
import {
  FeatureType,
  FeatureUsageGrantFrequency,
  PriceType,
  SubscriptionStatus,
} from '@/types'
import core from '@/utils/core'
import { formatBillingPeriod, getCurrencyParts } from '@/utils/stripe'
import { AddSubscriptionFeatureModal } from './AddSubscriptionFeatureModal'
import { BillingHistorySection } from './BillingHistorySection'
import { EditSubscriptionPaymentMethodModal } from './EditSubscriptionPaymentMethodModal'

/**
 * Formats the description for a feature item based on its type and renewal frequency.
 */
function formatFeatureDescription(feature: {
  type: string
  amount?: number | null
  renewalFrequency?: string | null
}): string | undefined {
  if (
    feature.type !== FeatureType.UsageCreditGrant ||
    feature.amount == null
  ) {
    return undefined
  }

  if (
    feature.renewalFrequency ===
    FeatureUsageGrantFrequency.EveryBillingPeriod
  ) {
    return `${feature.amount.toLocaleString()} total credits, every billing period`
  } else {
    return `${feature.amount.toLocaleString()} total credits, one-time`
  }
}

const InnerSubscriptionPage = ({
  subscription,
  defaultPaymentMethod,
  customer,
  pricingModel,
  productNames,
}: {
  subscription: RichSubscription
  defaultPaymentMethod: PaymentMethod.ClientRecord | null
  customer: Customer.Record
  pricingModel: PricingModel.Record | null
  productNames: Record<string, string>
}) => {
  const { organization } = useAuthContext()
  const router = useRouter()
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isAddFeatureModalOpen, setIsAddFeatureModalOpen] =
    useState(false)
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false)

  const canAddFeature = subscription.subscriptionItems.length > 0

  // Determine if cancel should be disabled and why
  const isCanceled =
    subscription.status === SubscriptionStatus.Canceled
  const isFreePlan = subscription.isFreePlan === true
  const cannotCancel = isCanceled || isFreePlan

  // Get the appropriate tooltip message for why cancel is disabled
  const getCancelDisabledTooltip = (): string | undefined => {
    if (isFreePlan) {
      return 'Free plans cannot be canceled.'
    }
    if (isCanceled) {
      return 'This subscription has already been canceled.'
    }
    return undefined
  }

  // Handlers for page header actions
  const handleChangePaymentMethod = () => {
    setIsEditDialogOpen(true)
  }

  const handleCancel = () => {
    setIsCancelModalOpen(true)
  }

  if (!organization) {
    return <div>Loading...</div>
  }

  const statusBadge = statusConfigToPageHeaderBadge(
    subscription.status,
    subscriptionStatusConfig
  )

  return (
    <PageContainer>
      <div className="w-full relative flex flex-col justify-center pb-6">
        <PageHeaderNew
          title="Subscription Details"
          breadcrumb="Subscriptions"
          onBreadcrumbClick={() =>
            router.push('/finance/subscriptions')
          }
          badges={[
            {
              ...statusBadge,
              tooltip: 'Subscription status',
            },
            ...(pricingModel
              ? [
                  {
                    label: (
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link
                              href={`/pricing-models/${pricingModel.id}`}
                              className="inline-flex items-center gap-1 group/pricing hover:underline hover:text-foreground transition-colors"
                            >
                              <DollarSign className="h-3.5 w-3.5 group-hover/pricing:text-foreground transition-colors" />
                              {pricingModel.name}
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <p>Pricing Model</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ),
                    variant: 'muted' as const,
                  },
                ]
              : []),
          ]}
          description={
            <CopyableField
              value={subscription.id}
              label="ID"
              displayText="Copy ID"
            />
          }
          actions={[
            {
              label: 'Change Payment Method',
              onClick: handleChangePaymentMethod,
              variant: 'secondary',
            },
            {
              label: 'Cancel',
              onClick: handleCancel,
              variant: 'secondary',
              disabled: cannotCancel,
              disabledTooltip: getCancelDisabledTooltip(),
            },
          ]}
        />
        <ExpandSection title="Products" defaultExpanded={true}>
          {subscription.subscriptionItems.length > 0 ? (
            <div className="flex w-full flex-col gap-4">
              {subscription.subscriptionItems.map((item) => {
                const { symbol: currencySymbol, value: priceValue } =
                  getCurrencyParts(
                    item.price.currency,
                    item.unitPrice * item.quantity,
                    { hideZeroCents: true }
                  )

                // Get product ID and name from the price
                const productId =
                  item.price.type !== PriceType.Usage
                    ? item.price.productId
                    : null
                const productName = productId
                  ? (productNames[productId] ?? 'Unnamed Product')
                  : 'Usage-Based'

                // Get appropriate date info based on subscription lifecycle state
                // (handles active/renewing, cancellation scheduled, and canceled states)
                const dateInfo = getSubscriptionDateInfo(subscription)
                const renewalDate =
                  dateInfo.label && dateInfo.date
                    ? `${dateInfo.label} ${core.formatDate(dateInfo.date)}`
                    : undefined

                return (
                  <ProductCard
                    key={item.id}
                    productName={productName}
                    price={priceValue}
                    period={formatBillingPeriod(
                      item.price.intervalUnit,
                      item.price.intervalCount
                    )}
                    currencySymbol={currencySymbol}
                    variant="subscription"
                    quantity={item.quantity}
                    renewalDate={renewalDate}
                    href={
                      productId ? `/products/${productId}` : undefined
                    }
                  />
                )
              })}
            </div>
          ) : (
            <div className="text-center py-8 px-4 text-muted-foreground">
              No products in this subscription.
            </div>
          )}
        </ExpandSection>
        <ExpandSection title="Customer" defaultExpanded={true}>
          <CustomerCardNew
            variant="simple"
            name={customer.name}
            email={customer.email}
            href={`/customers/${customer.id}`}
          />
        </ExpandSection>
        <ExpandSection
          title="Features Granted"
          defaultExpanded={false}
        >
          <div className="flex flex-col gap-1 w-full">
            {canAddFeature && (
              <ItemFeature
                icon={Plus}
                onClick={() => setIsAddFeatureModalOpen(true)}
              >
                Grant Additional Feature
              </ItemFeature>
            )}
            {subscription.experimental?.featureItems?.map(
              (feature) => (
                <ItemFeature
                  key={feature.id}
                  href={`/features/${feature.featureId}`}
                  description={formatFeatureDescription(feature)}
                >
                  {feature.name}
                </ItemFeature>
              )
            )}
          </div>
        </ExpandSection>
        <ExpandSection title="Resource Usage" defaultExpanded={false}>
          <SubscriptionResourceUsage
            subscriptionId={subscription.id}
          />
        </ExpandSection>
        <BillingHistorySection
          subscriptionId={subscription.id}
          customerId={subscription.customerId}
          customerName={customer.name}
        />
      </div>

      <EditSubscriptionPaymentMethodModal
        isOpen={isEditDialogOpen}
        setIsOpen={setIsEditDialogOpen}
        subscriptionId={subscription.id}
        customerId={subscription.customerId}
        customerName={customer.name}
        currentPaymentMethodId={defaultPaymentMethod?.id}
      />
      <AddSubscriptionFeatureModal
        isOpen={isAddFeatureModalOpen}
        setIsOpen={setIsAddFeatureModalOpen}
        subscriptionItems={subscription.subscriptionItems}
        featureItems={subscription.experimental?.featureItems}
      />
      <CancelSubscriptionModal
        isOpen={isCancelModalOpen}
        setIsOpen={setIsCancelModalOpen}
        subscriptionId={subscription.id}
      />
    </PageContainer>
  )
}

export default InnerSubscriptionPage
