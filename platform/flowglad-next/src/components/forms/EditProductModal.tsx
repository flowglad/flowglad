'use client'

import FormModal from '@/components/forms/FormModal'
import { Product } from '@/db/schema/products'
import { editProductFormSchema } from '@/db/schema/prices'
import { ProductFormFields } from '@/components/forms/ProductFormFields'
import { trpc } from '@/app/_trpc/client'
import { Price } from '@/db/schema/prices'
import { encodeCursor } from '@/db/tableUtils'
import {
  countableCurrencyAmountToRawStringAmount,
  rawStringAmountToCountableCurrencyAmount,
} from '@/utils/stripe'
import { useAuthenticatedContext } from '@/contexts/authContext'

interface EditProductModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  product: Product.ClientRecord
  prices: Price.ClientRecord[]
}

const EditProductModal: React.FC<EditProductModalProps> = ({
  isOpen,
  setIsOpen,
  product,
}) => {
  const editProduct = trpc.products.edit.useMutation()

  const { data: pricesData, isLoading: pricesLoading } =
    trpc.prices.list.useQuery({
      cursor: encodeCursor({
        parameters: {
          productId: product.id,
        },
        createdAt: new Date(0),
        direction: 'forward',
      }),
    })
  const prices = pricesData?.data
  const { organization } = useAuthenticatedContext()
  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title={product.default ? 'Edit Default Plan' : 'Edit Product'}
      formSchema={editProductFormSchema}
      defaultValues={{
        product,
        price: prices?.[0],
        id: product.id,
        __rawPriceString: countableCurrencyAmountToRawStringAmount(
          organization!.defaultCurrency,
          prices?.[0]?.unitPrice!
        ),
      }}
      onSubmit={async (input) => {
        let price = input.price
        if (input.price) {
          const unitPrice = rawStringAmountToCountableCurrencyAmount(
            organization!.defaultCurrency,
            input.__rawPriceString!
          )
          price = {
            ...input.price,
            unitPrice,
          }
        }
        await editProduct.mutateAsync({
          ...input,
          price,
        })
      }}
      key={`${product.id}-${pricesLoading}`}
      mode="drawer"
    >
      <ProductFormFields editProduct />
    </FormModal>
  )
}

export default EditProductModal
