'use client'

import { trpc } from '@/app/_trpc/client'
import FormModal from '@/components/forms/FormModal'
import PricingModelFormFields from '@/components/forms/PricingModelFormFields'
import {
  editPricingModelSchema,
  type PricingModel,
} from '@/db/schema/pricingModels'

interface EditPricingModelModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  pricingModel: PricingModel.ClientRecord
}

const EditPricingModelModal: React.FC<EditPricingModelModalProps> = ({
  isOpen,
  setIsOpen,
  pricingModel,
}) => {
  const editPricingModel = trpc.pricingModels.update.useMutation()
  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Edit Pricing Model"
      formSchema={editPricingModelSchema}
      defaultValues={() => ({
        id: pricingModel.id,
        pricingModel: {
          ...pricingModel,
          id: pricingModel.id,
        },
      })}
      onSubmit={editPricingModel.mutateAsync}
    >
      <PricingModelFormFields edit />
    </FormModal>
  )
}

export default EditPricingModelModal
