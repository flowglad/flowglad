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
} from '@/utils/stripe'
import { toEditDiscountInput } from './discountFormHelpers'

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
  const discountForForm =
    discount.amountType === 'fixed'
      ? (() => {
          const { amount: _omitAmount, ...rest } = discount as any
          return rest
        })()
      : discount

  const defaultValues: EditDiscountFormSchema = {
    discount: discountForForm as any,
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
        const payload = toEditDiscountInput(
          input,
          organization!.defaultCurrency
        )
        return editDiscount.mutateAsync(payload)
      }}
    >
      <DiscountFormFields edit />
    </FormModal>
  )
}

export default EditDiscountModal
