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

  // Fetch current product features for this product via paginated list with filter in cursor
  // Note: Using limit 100 (max allowed by pagination system). If a product has >100 features,
  // only the first 100 will be pre-selected. This seems unlikely in practice.
  const { data: productFeaturesData } =
    trpc.productFeatures.list.useQuery(
      {
        cursor: encodeCursor({
          parameters: {
            productId: product.id,
          },
          createdAt: new Date(0),
          direction: 'forward',
        }),
        limit: 100,
      },
      {
        enabled: isOpen, // Only fetch when modal is open
      }
    )

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

  // Extract feature IDs from product features
  const currentFeatureIds =
    productFeaturesData?.data
      ?.filter((pf) => !pf.expiredAt)
      .map((pf) => pf.featureId) || []

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
        featureIds: currentFeatureIds,
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
