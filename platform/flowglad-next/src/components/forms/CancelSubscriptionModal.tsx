import React from 'react'
import FormModal from '@/components/forms/FormModal'
import CancelSubscriptionFormFields from '@/components/forms/CancelSubscriptionFormFields'
import { scheduleSubscriptionCancellationSchema } from '@/subscriptions/schemas'
import { SubscriptionCancellationArrangement } from '@/types'
import { trpc } from '@/app/_trpc/client'

interface CancelSubscriptionModalProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  subscriptionId: string
}

const CancelSubscriptionModal: React.FC<
  CancelSubscriptionModalProps
> = ({ isOpen, setIsOpen, subscriptionId }) => {
  const cancelSubscriptionMutation =
    trpc.subscriptions.cancel.useMutation()

  const onSubmit = async (data: any) => {
    // Convert endDate to a Date if the cancellation arrangement is AtFutureDate and the value is a string
    if (
      data.timing ===
        SubscriptionCancellationArrangement.AtFutureDate &&
      typeof data.endDate === 'string'
    ) {
      data.endDate = new Date(data.endDate)
    }
    try {
      await cancelSubscriptionMutation.mutateAsync(data)
    } catch (error) {
      console.error('Cancellation error:', error)
      throw error
    }
  }

  const defaultValues = {
    id: subscriptionId,
    timing: SubscriptionCancellationArrangement.Immediately,
    endDate: '', // initial value; will be converted if needed
  }

  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Cancel Subscription"
      formSchema={scheduleSubscriptionCancellationSchema}
      defaultValues={defaultValues}
      onSubmit={onSubmit}
      submitButtonText="Cancel Subscription"
    >
      <CancelSubscriptionFormFields />
    </FormModal>
  )
}

export default CancelSubscriptionModal
