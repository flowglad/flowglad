'use client'

import FormModal from '@/components/forms/FormModal'
import { createDiscountInputSchema } from '@/db/schema/discounts'
import DiscountFormFields from '@/components/forms/DiscountFormFields'
import { trpc } from '@/app/_trpc/client'
import { DiscountAmountType, DiscountDuration } from '@/types'
import { rawStringAmountToCountableCurrencyAmount } from '@/utils/stripe'
import { createDiscountFormSchema } from '@/db/schema/discounts'
import { useAuthenticatedContext } from '@/contexts/authContext'

interface CreateDiscountModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}

const CreateDiscountModal: React.FC<CreateDiscountModalProps> = ({
  isOpen,
  setIsOpen,
}) => {
  const createDiscount = trpc.discounts.create.useMutation()
  const { organization } = useAuthenticatedContext()
  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Create Discount"
      formSchema={createDiscountFormSchema}
      onSubmit={async (input) => {
        await createDiscount.mutateAsync({
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
      defaultValues={{
        discount: {
          name: '',
          code: '',
          amountType: DiscountAmountType.Fixed,
          amount: 1, // Must be positive integer per schema validation
          duration: DiscountDuration.Once,
          active: true,
          numberOfPayments: null,
        },
        __rawAmountString: '0', // Initialize with '0' for fixed amount (default type)
      }}
    >
      <DiscountFormFields />
    </FormModal>
  )
}

export default CreateDiscountModal
