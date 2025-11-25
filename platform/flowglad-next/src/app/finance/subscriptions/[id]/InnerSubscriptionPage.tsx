'use client'
import InternalPageContainer from '@/components/InternalPageContainer'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import { RichSubscription } from '@/subscriptions/schemas'
import { PaymentsDataTable } from '../../payments/data-table'
import { useAuthContext } from '@/contexts/authContext'
import core from '@/utils/core'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Customer } from '@/db/schema/customers'
import { Product } from '@/db/schema/products'
import { PricingModel } from '@/db/schema/pricingModels'
import { SubscriptionStatus } from '@/types'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { EditSubscriptionPaymentMethodModal } from './EditSubscriptionPaymentMethodModal'
import { AddSubscriptionFeatureModal } from './AddSubscriptionFeatureModal'
import CancelSubscriptionModal from '@/components/forms/CancelSubscriptionModal'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSubscriptionStatusBadge } from '@/lib/subscription-utils'
import { InvoicesDataTable } from '../../invoices/data-table'
import { SubscriptionFeaturesTable } from './SubscriptionFeaturesTable'
import { ExpandSection } from '@/components/ExpandSection'
import { ProductCard } from '@/components/ProductCard'
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
    <InternalPageContainer>
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
              disabled:
                subscription.status === SubscriptionStatus.Canceled,
            },
          ]}
        />
        <ExpandSection title="Products" defaultExpanded={true}>
          {subscription.subscriptionItems.length > 0 ? (
            <div className="flex w-full flex-col gap-4">
              {subscription.subscriptionItems.map((item) => {
                const { symbol: currencySymbol, value: priceValue } =
                  getCurrencyParts(
                    organization.defaultCurrency,
                    item.unitPrice * item.quantity
                  )

                // Get product ID and name from the price
                const productId = item.price.productId
                const productName =
                  productNames[productId] || 'Unnamed Product'

                // Format renewal date (only for renewing subscriptions)
                const renewalDate =
                  subscription.renews &&
                  subscription.currentBillingPeriodEnd
                    ? `Renews ${core.formatDate(subscription.currentBillingPeriodEnd)}`
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
        <SubscriptionFeaturesTable
          featureItems={subscription.experimental?.featureItems}
          toolbarContent={
            <Button
              size="sm"
              onClick={() => setIsAddFeatureModalOpen(true)}
              disabled={!canAddFeature}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add feature
            </Button>
          }
        />
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
    </InternalPageContainer>
  )
}

export default InnerSubscriptionPage
