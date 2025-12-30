'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/app/_trpc/client'
import { PaymentsDataTable } from '@/app/finance/payments/data-table'
import { SubscriptionsDataTable } from '@/app/finance/subscriptions/data-table'
import { DetailLabel } from '@/components/DetailLabel'
import { ExpandSection } from '@/components/ExpandSection'
import { CreateSubscriptionFormModal } from '@/components/forms/CreateSubscriptionFormModal'
import { CopyableField } from '@/components/ui/copyable-field'
import { useAuthenticatedContext } from '@/contexts/authContext'
import type { Customer } from '@/db/schema/customers'
import type { Payment } from '@/db/schema/payments'
import type { UsageEvent } from '@/db/schema/usageEvents'
import { CurrencyCode, PaymentStatus } from '@/types'
import core from '@/utils/core'
import { filterAvailableSubscriptionProducts } from '@/utils/productHelpers'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { PurchasesDataTable } from './purchases/data-table'
import { UsageEventsDataTable } from './usage-events/data-table'

const CustomerDetailsSection = ({
  customer,
  payments,
  usageEvents,
  currency,
}: {
  customer: Customer.ClientRecord
  payments: Payment.ClientRecord[]
  usageEvents: UsageEvent.ClientRecord[]
  currency: CurrencyCode
}) => {
  const billingPortalURL = core.customerBillingPortalURL({
    organizationId: customer.organizationId,
    customerId: customer.id,
  })

  // Calculate usage events metrics
  const totalUsageEvents = usageEvents.length
  const totalUsageAmount = usageEvents.reduce(
    (sum, event) => sum + event.amount,
    0
  )
  const latestUsageEvent =
    usageEvents.length > 0
      ? usageEvents.reduce((latest, current) =>
          new Date(current.usageDate) > new Date(latest.usageDate)
            ? current
            : latest
        )
      : null

  return (
    <div className="w-full min-w-40 flex flex-col gap-4 py-2 px-3">
      <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-x-8 gap-y-4">
        <div className="flex flex-col gap-4 overflow-hidden min-w-0">
          <DetailLabel
            label="Email"
            value={
              <CopyableField
                value={customer.email}
                label="Email"
                truncate
              />
            }
          />
          <DetailLabel
            label="ID"
            value={
              <CopyableField
                value={customer.id}
                label="ID"
                truncate
              />
            }
          />
          <DetailLabel
            label="External ID"
            value={
              <CopyableField
                value={customer.externalId}
                label="External ID"
                truncate
              />
            }
          />
          <DetailLabel
            label="Pricing Model ID"
            value={
              customer.pricingModelId ? (
                <CopyableField
                  value={customer.pricingModelId}
                  label="Pricing Model ID"
                  truncate
                />
              ) : (
                '-'
              )
            }
          />
          <DetailLabel
            label="Portal URL"
            value={
              <CopyableField
                value={billingPortalURL}
                label="Portal URL"
                truncate
              />
            }
          />
        </div>
        <div className="flex flex-col gap-4">
          <DetailLabel
            label="Customer Since"
            value={core.formatDate(customer.createdAt)}
          />
          <DetailLabel
            label="Total Spend"
            value={stripeCurrencyAmountToHumanReadableCurrencyAmount(
              currency,
              payments
                .filter(
                  (payment) =>
                    payment.status === PaymentStatus.Succeeded ||
                    payment.status === PaymentStatus.Processing
                )
                .reduce((acc, payment) => acc + payment.amount, 0)
            )}
          />
          <DetailLabel
            label="Total Usage Events"
            value={totalUsageEvents.toString()}
          />
          <DetailLabel
            label="Total Usage Amount"
            value={totalUsageAmount.toString()}
          />
          <DetailLabel
            label="Latest Usage"
            value={
              latestUsageEvent?.usageDate
                ? core.formatDate(
                    new Date(latestUsageEvent.usageDate)
                  )
                : 'None'
            }
          />
        </div>
      </div>
    </div>
  )
}
export interface CustomerBillingSubPageProps {
  customer: Customer.ClientRecord
  payments: Payment.ClientRecord[]
  usageEvents: UsageEvent.ClientRecord[]
}

