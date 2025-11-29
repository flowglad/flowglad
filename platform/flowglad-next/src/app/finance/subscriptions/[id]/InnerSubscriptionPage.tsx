'use client'
import InnerPageContainerNew from '@/components/InnerPageContainerNew'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import { RichSubscription } from '@/subscriptions/schemas'
import { PaymentsDataTable } from '../../payments/data-table'
import { useAuthContext } from '@/contexts/authContext'
import core from '@/utils/core'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Customer } from '@/db/schema/customers'
import { Product } from '@/db/schema/products'
import { PricingModel } from '@/db/schema/pricingModels'
import {
  SubscriptionStatus,
  FeatureType,
  FeatureUsageGrantFrequency,
} from '@/types'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { EditSubscriptionPaymentMethodModal } from './EditSubscriptionPaymentMethodModal'
import { AddSubscriptionFeatureModal } from './AddSubscriptionFeatureModal'
import CancelSubscriptionModal from '@/components/forms/CancelSubscriptionModal'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  getSubscriptionStatusBadge,
  getSubscriptionDateInfo,
} from '@/lib/subscription-utils'
import { InvoicesDataTable } from '../../invoices/data-table'
import { ExpandSection } from '@/components/ExpandSection'
import { ProductCard } from '@/components/ProductCard'
import { CustomerCardNew } from '@/components/CustomerCardNew'
import { ItemFeature } from '@/components/ItemFeature'
import { getCurrencyParts } from '@/utils/stripe'

const InnerSubscriptionPage = ({
  subscription,
  defaultPaymentMethod,
  customer,
  product,
  pricingModel,
  productNames,
}: {
  subscription: RichSubscription
  defaultPaymentMethod: PaymentMethod.ClientRecord | null
  customer: Customer.Record
  product: Product.Record | null
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

  /**
   * Helper function to format the billing period for display
   * Handles singular/plural forms and interval counts
   */
  const formatBillingPeriod = (
    intervalUnit: string | null | undefined,
    intervalCount: number | null | undefined
  ): string => {
    if (!intervalUnit) return 'one-time'

    const count = intervalCount || 1
    const unit = intervalUnit.toLowerCase()

    // Handle singular vs plural
    if (count === 1) {
      return unit
    }

    // Handle plural forms
    return `${count} ${unit}s`
  }

  if (!organization) {
    return <div>Loading...</div>
  }

  return (
    <InnerPageContainerNew>
      <div className="w-full relative flex flex-col justify-center gap-6 pb-6">
        <PageHeaderNew
          title="Subscription Details"
          breadcrumb="Subscriptions"
          onBreadcrumbClick={() =>
            router.push('/finance/subscriptions')
          }
          badges={[
            getSubscriptionStatusBadge(subscription.status),
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
          ]}
          description={`Started ${core.formatDate(subscription.startDate)}`}
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
                const productId = item.price.productId
                const productName =
                  productNames[productId] || 'Unnamed Product'

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
                    href={`/store/products/${productId}`}
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
        <ExpandSection title="Feature Access" defaultExpanded={false}>
          <div className="flex flex-col gap-1 px-3">
            {subscription.experimental?.featureItems?.map((feature) => (
              <ItemFeature
                key={feature.id}
                href={`/store/features/${feature.featureId}`}
              >
                {feature.name}
                {feature.type === FeatureType.UsageCreditGrant &&
                  feature.amount != null && (
                    <span className="text-muted-foreground font-normal">
                      &nbsp;- {feature.amount.toLocaleString()} total credits,{' '}
                      {feature.renewalFrequency ===
                      FeatureUsageGrantFrequency.EveryBillingPeriod
                        ? 'every billing period'
                        : 'one-time'}
                      .
                    </span>
                  )}
              </ItemFeature>
            ))}
            {canAddFeature && (
              <ItemFeature
                icon={Plus}
                onClick={() => setIsAddFeatureModalOpen(true)}
              >
                Add feature
              </ItemFeature>
            )}
          </div>
        </ExpandSection>
        <InvoicesDataTable
          title="Invoices"
          filters={{ subscriptionId: subscription.id }}
        />
        <PaymentsDataTable
          title="Payments"
          filters={{ subscriptionId: subscription.id }}
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
    </InnerPageContainerNew>
  )
}

export default InnerSubscriptionPage
