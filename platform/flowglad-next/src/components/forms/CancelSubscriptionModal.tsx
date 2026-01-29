import type React from 'react'
import { trpc } from '@/app/_trpc/client'
import CancelSubscriptionFormFields from '@/components/forms/CancelSubscriptionFormFields'
import FormModal from '@/components/forms/FormModal'
import {
  type ScheduleSubscriptionCancellationParams,
  scheduleSubscriptionCancellationSchema,
} from '@/subscriptions/schemas'
import { SubscriptionCancellationArrangement } from '@/types'

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

  const onSubmit = async (
    data: ScheduleSubscriptionCancellationParams
  ) => {
    try {
      await cancelSubscriptionMutation.mutateAsync(data)
    } catch (error) {
      console.error('Cancellation error:', error)
      throw error
    }
  }

  const getDefaultValues =
    (): ScheduleSubscriptionCancellationParams => ({
      id: subscriptionId,
      cancellation: {
        timing: SubscriptionCancellationArrangement.Immediately,
      },
    })

  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Cancel Subscription"
      formSchema={scheduleSubscriptionCancellationSchema}
      defaultValues={getDefaultValues}
      onSubmit={onSubmit}
      submitButtonText="Cancel Subscription"
      cancelButtonText="Go Back"
    >
      <CancelSubscriptionFormFields />
    </FormModal>
  )
}

export default CancelSubscriptionModal
