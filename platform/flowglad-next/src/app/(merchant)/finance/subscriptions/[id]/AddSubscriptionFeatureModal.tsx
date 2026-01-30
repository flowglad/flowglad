'use client'

import type { subscriptionItemFeaturesClientSelectSchema } from '@db-core/schema/subscriptionItemFeatures'
import { toast } from 'sonner'
import type { z } from 'zod'
import { trpc } from '@/app/_trpc/client'
import FormModal, {
  type ModalInterfaceProps,
} from '@/components/forms/FormModal'
import type { RichSubscription } from '@/subscriptions/schemas'
import { AddSubscriptionFeatureItemFormFields } from './AddSubscriptionFeatureItemFormFields'
import {
  type AddSubscriptionFeatureFormValues,
  addSubscriptionFeatureFormSchema,
} from './addSubscriptionFeatureFormSchema'

interface AddSubscriptionFeatureModalProps
  extends ModalInterfaceProps {
  subscriptionItems: RichSubscription['subscriptionItems']
  featureItems?: z.infer<
    typeof subscriptionItemFeaturesClientSelectSchema
  >[]
}

export const AddSubscriptionFeatureModal = ({
  isOpen,
  setIsOpen,
  subscriptionItems,
  featureItems = [],
}: AddSubscriptionFeatureModalProps) => {
  const addFeatureMutation =
    trpc.subscriptions.addFeatureToSubscription.useMutation()

  const activeSubscriptionItems = subscriptionItems.filter(
    (item) => !item.expiredAt
  )
  const defaultSubscriptionItemId =
    activeSubscriptionItems[0]?.id ?? ''

  const getDefaultValues = () => ({
    subscriptionItemId: defaultSubscriptionItemId,
    featureId: '',
    grantCreditsImmediately: false,
  })

  const handleSubmit = async (
    values: AddSubscriptionFeatureFormValues
  ) => {
    try {
      await addFeatureMutation.mutateAsync(values)
      toast.success('Feature added to subscription item')
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to add feature to subscription item'
      )
      throw error
    }
  }

  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Grant Feature"
      formSchema={addSubscriptionFeatureFormSchema}
      defaultValues={getDefaultValues}
      onSubmit={handleSubmit}
      submitButtonText="Grant Feature"
      allowContentOverflow
    >
      <AddSubscriptionFeatureItemFormFields
        subscriptionItems={subscriptionItems}
        featureItems={featureItems}
      />
    </FormModal>
  )
}
