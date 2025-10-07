'use client'

import FormModal from '@/components/forms/FormModal'
import { trpc } from '@/app/_trpc/client'
import { z } from 'zod'
import { Payment } from '@/db/schema/payments'

interface RetryPaymentModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  payment: Payment.ClientRecord
}

const retryBillingRunInputSchema = z.object({
  billingPeriodId: z.string(),
})

const RetryPaymentModal = ({
  isOpen,
  setIsOpen,
  payment,
}: RetryPaymentModalProps) => {
  const retryBillingRun =
    trpc.subscriptions.retryBillingRunProcedure.useMutation()

  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      onSubmit={retryBillingRun.mutateAsync}
      formSchema={retryBillingRunInputSchema}
      defaultValues={{ billingPeriodId: payment.billingPeriodId! }}
      title="Retry Payment"
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          This will immediately attempt to charge for the billing
          period associated with this payment, using the current
          payment method for this subscription or the default payment
          method for the customer.
        </p>
      </div>
    </FormModal>
  )
}

export default RetryPaymentModal
