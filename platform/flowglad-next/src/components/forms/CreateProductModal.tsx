// Generated with Ion on 9/24/2024, 3:10:31 AM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=373:16122
'use client'
import { PriceType } from '@/types'
import { ProductFormFields } from '@/components/forms/ProductFormFieldsV2'
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

const defaultPrice: Price.ClientOtherInsert = {
  name: '',
  type: PriceType.SinglePayment,
  unitPrice: 100,
  productId: '1',
  isDefault: true,
  intervalCount: null,
  intervalUnit: null,
  trialPeriodDays: null,
  setupFeeAmount: null,
  active: true,
}

const defaultProduct: Product.ClientInsert = {
  name: '',
  active: true,
  description: '',
  imageURL: '',
  displayFeatures: [],
  singularQuantityLabel: null,
  pluralQuantityLabel: null,
}

export const CreateProductModal = ({
  isOpen,
  setIsOpen,
  defaultValues,
  chatPreview,
  onSubmitStart,
  onSubmitSuccess,
}: {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  defaultValues?: CreateProductSchema
  onSubmitStart?: () => void
  onSubmitSuccess?: () => void
  onSubmitError?: (error: Error) => void
  chatPreview?: boolean
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
    >
      <ProductFormFields />
    </FormModal>
  )
}

export default CreateProductModal
