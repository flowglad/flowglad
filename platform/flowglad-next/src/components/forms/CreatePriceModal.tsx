'use client'

import FormModal from '@/components/forms/FormModal'
import { createPriceSchema } from '@/db/schema/prices'
import PriceFormFields from './PriceFormFields'
import { trpc } from '@/app/_trpc/client'
import { PriceType } from '@/types'

interface CreatePriceModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  productId: string
}

const CreatePriceModal: React.FC<CreatePriceModalProps> = ({
  isOpen,
  setIsOpen,
  productId,
}) => {
  const createPrice = trpc.prices.create.useMutation()

  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Create Price"
      formSchema={createPriceSchema}
      defaultValues={{
        price: {
          productId,
          type: PriceType.SinglePayment,
          isDefault: false,
          unitPrice: 0,
          active: true,
        },
      }}
      onSubmit={createPrice.mutateAsync}
    >
      <PriceFormFields priceOnly />
    </FormModal>
  )
}

export default CreatePriceModal
