'use client'

import FormModal from '@/components/forms/FormModal'
import {
  editPriceFormSchema,
  EditPriceInput,
  Price,
} from '@/db/schema/prices'
import PriceFormFields from './PriceFormFields'
import { trpc } from '@/app/_trpc/client'
import {
  countableCurrencyAmountToRawStringAmount,
  rawStringAmountToCountableCurrencyAmount,
} from '@/utils/stripe'
import { useAuthenticatedContext } from '@/contexts/authContext'

interface EditPriceModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  price: Price.ClientRecord
}

const EditPriceModal: React.FC<EditPriceModalProps> = ({
  isOpen,
  setIsOpen,
  price,
}) => {
  const editPrice = trpc.prices.update.useMutation()
  const editPriceInput: EditPriceInput = {
    id: price.id,
    price,
  }

  const __rawPriceString = countableCurrencyAmountToRawStringAmount(
    price.currency,
    price.unitPrice!
  )

  const defaultValues = editPriceFormSchema.parse({
    ...editPriceInput,
    __rawPriceString,
  })

  const { organization } = useAuthenticatedContext()
  const productQuery = trpc.products.get.useQuery({
    id: price.productId,
  })
  const isDefaultProduct = productQuery.data?.default === true
  const isDefaultPrice = price.isDefault === true
  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Edit Price"
      formSchema={editPriceFormSchema}
      defaultValues={defaultValues}
      onSubmit={async (input) => {
        await editPrice.mutateAsync(input)
      }}
    >
      <PriceFormFields
        priceOnly
        edit
        productId={price.productId}
        isDefaultProductOverride={isDefaultProduct}
        isDefaultPriceOverride={isDefaultPrice}
      />
    </FormModal>
  )
}

export default EditPriceModal
