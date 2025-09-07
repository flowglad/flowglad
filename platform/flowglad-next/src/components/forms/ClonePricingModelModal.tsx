import React from 'react'
import FormModal from '@/components/forms/FormModal'
import ClonePricingModelFormFields from '@/components/forms/ClonePricingModelFormFields'
import {
  clonePricingModelInputSchema,
  PricingModel,
} from '@/db/schema/pricingModels'
import { trpc } from '@/app/_trpc/client'
import { toast } from 'sonner'
import { DestinationEnvironment } from '@/types'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { sentenceCase } from 'change-case'

interface ClonePricingModelModalProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  pricingModel: PricingModel.ClientRecord
}

const ClonePricingModelModal: React.FC<
  ClonePricingModelModalProps
> = ({ isOpen, setIsOpen, pricingModel }) => {
  const clonePricingModelMutation =
    trpc.pricingModels.clone.useMutation({
      onSuccess: ({ pricingModel }) => {
        if (pricingModel.livemode !== livemode) {
          toast.success(
            `Pricing model cloned into ${sentenceCase(pricingModel.livemode ? DestinationEnvironment.Livemode : DestinationEnvironment.Testmode)} environment`
          )
        }
      },
      onError: (error) => {
        toast.error('Failed to clone pricing model')
      },
    })
  const { livemode } = useAuthenticatedContext()
  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Clone Pricing Model"
      formSchema={clonePricingModelInputSchema}
      defaultValues={{
        id: pricingModel.id,
        name: `${pricingModel.name} (Copy)`,
      }}
      onSubmit={clonePricingModelMutation.mutateAsync}
      submitButtonText="Clone Pricing Model"
    >
      <ClonePricingModelFormFields />
    </FormModal>
  )
}

export default ClonePricingModelModal
