'use client'

import FormModal from '@/components/forms/FormModal'
import {
  Discount,
  editDiscountFormSchema,
  EditDiscountFormSchema,
} from '@/db/schema/discounts'
import DiscountFormFields from '@/components/forms/DiscountFormFields'
import { trpc } from '@/app/_trpc/client'
import { useAuthenticatedContext } from '@/contexts/authContext'
import {
  countableCurrencyAmountToRawStringAmount,
  rawStringAmountToCountableCurrencyAmount,
} from '@/utils/stripe'

interface EditDiscountModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  discount: Discount.ClientRecord
}

const EditDiscountModal: React.FC<EditDiscountModalProps> = ({
  isOpen,
  setIsOpen,
  discount,
}) => {
  const editDiscount = trpc.discounts.update.useMutation()
  const { organization } = useAuthenticatedContext()
  const __rawAmountString = countableCurrencyAmountToRawStringAmount(
    organization!.defaultCurrency,
    discount.amount
  )
  const defaultValues: EditDiscountFormSchema = {
    discount,
    id: discount.id,
    __rawAmountString,
  }
  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Edit Discount"
      formSchema={editDiscountFormSchema}
      defaultValues={defaultValues}
      onSubmit={(input) => {
        return editDiscount.mutateAsync({
          ...input,
          discount: {
            ...input.discount,
            amount: rawStringAmountToCountableCurrencyAmount(
              organization!.defaultCurrency,
              input.__rawAmountString!
            ),
          },
        })
      }}
    >
      <DiscountFormFields edit />
    </FormModal>
  )
}

export default EditDiscountModal
