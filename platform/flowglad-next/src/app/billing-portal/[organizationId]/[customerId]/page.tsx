'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { trpc } from '@/app/_trpc/client'
import { SubscriptionCard } from '@/registry/base/subscription-card/subscription-card'
import { InvoicesList } from '@/registry/base/invoices-list/invoices-list'
import { PaymentMethodsList } from '@/registry/base/payment-methods-list/payment-methods-list'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'
import { BillingPortalHeader } from './components/BillingPortalHeader'
import { BillingPortalNav } from './components/BillingPortalNav'
import { ChangeCustomerButton } from './components/ChangeCustomerButton'
import { useState } from 'react'
import { SubscriptionCancellationArrangement } from '@/types'
import { useSession } from '@/utils/authClient'
import { toast } from 'sonner'

export default function BillingPortalPage() {
  const params = useParams<{
    organizationId: string
    customerId: string
  }>()
  const router = useRouter()
  const { organizationId, customerId } = params
  const { data: session } = useSession()
  const [activeSection, setActiveSection] = useState<
    'subscription' | 'payment-methods' | 'invoices'
  >('subscription')

  // Check if user has multiple customer profiles
  const { data: customersData } =
    trpc.customerBillingPortal.getCustomersForUserAndOrganization.useQuery(
      {},
      {
        enabled: !!session?.user,
      }
    )

  // Fetch billing data
  const { data, isLoading, error, refetch } =
    trpc.customerBillingPortal.getBilling.useQuery(
      {},
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
    if (!session) {
      router.push('/sign-in')
      return
    }

    // If customers are loaded and current customer is not in the list
    if (customersData?.customers && !currentCustomer) {
      toast.error('Access denied to this customer profile')
      router.replace(
        `/billing-portal/${organizationId}/select-customer`
      )
    }
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
      onSuccess: () => {
        refetch()
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
      onSuccess: () => {
        refetch()
      },
    })

  const handleCancelSubscription = async (subscriptionId: string) => {
    await cancelSubscriptionMutation.mutateAsync({
      id: subscriptionId,
      cancellation: {
        timing:
          SubscriptionCancellationArrangement.AtEndOfCurrentBillingPeriod,
      },
    })
  }

  const handleAddPaymentMethod = async () => {
    await createPaymentSessionMutation.mutateAsync({})
  }

  const handleSetDefaultPaymentMethod = async (
    paymentMethodId: string
  ) => {
    await setDefaultPaymentMethodMutation.mutateAsync({
      paymentMethodId,
    })
  }

  const handleDownloadInvoice = (invoiceId: string) => {
    // This would typically trigger a download or open in new tab
    // TODO: Implement invoice download functionality
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

  if (error || !data) {
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

  const currentSubscription = data.currentSubscriptions?.[0]

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
              <h2 className="text-2xl font-bold mb-6">
                Subscription
              </h2>
              {currentSubscription ? (
                <SubscriptionCard
                  subscription={{
                    id: currentSubscription.id,
                    name: currentSubscription.name || 'Subscription',
                    status:
                      'status' in currentSubscription
                        ? (currentSubscription.status as
                            | 'active'
                            | 'canceled'
                            | 'past_due'
                            | 'trialing')
                        : 'active',
                    currentPeriodEnd:
                      'currentPeriodEnd' in currentSubscription
                        ? new Date(
                            currentSubscription.currentPeriodEnd as string
                          )
                        : new Date(),
                    currentPeriodStart:
                      'currentPeriodStart' in currentSubscription
                        ? new Date(
                            currentSubscription.currentPeriodStart as string
                          )
                        : new Date(),
                    cancelAtPeriodEnd:
                      'cancelAtPeriodEnd' in currentSubscription
                        ? (currentSubscription.cancelAtPeriodEnd as boolean)
                        : false,
                    canceledAt:
                      'canceledAt' in currentSubscription &&
                      currentSubscription.canceledAt
                        ? new Date(
                            String(currentSubscription.canceledAt)
                          )
                        : undefined,
                    trialEnd:
                      'trialEnd' in currentSubscription &&
                      currentSubscription.trialEnd
                        ? new Date(
                            String(currentSubscription.trialEnd)
                          )
                        : undefined,
                    items:
                      'lineItems' in currentSubscription &&
                      Array.isArray(currentSubscription.lineItems)
                        ? currentSubscription.lineItems.map(
                            (item: any) => ({
                              id: item.id,
                              productName: item.productName || '',
                              quantity: item.quantity || 1,
                              unitAmount: item.amount || 0,
                              currency: 'usd',
                              priceId: item.priceId || '',
                              productId: item.productId || '',
                            })
                          )
                        : [],
                  }}
                  onCancel={handleCancelSubscription}
                  loading={cancelSubscriptionMutation.isPending}
                />
              ) : (
                <div className="text-center py-12 bg-muted/50 rounded-lg">
                  <p className="text-muted-foreground mb-4">
                    No active subscription
                  </p>
                  <Button onClick={() => router.push(`/pricing`)}>
                    View Pricing Plans
                  </Button>
                </div>
              )}
            </section>
          )}

          {activeSection === 'payment-methods' && (
            <section>
              <h2 className="text-2xl font-bold mb-6">
                Payment Methods
              </h2>
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
              <h2 className="text-2xl font-bold mb-6">Invoices</h2>
              <InvoicesList
                invoices={data.invoices.map((inv) => {
                  const invoice = inv.invoice
                  return {
                    id: invoice.id,
                    number:
                      'invoiceNumber' in invoice &&
                      invoice.invoiceNumber
                        ? String(invoice.invoiceNumber)
                        : `INV-${invoice.id.slice(-8)}`,
                    status:
                      'status' in invoice
                        ? (() => {
                            const s = String(invoice.status)
                            // Map past_due to open for display
                            if (s === 'past_due')
                              return 'open' as const
                            if (
                              s === 'paid' ||
                              s === 'void' ||
                              s === 'draft' ||
                              s === 'uncollectible'
                            )
                              return s as
                                | 'paid'
                                | 'void'
                                | 'draft'
                                | 'uncollectible'
                            return 'open' as const
                          })()
                        : 'open',
                    created: invoice.createdAt,
                    dueDate:
                      'dueDate' in invoice && invoice.dueDate
                        ? new Date(String(invoice.dueDate))
                        : undefined,
                    amountDue:
                      'total' in invoice && invoice.total
                        ? Number(invoice.total)
                        : 0,
                    currency:
                      'currency' in invoice && invoice.currency
                        ? String(invoice.currency)
                        : 'usd',
                    hostedInvoiceUrl:
                      'stripeInvoiceUrl' in invoice
                        ? String(invoice.stripeInvoiceUrl || '')
                        : undefined,
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
