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
  humanReadableCurrencyAmountToStripeCurrencyAmount,
  rawStringAmountToCountableCurrencyAmount,
  stripeCurrencyAmountToHumanReadableCurrencyAmount,
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
  const editPrice = trpc.prices.edit.useMutation()
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
  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Edit Price"
      formSchema={editPriceFormSchema}
      defaultValues={defaultValues}
      onSubmit={(input) => {
        editPrice.mutateAsync({
          ...input,
          price: {
            ...input.price,
            unitPrice: rawStringAmountToCountableCurrencyAmount(
              organization!.defaultCurrency,
              input.__rawPriceString!
            ),
          },
        })
      }}
    >
      <PriceFormFields priceOnly edit productId={price.productId} />
    </FormModal>
  )
}

export default EditPriceModal
