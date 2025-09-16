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
import { DiscountAmountType } from '@/types'

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
  const __rawAmountString =
    discount.amountType === DiscountAmountType.Fixed
      ? countableCurrencyAmountToRawStringAmount(
          organization!.defaultCurrency,
          discount.amount
        )
      : undefined // For percentage discounts, set as undefined since it's optional
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
            amount:
              input.discount.amountType === DiscountAmountType.Fixed
                ? rawStringAmountToCountableCurrencyAmount(
                    organization!.defaultCurrency,
                    input.__rawAmountString || '0'
                  )
                : input.discount.amount, // For percentage discounts, use the amount as-is
          },
        })
      }}
    >
      <DiscountFormFields edit />
    </FormModal>
  )
}

export default EditDiscountModal
