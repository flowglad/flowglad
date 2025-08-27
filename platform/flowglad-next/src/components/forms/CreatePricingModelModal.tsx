'use client'

import FormModal from '@/components/forms/FormModal'
import { createPricingModelSchema } from '@/db/schema/pricingModels'
import PricingModelFormFields from '@/components/forms/PricingModelFormFields'
import { trpc } from '@/app/_trpc/client'

interface CreatePricingModelModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}

const CreatePricingModelModal: React.FC<
  CreatePricingModelModalProps
> = ({ isOpen, setIsOpen }) => {
  const createPricingModel = trpc.pricingModels.create.useMutation()
  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Create Pricing Model"
      formSchema={createPricingModelSchema}
      defaultValues={{ pricingModel: { name: '' } }}
      onSubmit={createPricingModel.mutateAsync}
    >
      <PricingModelFormFields />
    </FormModal>
  )
}

export default CreatePricingModelModal
