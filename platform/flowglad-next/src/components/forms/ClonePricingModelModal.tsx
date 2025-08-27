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
  catalog: PricingModel.ClientRecord
}

const ClonePricingModelModal: React.FC<
  ClonePricingModelModalProps
> = ({ isOpen, setIsOpen, catalog }) => {
  const clonePricingModelMutation = trpc.catalogs.clone.useMutation()

  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Clone PricingModel"
      formSchema={clonePricingModelInputSchema}
      defaultValues={{
        id: catalog.id,
        name: `${catalog.name} (Copy)`,
      }}
      onSubmit={clonePricingModelMutation.mutateAsync}
      submitButtonText="Clone PricingModel"
    >
      <ClonePricingModelFormFields />
    </FormModal>
  )
}

export default ClonePricingModelModal