export const CustomerBillingSubPage = ({
  customer,
  payments,
  usageEvents,
}: CustomerBillingSubPageProps) => {
  const [
    createSubscriptionModalOpen,
    setCreateSubscriptionModalOpen,
  ] = useState(false)

  const { organization } = useAuthenticatedContext()

  // Fetch pricing model for customer
  const { data: pricingModelData, error: pricingModelError } =
    trpc.customers.getPricingModelForCustomer.useQuery({
      customerId: customer.id,
    })

  // Fetch customer subscriptions to check if they're on a free plan
  const { data: subscriptionsData, error: subscriptionsError } =
    trpc.subscriptions.getTableRows.useQuery({
      filters: { customerId: customer.id },
      pageSize: 100, // Get all subscriptions to check for free plan
    })

  // Show error toasts when queries fail
  useEffect(() => {
    if (pricingModelError) {
      toast.error(
        'Failed to load pricing model. Please refresh the page.',
        {
          description: pricingModelError.message,
        }
      )
    }
  }, [pricingModelError])

  useEffect(() => {
    if (subscriptionsError) {
      toast.error(
        'Failed to load subscriptions. Please refresh the page.',
        {
          description: subscriptionsError.message,
        }
      )
    }
  }, [subscriptionsError])

  // Check if customer is on a free plan
  const isOnFreePlan =
    subscriptionsData?.items?.some(
      (item) =>
        item.subscription.isFreePlan && item.subscription.current
    ) ?? false

  // Filter available products
  const availableProducts = pricingModelData?.pricingModel?.products
    ? filterAvailableSubscriptionProducts(
        pricingModelData.pricingModel.products
      )
    : []

  // Check if org allows multiple subscriptions
  const allowsMultipleSubscriptions =
    organization?.allowMultipleSubscriptionsPerCustomer ?? false

  // Determine if button should be shown
  const hasAvailableProducts = availableProducts.length > 0
  const canCreateSubscription =
    isOnFreePlan || allowsMultipleSubscriptions
  const shouldShow = hasAvailableProducts && canCreateSubscription

  const isLoading = !pricingModelData || !subscriptionsData
  const hasError = !!pricingModelError || !!subscriptionsError

  if (!organization) {
    return null
  }

  return (
    <>
      <div className="w-full flex flex-col">
        <ExpandSection title="Details" defaultExpanded={true}>
          <CustomerDetailsSection
            customer={customer}
            payments={payments}
            usageEvents={usageEvents}
            currency={organization.defaultCurrency}
          />
        </ExpandSection>

        <ExpandSection
          title="Subscriptions"
          defaultExpanded={true}
          contentPadding={false}
        >
          <SubscriptionsDataTable
            externalFilters={{
              customerId: customer.id,
            }}
            onCreateSubscription={
              shouldShow && !isLoading && !hasError
                ? () => setCreateSubscriptionModalOpen(true)
                : undefined
            }
            hiddenColumns={['customerName']}
            defaultPlanType="all"
          />
        </ExpandSection>

        <ExpandSection
          title="Payments"
          defaultExpanded={false}
          contentPadding={false}
        >
          <PaymentsDataTable
            filters={{
              customerId: customer.id,
            }}
            hiddenColumns={['customerName']}
          />
        </ExpandSection>

        <ExpandSection
          title="Purchases"
          defaultExpanded={false}
          contentPadding={false}
        >
          <PurchasesDataTable
            filters={{
              customerId: customer.id,
            }}
            hiddenColumns={['customerName', 'id']}
          />
        </ExpandSection>

        <ExpandSection
          title="Usage Events"
          defaultExpanded={false}
          contentPadding={false}
        >
          <UsageEventsDataTable
            filters={{
              customerId: customer.id,
            }}
          />
        </ExpandSection>
      </div>

      <CreateSubscriptionFormModal
        isOpen={createSubscriptionModalOpen}
        setIsOpen={setCreateSubscriptionModalOpen}
        customerId={customer.id}
      />
    </>
  )
}
