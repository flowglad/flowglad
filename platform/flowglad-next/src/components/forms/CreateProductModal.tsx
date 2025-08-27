// Generated with Ion on 9/24/2024, 3:10:31 AM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=373:16122
'use client'
import { PriceType } from '@/types'
import { ProductFormFields } from '@/components/forms/ProductFormFields'
import { Price } from '@/db/schema/prices'
import {
  CreateProductSchema,
  createProductSchema,
} from '@/db/schema/prices'
import { trpc } from '@/app/_trpc/client'
import FormModal from '@/components/forms/FormModal'
import { toast } from 'sonner'
import { Product } from '@/db/schema/products'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { singlePaymentDummyPrice } from '@/stubs/priceStubs'

export const defaultPrice: Price.ClientSinglePaymentInsert = {
  ...singlePaymentDummyPrice,
  name: 'Default Price',
}

const defaultProduct: Product.ClientInsert = {
  name: '',
  active: true,
  description: '',
  imageURL: '',
  displayFeatures: [],
  singularQuantityLabel: null,
  pluralQuantityLabel: null,
  pricingModelId: 'pricing_model_111____',
  default: false,
  slug: '',
}

export const CreateProductModal = ({
  isOpen,
  setIsOpen,
  defaultValues,
  chatPreview,
  onSubmitStart,
  onSubmitSuccess,
  defaultPricingModelId,
}: {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  defaultValues?: CreateProductSchema
  onSubmitStart?: () => void
  onSubmitSuccess?: () => void
  onSubmitError?: (error: Error) => void
  chatPreview?: boolean
  defaultPricingModelId: string
}) => {
  const { organization } = useAuthenticatedContext()
  const createProduct = trpc.products.create.useMutation()
  if (!organization) {
    return <></>
  }
  const finalDefaultValues = createProductSchema.parse(
    defaultValues ?? {
      product: {
        ...defaultProduct,
        pricingModelId: defaultPricingModelId,
      },
      price: {
        ...defaultPrice,
        currency: organization.defaultCurrency,
      },
      offerings: [],
    }
  )
  return (
    <FormModal
      title="Create Product"
      formSchema={createProductSchema}
      defaultValues={finalDefaultValues}
      onSubmit={async (input) => {
        if (onSubmitStart) {
          onSubmitStart()
        }
        const resp = await createProduct.mutateAsync(input)
        navigator.clipboard.writeText(
          `${window.location.origin}/product/${resp.product.id}/purchase`
        )
        toast.success('Purchase link copied to clipboard')
        if (onSubmitSuccess) {
          onSubmitSuccess()
        }
      }}
      chatPreview={chatPreview}
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      mode="drawer"
    >
      <ProductFormFields />
    </FormModal>
  )
}

export default CreateProductModal
