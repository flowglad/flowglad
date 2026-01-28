'use client'

import { trpc } from '@/app/_trpc/client'
import DiscountFormFields from '@/components/forms/DiscountFormFields'
import FormModal from '@/components/forms/FormModal'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { createDiscountFormSchema } from '@/db/schema/discounts'
import { DiscountAmountType, DiscountDuration } from '@/types'
import { toCreateDiscountInput } from './discountFormHelpers'

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
        const payload = toCreateDiscountInput(
          input,
          organization!.defaultCurrency
        )
        await createDiscount.mutateAsync(payload)
      }}
      defaultValues={() => ({
        discount: {
          name: '',
          code: '',
          amountType: DiscountAmountType.Fixed,
          duration: DiscountDuration.Once,
          active: true,
          numberOfPayments: null,
          pricingModelId: undefined, // Will be set by PricingModelSelect
        },
        __rawAmountString: '0',
      })}
    >
      <DiscountFormFields />
    </FormModal>
  )
}

export default CreateDiscountModal
