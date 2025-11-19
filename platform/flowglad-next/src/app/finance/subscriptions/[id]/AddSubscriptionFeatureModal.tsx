'use client'

import { useMemo } from 'react'
import { toast } from 'sonner'
import FormModal, {
  ModalInterfaceProps,
} from '@/components/forms/FormModal'
import type { RichSubscription } from '@/subscriptions/schemas'
import { trpc } from '@/app/_trpc/client'
import {
  addSubscriptionFeatureFormSchema,
  type AddSubscriptionFeatureFormValues,
} from './addSubscriptionFeatureFormSchema'
import { AddSubscriptionFeatureItemFormFields } from './AddSubscriptionFeatureItemFormFields'
import { subscriptionItemFeaturesClientSelectSchema } from '@/db/schema/subscriptionItemFeatures'
import { z } from 'zod'

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

  const defaultValues = useMemo(
    () => ({
      subscriptionItemId: defaultSubscriptionItemId,
      featureId: '',
      grantCreditsImmediately: false,
    }),
    [defaultSubscriptionItemId]
  )

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
      title="Add subscription feature"
      formSchema={addSubscriptionFeatureFormSchema}
      defaultValues={defaultValues}
      onSubmit={handleSubmit}
      allowContentOverflow
    >
      <AddSubscriptionFeatureItemFormFields
        subscriptionItems={subscriptionItems}
        featureItems={featureItems}
      />
    </FormModal>
  )
}
