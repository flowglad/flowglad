'use client'

import { useParams, useRouter } from 'next/navigation'
import { trpc } from '@/app/_trpc/client'
import { SubscriptionCard } from '@/registry/base/subscription-card/subscription-card'
import { InvoicesList } from '@/registry/base/invoices-list/invoices-list'
import { PaymentMethodsList } from '@/registry/base/payment-methods-list/payment-methods-list'
import Button from '@/components/ion/Button'
import { AlertCircle } from 'lucide-react'
import { BillingPortalHeader } from './components/BillingPortalHeader'
import { BillingPortalNav } from './components/BillingPortalNav'
import { ChangeCustomerButton } from './components/ChangeCustomerButton'
import { useState } from 'react'
import { SubscriptionCancellationArrangement } from '@/types'

export default function BillingPortalPage() {
  const params = useParams<{
    organizationId: string
    customerId: string
  }>()
  const router = useRouter()
  const [activeSection, setActiveSection] = useState<
    'subscription' | 'payment-methods' | 'invoices'
  >('subscription')

  // Fetch billing data
  const { data, isLoading, error, refetch } =
    trpc.customerBillingPortal.getBilling.useQuery({})

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
  const hasMultipleCustomers = false // This would be determined by checking if user has multiple customer profiles

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
                    name:
                      currentSubscription.priceNickname ||
                      'Subscription',
                    status: currentSubscription.status as
                      | 'active'
                      | 'canceled'
                      | 'past_due'
                      | 'trialing',
                    currentPeriodEnd: new Date(
                      currentSubscription.currentPeriodEnd
                    ),
                    currentPeriodStart: new Date(
                      currentSubscription.currentPeriodStart
                    ),
                    cancelAtPeriodEnd:
                      currentSubscription.cancelAtPeriodEnd || false,
                    canceledAt: currentSubscription.canceledAt
                      ? new Date(currentSubscription.canceledAt)
                      : undefined,
                    trialEnd: currentSubscription.trialEnd
                      ? new Date(currentSubscription.trialEnd)
                      : undefined,
                    items:
                      currentSubscription.lineItems?.map((item) => ({
                        id: item.id,
                        productName: item.productName || '',
                        quantity: item.quantity || 1,
                        unitAmount: item.amount || 0,
                        currency: 'usd',
                      })) || [],
                  }}
                  onCancel={handleCancelSubscription}
                  loading={cancelSubscriptionMutation.isLoading}
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
                paymentMethods={data.paymentMethods.map((pm) => ({
                  id: pm.id,
                  type: pm.type || 'card',
                  last4: pm.last4 || '****',
                  brand: pm.brand || 'unknown',
                  expiryMonth: pm.expiryMonth,
                  expiryYear: pm.expiryYear,
                  isDefault: pm.isDefault || false,
                }))}
                defaultPaymentMethodId={
                  data.paymentMethods.find((pm) => pm.isDefault)?.id
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
                        ? (invoice.status as
                            | 'paid'
                            | 'open'
                            | 'past_due'
                            | 'void')
                        : 'open',
                    amount:
                      'total' in invoice && invoice.total
                        ? Number(invoice.total)
                        : 0,
                    currency:
                      'currency' in invoice && invoice.currency
                        ? String(invoice.currency)
                        : 'usd',
                    dueDate:
                      'dueDate' in invoice && invoice.dueDate
                        ? new Date(invoice.dueDate as string)
                        : undefined,
                    paidAt:
                      'paidDate' in invoice && invoice.paidDate
                        ? new Date(invoice.paidDate as string)
                        : undefined,
                    created: invoice.createdAt.getTime() / 1000,
                    createdAt: invoice.createdAt,
                    amountDue:
                      'total' in invoice && invoice.total
                        ? Number(invoice.total)
                        : 0,
                    downloadUrl:
                      'stripeInvoiceUrl' in invoice
                        ? (invoice.stripeInvoiceUrl as
                            | string
                            | undefined)
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
