'use client'

import { AlertCircle } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/app/_trpc/client'
import { InvoicesList } from '@/registry/base/invoices-list/invoices-list'
import { PaymentMethodsList } from '@/registry/base/payment-methods-list/payment-methods-list'
import { SubscriptionCard } from '@/registry/base/subscription-card/subscription-card'
import type { SubscriptionStatus } from '@/registry/lib/subscription-status'
import { SubscriptionCancellationArrangement } from '@/types'
import { useCustomerSession } from '@/utils/authClient'
import core from '@/utils/core'
import { BillingPortalHeader } from './components/BillingPortalHeader'
import { BillingPortalNav } from './components/BillingPortalNav'
import { ChangeCustomerButton } from './components/ChangeCustomerButton'

// Prevent server-side rendering for this component
function BillingPortalPage() {
  const params = useParams<{
    organizationId: string
    customerId: string
  }>()
  const router = useRouter()
  const { organizationId, customerId } = params
  const { data: session, isPending: isSessionLoading } =
    useCustomerSession()
  const utils = trpc.useUtils()
  const [activeSection, setActiveSection] = useState<
    'subscription' | 'payment-methods' | 'invoices'
  >('subscription')

  // Check if user has multiple customer profiles
  const { data: customersData, isLoading: isLoadingCustomers } =
    trpc.customerBillingPortal.getCustomersForUserAndOrganization.useQuery(
      {},
      {
        enabled: !!session?.user,
      }
    )

  // Fetch billing data
  const { data, isLoading, error } =
    trpc.customerBillingPortal.getBilling.useQuery(
      {
        customerId,
      },
      {
        enabled: !!session?.user && !!customerId,
      }
    )

  const hasMultipleCustomers =
    (customersData?.customers?.length ?? 0) > 1

  // Validate that the user has access to this specific customer
  const currentCustomer = customersData?.customers?.find(
    (c) => c.id === customerId
  )

  useEffect(() => {
    if (!session && !isSessionLoading) {
      router.push(`/billing-portal/${organizationId}/sign-in`)
      return
    }

    // If customers are loaded and current customer is not in the list
    if (
      customersData?.customers &&
      !currentCustomer &&
      !isLoadingCustomers
    ) {
      toast.error(
        'This customer either does not exist or you do not have access to it'
      )
      router.replace(
        `/billing-portal/${organizationId}/select-customer`
      )
    }
    // FIXME(FG-384): Fix this warning:
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    session,
    customersData,
    currentCustomer,
    organizationId,
    router,
    customerId,
  ])

  // Cancel subscription mutation
  const cancelSubscriptionMutation =
    trpc.customerBillingPortal.cancelSubscription.useMutation({
      onSuccess: async () => {
        // Invalidate and refetch billing data to get updated subscription state
        await utils.customerBillingPortal.getBilling.invalidate({
          customerId,
        })
      },
    })

  // Uncancel subscription mutation
  const uncancelSubscriptionMutation =
    trpc.customerBillingPortal.uncancelSubscription.useMutation({
      onSuccess: async () => {
        // Invalidate and refetch billing data to get updated subscription state
        await utils.customerBillingPortal.getBilling.invalidate({
          customerId,
        })
      },
    })

  // Create add payment method session mutation
  const createPaymentSessionMutation =
    trpc.customerBillingPortal.createAddPaymentMethodSession.useMutation(
      {
        onSuccess: (data) => {
          window.location.href = data.sessionUrl
        },
      }
    )

  // Set default payment method mutation
  const setDefaultPaymentMethodMutation =
    trpc.customerBillingPortal.setDefaultPaymentMethod.useMutation({
      onSuccess: async () => {
        await utils.customerBillingPortal.getBilling.invalidate({
          customerId,
        })
      },
    })

  const handleCancelSubscription = async (subscriptionId: string) => {
    await cancelSubscriptionMutation.mutateAsync({
      customerId,
      id: subscriptionId,
      cancellation: {
        timing:
          SubscriptionCancellationArrangement.AtEndOfCurrentBillingPeriod,
      },
    })
  }

  const handleUncancelSubscription = async (
    subscriptionId: string
  ) => {
    await uncancelSubscriptionMutation.mutateAsync({
      customerId,
      id: subscriptionId,
    })
  }

  const handleAddPaymentMethod = async () => {
    await createPaymentSessionMutation.mutateAsync({
      customerId,
    })
  }

  const handleSetDefaultPaymentMethod = async (
    paymentMethodId: string
  ) => {
    await setDefaultPaymentMethodMutation.mutateAsync({
      customerId,
      paymentMethodId,
    })
  }

  const handleDownloadInvoice = (invoiceId: string) => {
    window.open(
      core.safeUrl(
        `/invoice/view/${organizationId}/${invoiceId}`,
        core.NEXT_PUBLIC_APP_URL
      ),
      '_blank'
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <BillingPortalHeader customer={null} loading />
        <div className="container mx-auto px-4 py-8 max-w-6xl">
          <div className="space-y-8">
            <div className="h-48 w-full bg-muted/10 rounded-lg animate-pulse" />
            <div className="h-64 w-full bg-muted/10 rounded-lg animate-pulse" />
            <div className="h-96 w-full bg-muted/10 rounded-lg animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <BillingPortalHeader customer={null} />
        <div className="container mx-auto px-4 py-8 max-w-6xl">
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">
                {error?.message ||
                  'Failed to load billing information. Please try again.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }
  if (!data) {
    return <></>
  }

  const currentSubscription = data.currentSubscriptions?.[0]
  let currentPeriodEnd
  let currentPeriodStart
  let cancelAtPeriodEnd = false
  let canceledAt
  let trialEnd
  if (currentSubscription?.renews) {
    currentPeriodEnd = currentSubscription.currentBillingPeriodEnd
    currentPeriodStart = currentSubscription.currentBillingPeriodStart
    cancelAtPeriodEnd = Boolean(currentSubscription.cancelScheduledAt)
    canceledAt = currentSubscription.canceledAt
    trialEnd = currentSubscription.trialEnd
  }

  // Check if subscription is on the default plan
  const isDefaultPlanSubscription = currentSubscription
    ? currentSubscription.subscriptionItems.some((item) => {
        const defaultProductId = data.pricingModel.defaultProduct?.id
        return (
          defaultProductId &&
          item.price.productId === defaultProductId
        )
      })
    : false
  return (
    <div className="min-h-screen bg-background">
      <BillingPortalHeader customer={data.customer} />

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {hasMultipleCustomers && (
          <div className="mb-6 flex justify-end">
            <ChangeCustomerButton
              organizationId={params.organizationId}
              currentCustomerId={params.customerId}
            />
          </div>
        )}

        <BillingPortalNav
          activeSection={activeSection}
          onSectionChange={setActiveSection}
        />

        <div className="mt-8 space-y-8">
          {activeSection === 'subscription' && (
            <section>
              {currentSubscription ? (
                <SubscriptionCard
                  subscription={{
                    id: currentSubscription.id,
                    name: currentSubscription.name || 'Subscription',
                    status:
                      currentSubscription.status as SubscriptionStatus,
                    currentPeriodEnd: currentPeriodEnd
                      ? new Date(currentPeriodEnd)
                      : undefined,
                    currentPeriodStart: currentPeriodStart
                      ? new Date(currentPeriodStart)
                      : undefined,
                    cancelAtPeriodEnd,
                    canceledAt: canceledAt
                      ? new Date(canceledAt)
                      : undefined,
                    trialEnd: trialEnd
                      ? new Date(trialEnd)
                      : undefined,
                    currency: 'usd',
                    items: currentSubscription.subscriptionItems.map(
                      (item) => ({
                        id: item.id,
                        productName: item.name || '',
                        quantity: item.quantity,
                        unitAmount: item.unitPrice,
                        priceId: item.priceId || '',
                        productId: '',
                      })
                    ),
                  }}
                  onCancel={
                    isDefaultPlanSubscription
                      ? undefined
                      : handleCancelSubscription
                  }
                  onUncancel={
                    isDefaultPlanSubscription
                      ? undefined
                      : handleUncancelSubscription
                  }
                  loading={
                    cancelSubscriptionMutation.isPending ||
                    uncancelSubscriptionMutation.isPending
                  }
                />
              ) : (
                <div className="text-center py-12 bg-muted/50 rounded-lg">
                  <p className="text-muted-foreground mb-4">
                    No active subscription
                  </p>
                </div>
              )}
            </section>
          )}

          {activeSection === 'payment-methods' && (
            <section>
              <PaymentMethodsList
                paymentMethods={data.paymentMethods.map((pm) => {
                  const paymentData = pm.paymentMethodData || {}
                  return {
                    id: pm.id,
                    type: 'card' as const,
                    last4: String(paymentData.last4 || '****'),
                    brand: String(paymentData.brand || 'unknown'),
                    expiryMonth:
                      typeof paymentData.exp_month === 'number'
                        ? paymentData.exp_month
                        : undefined,
                    expiryYear:
                      typeof paymentData.exp_year === 'number'
                        ? paymentData.exp_year
                        : undefined,
                    isDefault: pm.default || false,
                  }
                })}
                defaultPaymentMethodId={
                  data.paymentMethods.find((pm) => pm.default)?.id
                }
                onAddPaymentMethod={handleAddPaymentMethod}
                onSetDefault={handleSetDefaultPaymentMethod}
                loading={
                  createPaymentSessionMutation.isPending ||
                  setDefaultPaymentMethodMutation.isPending
                }
              />
            </section>
          )}

          {activeSection === 'invoices' && (
            <section>
              <InvoicesList
                invoices={data.invoices.map((inv) => {
                  const invoice = inv.invoice
                  return {
                    id: invoice.id,
                    number: invoice.invoiceNumber,
                    status: invoice.status,
                    created: new Date(invoice.createdAt),
                    dueDate: invoice.dueDate
                      ? new Date(invoice.dueDate)
                      : undefined,
                    amountDue: 0,
                    currency: invoice.currency,
                    hostedInvoiceUrl: invoice.pdfURL || undefined,
                  }
                })}
                onInvoiceClick={handleDownloadInvoice}
              />
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

export default BillingPortalPage
