'use client'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import InternalPageContainer from '@/components/InternalPageContainer'
import { PageHeader } from '@/components/ui/page-header'
import { RichSubscription } from '@/subscriptions/schemas'
import { TableHeader } from '@/components/ui/table-header'
import { PaymentsDataTable } from '../../payments/data-table'
import { useAuthContext } from '@/contexts/authContext'
import { SubscriptionItemsDataTable } from './subscription-items/data-table'
import SubscriptionStatusBadge from '../SubscriptionStatusBadge'
import core from '@/utils/core'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { CardPaymentMethodLabel } from '@/components/PaymentMethodLabel'
import { PaymentMethodType } from '@/types'
import { Label } from '@/components/ui/label'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Pencil } from 'lucide-react'
import { EditSubscriptionPaymentMethodModal } from './EditSubscriptionPaymentMethodModal'

import { InvoicesDataTable } from '../../invoices/data-table'

const InnerSubscriptionPage = ({
  subscription,
  defaultPaymentMethod,
}: {
  subscription: RichSubscription
  defaultPaymentMethod: PaymentMethod.ClientRecord | null
}) => {
  const { organization } = useAuthContext()
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)

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
                  onClick={() => setIsEditDialogOpen(true)}
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
        <SubscriptionItemsDataTable
          title="Items"
          subscriptionItems={subscription.subscriptionItems}
          currencyCode={organization.defaultCurrency}
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
    </InternalPageContainer>
  )
}

export default InnerSubscriptionPage
