'use client'

import {
  editProductFormSchema,
  type Price,
} from '@db-core/schema/prices'
import type { Product } from '@db-core/schema/products'
import { encodeCursor } from '@db-core/tableUtils'
import { trpc } from '@/app/_trpc/client'
import FormModal from '@/components/forms/FormModal'
import { ProductFormFields } from '@/components/forms/ProductFormFields'
import { useAuthenticatedContext } from '@/contexts/authContext'
import {
  countableCurrencyAmountToRawStringAmount,
  isCurrencyZeroDecimal,
  rawStringAmountToCountableCurrencyAmount,
} from '@/utils/stripe'

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
  const editProduct = trpc.products.update.useMutation()

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
  const defaultActivePrice = prices?.find(
    (p) => p.isDefault === true && p.active === true
  )
  const { organization } = useAuthenticatedContext()

  // Don't render modal if organization is not loaded yet
  if (!organization) {
    return null
  }

  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title={product.default ? 'Edit Default Plan' : 'Edit Product'}
      formSchema={editProductFormSchema}
      defaultValues={() => ({
        product,
        price: defaultActivePrice ?? prices?.[0],
        id: product.id,
        __rawPriceString: countableCurrencyAmountToRawStringAmount(
          organization.defaultCurrency,
          defaultActivePrice?.unitPrice! ?? prices?.[0]?.unitPrice!
        ),
      })}
      onSubmit={async (input) => {
        await editProduct.mutateAsync({
          ...input,
          price: input.price
            ? {
                ...input.price,
                unitPrice: rawStringAmountToCountableCurrencyAmount(
                  organization.defaultCurrency,
                  input.__rawPriceString
                ),
              }
            : undefined,
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
