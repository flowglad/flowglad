'use client'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import InternalPageContainer from '@/components/InternalPageContainer'
import { PageHeader } from '@/components/ui/page-header'
import { RichSubscription } from '@/subscriptions/schemas'
import { TableHeader } from '@/components/ui/table-header'
import PaymentsTable from '../../payments/PaymentsTable'
import { useAuthContext } from '@/contexts/authContext'
import SubscriptionItemsTable from './SubscriptionItemsTable'
import SubscriptionStatusBadge from '../SubscriptionStatusBadge'
import core from '@/utils/core'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { CardPaymentMethodLabel } from '@/components/PaymentMethodLabel'
import { PaymentMethodType } from '@/types'
import { Label } from '@/components/ui/label'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Pencil } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { trpc } from '@/app/_trpc/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

import InvoicesTable from '@/components/InvoicesTable'

const InnerSubscriptionPage = ({
  subscription,
  defaultPaymentMethod,
}: {
  subscription: RichSubscription
  defaultPaymentMethod: PaymentMethod.ClientRecord | null
}) => {
  const { organization } = useAuthContext()
  const router = useRouter()
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] =
    useState<string | null>(null)

  // Fetch payment methods for the customer
  const {
    data: paymentMethodsData,
    isLoading: isLoadingPaymentMethods,
  } = trpc.paymentMethods.list.useQuery({
    where: { customerId: subscription.customerId },
  })

  // Mutation to update subscription payment method
  const updatePaymentMethod =
    trpc.subscriptions.updatePaymentMethod.useMutation({
      onSuccess: () => {
        toast.success('Payment method updated successfully')
        setIsEditDialogOpen(false)
        router.refresh()
      },
      onError: (error) => {
        toast.error(
          error.message || 'Failed to update payment method'
        )
      },
    })

  const handleUpdatePaymentMethod = () => {
    if (!selectedPaymentMethodId) return

    updatePaymentMethod.mutate({
      id: subscription.id,
      paymentMethodId: selectedPaymentMethodId,
    })
  }

  if (!organization) {
    return <div>Loading...</div>
  }
  return (
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-6 pb-6">
        <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
          <Breadcrumb />
          <div className="flex flex-col">
            <div className="flex flex-row justify-between items-center mb-6 gap-8">
              <PageHeader
                title={subscription.name ?? 'Subscription'}
                className="flex flex-row items-center gap-2"
              />
            </div>
            <div className="w-fit">
              <SubscriptionStatusBadge status={subscription.status} />
            </div>
          </div>
        </div>
        <TableHeader title="Details" noButtons />
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <Label>Dates</Label>
            <div className="flex w-full">
              {core.formatDate(subscription.startDate)}
              {subscription.canceledAt
                ? ` - ${core.formatDate(subscription.canceledAt)}`
                : ' -'}
            </div>
            <div className="flex w-full flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Payment Method</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedPaymentMethodId(
                      defaultPaymentMethod?.id || null
                    )
                    setIsEditDialogOpen(true)
                  }}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              </div>
              {defaultPaymentMethod &&
                defaultPaymentMethod.type ===
                  PaymentMethodType.Card && (
                  <CardPaymentMethodLabel
                    brand={
                      defaultPaymentMethod.paymentMethodData
                        .brand as string
                    }
                    last4={
                      defaultPaymentMethod.paymentMethodData
                        .last4 as string
                    }
                  />
                )}
              {!defaultPaymentMethod && (
                <p className="text-sm text-muted-foreground">
                  No payment method set
                </p>
              )}
            </div>
          </div>
        </div>
        <TableHeader title="Items" noButtons />
        <SubscriptionItemsTable
          subscriptionItems={subscription.subscriptionItems}
        />
        <TableHeader title="Invoices" noButtons />
        <InvoicesTable
          filters={{ subscriptionId: subscription.id }}
        />
        <TableHeader title="Payments" noButtons />
        <PaymentsTable
          filters={{ subscriptionId: subscription.id }}
        />
      </div>

      {/* Edit Payment Method Dialog */}
      <Dialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Payment Method</DialogTitle>
            <DialogDescription>
              Select a payment method for this subscription.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {isLoadingPaymentMethods && (
              <p className="text-sm text-muted-foreground">
                Loading payment methods...
              </p>
            )}

            {!isLoadingPaymentMethods &&
              paymentMethodsData?.data &&
              paymentMethodsData.data.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No payment methods available for this customer.
                </p>
              )}

            {!isLoadingPaymentMethods &&
              paymentMethodsData?.data &&
              paymentMethodsData.data.length > 0 && (
                <div className="space-y-2">
                  {paymentMethodsData.data.map(
                    (pm: PaymentMethod.ClientRecord) => (
                      <button
                        key={pm.id}
                        onClick={() =>
                          setSelectedPaymentMethodId(pm.id)
                        }
                        className={`w-full p-3 border rounded-lg text-left transition-colors hover:bg-accent ${
                          selectedPaymentMethodId === pm.id
                            ? 'border-primary bg-accent'
                            : 'border-border'
                        }`}
                      >
                        {pm.type === PaymentMethodType.Card && (
                          <CardPaymentMethodLabel
                            brand={
                              pm.paymentMethodData.brand as string
                            }
                            last4={
                              pm.paymentMethodData.last4 as string
                            }
                          />
                        )}
                      </button>
                    )
                  )}
                </div>
              )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              disabled={updatePaymentMethod.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdatePaymentMethod}
              disabled={
                !selectedPaymentMethodId ||
                updatePaymentMethod.isPending
              }
            >
              {updatePaymentMethod.isPending
                ? 'Updating...'
                : 'Update'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </InternalPageContainer>
  )
}

export default InnerSubscriptionPage
