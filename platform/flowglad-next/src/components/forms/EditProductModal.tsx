'use client'

import FormModal from '@/components/forms/FormModal'
import { Product } from '@/db/schema/products'
import { editProductSchema } from '@/db/schema/prices'
import { ProductFormFields } from '@/components/forms/ProductFormFields'
import { trpc } from '@/app/_trpc/client'
import { Price } from '@/db/schema/prices'
import { encodeCursor } from '@/db/tableUtils'

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
  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Edit Product"
      formSchema={editProductSchema}
      defaultValues={{
        product,
        price: prices?.[0],
        id: product.id,
      }}
      onSubmit={async (item) => {
        await editProduct.mutateAsync(item)
      }}
      key={`${product.id}-${pricesLoading}`}
      mode="drawer"
    >
      <ProductFormFields editProduct />
    </FormModal>
  )
}

export default EditProductModal
