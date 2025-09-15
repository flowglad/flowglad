'use client'

import FormModal from '@/components/forms/FormModal'
import { createPriceFormSchema } from '@/db/schema/prices'
import PriceFormFields from './PriceFormFields'
import { trpc } from '@/app/_trpc/client'
import { PriceType } from '@/types'
import { rawStringAmountToCountableCurrencyAmount } from '@/utils/stripe'
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
  const productQuery = trpc.products.get.useQuery({ id: productId })
  const isDefaultProduct = productQuery.data?.default === true
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
            unitPrice: rawStringAmountToCountableCurrencyAmount(
              organization!.defaultCurrency,
              input.__rawPriceString!
            ),
          },
        })
      }}
    >
      <PriceFormFields
        priceOnly
        productId={productId}
        isDefaultProductOverride={isDefaultProduct}
      />
    </FormModal>
  )
}

export default CreatePriceModal
