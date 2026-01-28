'use client'

import { trpc } from '@/app/_trpc/client'
import FormModal from '@/components/forms/FormModal'
import { useAuthenticatedContext } from '@/contexts/authContext'
import {
  type CreateFeatureInput,
  createFeatureSchema,
} from '@/db/schema/features'
import { FeatureType } from '@/types'
import FeatureFormFields from './FeatureFormFields' // Adjusted import

interface CreateFeatureModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  defaultPricingModelId: string
}

const CreateFeatureModal: React.FC<CreateFeatureModalProps> = ({
  isOpen,
  setIsOpen,
  defaultPricingModelId,
}) => {
  const utils = trpc.useUtils()
  const createFeatureMutation = trpc.features.create.useMutation({
    onSuccess: async () => {
      // Invalidate the features query for this pricing model so AddSubscriptionFeatureModal
      // always shows the latest available features
      await utils.features.getFeaturesForPricingModel.invalidate({
        pricingModelId: defaultPricingModelId,
      })
    },
  })
  const { livemode } = useAuthenticatedContext()
  return (
    <FormModal<CreateFeatureInput>
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Create Feature"
      formSchema={createFeatureSchema}
      defaultValues={() => ({
        feature: {
          type: FeatureType.Toggle, // Default to Toggle
          name: '',
          slug: '',
          description: '',
          pricingModelId: defaultPricingModelId,
          amount: null,
          usageMeterId: null,
          renewalFrequency: null,
          active: true,
        },
      })}
      onSubmit={async (data) => {
        await createFeatureMutation.mutateAsync(data)
      }}
    >
      <FeatureFormFields />
    </FormModal>
  )
}

export default CreateFeatureModal
