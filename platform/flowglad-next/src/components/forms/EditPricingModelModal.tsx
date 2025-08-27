'use client'

import FormModal from '@/components/forms/FormModal'
import {
  PricingModel,
  editPricingModelSchema,
} from '@/db/schema/pricingModels'
import PricingModelFormFields from '@/components/forms/PricingModelFormFields'
import { trpc } from '@/app/_trpc/client'

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
  const editPricingModel = trpc.catalogs.update.useMutation()
  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Edit PricingModel"
      formSchema={editPricingModelSchema}
      defaultValues={{ pricingModel }}
      onSubmit={editPricingModel.mutateAsync}
    >
      <PricingModelFormFields />
    </FormModal>
  )
}

export default EditPricingModelModal
