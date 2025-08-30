import React from 'react'
import FormModal from '@/components/forms/FormModal'
import ClonePricingModelFormFields from '@/components/forms/ClonePricingModelFormFields'
import {
  clonePricingModelInputSchema,
  PricingModel,
} from '@/db/schema/pricingModels'
import { trpc } from '@/app/_trpc/client'

interface ClonePricingModelModalProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  pricingModel: PricingModel.ClientRecord
}

const ClonePricingModelModal: React.FC<
  ClonePricingModelModalProps
> = ({ isOpen, setIsOpen, pricingModel }) => {
  const clonePricingModelMutation =
    trpc.pricingModels.clone.useMutation()

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
