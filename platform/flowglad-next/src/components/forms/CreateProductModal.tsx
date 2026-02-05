'use client'
import {
  type CreateProductFormSchema,
  createProductFormSchema,
  type Price,
} from '@db-core/schema/prices'
import type { Product } from '@db-core/schema/products'
import { toast } from 'sonner'
import { trpc } from '@/app/_trpc/client'
import FormModal from '@/components/forms/FormModal'
import { ProductFormFields } from '@/components/forms/ProductFormFields'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { singlePaymentDummyPrice } from '@/stubs/priceStubs'
import { rawStringAmountToCountableCurrencyAmount } from '@/utils/stripe'

export const defaultPrice: Price.ClientSinglePaymentInsert = {
  ...singlePaymentDummyPrice,
  name: 'Default Price',
}

const defaultProduct: Product.ClientInsert = {
  name: '',
  active: true,
  description: '',
  imageURL: '',
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
  onSubmitStart,
  onSubmitSuccess,
  defaultPricingModelId,
  hidePricingModelSelect,
}: {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  defaultValues?: CreateProductFormSchema
  onSubmitStart?: () => void
  onSubmitSuccess?: () => void
  onSubmitError?: (error: Error) => void
  defaultPricingModelId: string
  hidePricingModelSelect?: boolean
}) => {
  const { organization } = useAuthenticatedContext()
  const createProduct = trpc.products.create.useMutation()
  if (!organization) {
    return <></>
  }
  const getDefaultValues = () =>
    defaultValues ?? {
      product: {
        ...defaultProduct,
        pricingModelId: defaultPricingModelId,
      },
      price: {
        ...defaultPrice,
        currency: organization.defaultCurrency,
      },
      __rawPriceString: '0',
    }
  return (
    <FormModal
      title="Create Product"
      formSchema={createProductFormSchema}
      defaultValues={getDefaultValues}
      onSubmit={async (input) => {
        if (onSubmitStart) {
          onSubmitStart()
        }
        const unitPrice = rawStringAmountToCountableCurrencyAmount(
          organization!.defaultCurrency,
          input.__rawPriceString!
        )

        const resp = await createProduct.mutateAsync({
          ...input,
          price: {
            ...input.price,
            unitPrice,
            // default to using product slug for price slug
            slug: input.product.slug,
          },
        })
        navigator.clipboard.writeText(
          `${window.location.origin}/product/${resp.product.id}/purchase`
        )
        toast.success('Purchase link copied to clipboard')
        if (onSubmitSuccess) {
          onSubmitSuccess()
        }
      }}
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      mode="drawer"
      submitButtonText="Create Product"
    >
      <ProductFormFields
        hidePricingModelSelect={hidePricingModelSelect}
      />
    </FormModal>
  )
}

export default CreateProductModal
