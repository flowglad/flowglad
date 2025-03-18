'use client'

import FormModal from '@/components/forms/FormModal'
import { editPriceSchema, Price } from '@/db/schema/prices'
import PriceFormFields from './PriceFormFields'
import { trpc } from '@/app/_trpc/client'

interface EditPriceModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  price: Price.Record
}

const EditPriceModal: React.FC<EditPriceModalProps> = ({
  isOpen,
  setIsOpen,
  price,
}) => {
  const editPrice = trpc.prices.edit.useMutation()
  const defaultValues = editPriceSchema.parse({ price })
  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Edit Price"
      formSchema={editPriceSchema}
      defaultValues={defaultValues}
      onSubmit={editPrice.mutateAsync}
    >
      <PriceFormFields priceOnly edit />
    </FormModal>
  )
}

export default EditPriceModal
