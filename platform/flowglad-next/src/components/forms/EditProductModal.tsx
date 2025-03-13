'use client'

import FormModal from '@/components/forms/FormModal'
import { Product } from '@/db/schema/products'
import { editProductSchema } from '@/db/schema/variants'
import { ProductFormFields } from '@/components/forms/ProductFormFieldsV2'
import { trpc } from '@/app/_trpc/client'
import { Variant } from '@/db/schema/variants'
import { encodeCursor } from '@/db/tableUtils'

interface EditProductModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  product: Product.ClientRecord
  variants: Variant.ClientRecord[]
}

const EditProductModal: React.FC<EditProductModalProps> = ({
  isOpen,
  setIsOpen,
  product,
}) => {
  const editProduct = trpc.products.edit.useMutation()
  const { data: variantsData, isLoading: variantsLoading } =
    trpc.variants.list.useQuery({
      cursor: encodeCursor({
        parameters: {
          productId: product.id,
        },
        createdAt: new Date(0),
        direction: 'forward',
      }),
    })
  const variants = variantsData?.data
  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Edit Product"
      formSchema={editProductSchema}
      defaultValues={{
        product,
        variant: variants?.[0],
        id: product.id,
      }}
      onSubmit={async (item) => {
        await editProduct.mutateAsync(item)
      }}
      key={`${product.id}-${variantsLoading}`}
    >
      <ProductFormFields editProduct />
    </FormModal>
  )
}

export default EditProductModal
