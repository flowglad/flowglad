'use client'

import FormModal from '@/components/forms/FormModal'
import {
  createPriceSchema,
  createPriceFormSchema,
} from '@/db/schema/prices'
import PriceFormFields from './PriceFormFields'
import { trpc } from '@/app/_trpc/client'
import { PriceType } from '@/types'
import { humanReadableCurrencyAmountToStripeCurrencyAmount } from '@/utils/stripe'
import { useAuthenticatedContext } from '@/contexts/authContext'

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
  const { organization } = useAuthenticatedContext()
  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Create Price"
      formSchema={createPriceFormSchema}
      defaultValues={{
        price: {
          productId,
          type: PriceType.SinglePayment,
          isDefault: false,
          unitPrice: 0,
          active: true,
        },
        __rawPriceString: '0.00',
      }}
      onSubmit={async (input) => {
        await createPrice.mutateAsync({
          ...input,
          price: {
            ...input.price,
            unitPrice:
              humanReadableCurrencyAmountToStripeCurrencyAmount(
                organization!.defaultCurrency,
                Number(input.__rawPriceString!)
              ),
          },
        })
      }}
    >
      <PriceFormFields priceOnly productId={productId} />
    </FormModal>
  )
}

export default CreatePriceModal
