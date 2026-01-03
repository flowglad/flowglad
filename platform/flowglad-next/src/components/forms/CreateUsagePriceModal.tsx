'use client'

import { useFormContext } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { trpc } from '@/app/_trpc/client'
import FormModal from '@/components/forms/FormModal'
import PriceFormFields from '@/components/forms/PriceFormFields'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useAuthenticatedContext } from '@/contexts/authContext'
import {
  createProductFormSchema,
  usagePriceDefaultColumns,
} from '@/db/schema/prices'
import type { UsageMeter } from '@/db/schema/usageMeters'
import { IntervalUnit } from '@/types'
import {
  isCurrencyZeroDecimal,
  rawStringAmountToCountableCurrencyAmount,
} from '@/utils/stripe'

/**
 * Custom schema for CreateUsagePriceModal that requires slug with minLength 1
 *
 * Note: This extends createProductFormSchema because creating a usage price
 * requires creating a product behind the scenes (products and prices are
 * tightly coupled in the data model). The product is an implementation detail
 * hidden from the user, who only sees "usage price" in the UI.
 */
const createUsagePriceFormSchema = createProductFormSchema.refine(
  (data) => {
    const slug = data.product.slug?.trim()
    return slug !== undefined && slug !== null && slug.length >= 1
  },
  {
    message: 'Slug is required and must be at least 1 character',
    path: ['product', 'slug'],
  }
)

export type CreateUsagePriceFormSchema = z.infer<
  typeof createUsagePriceFormSchema
>

/**
 * Slug field component for the usage price form
 */
function SlugField() {
  const { control } = useFormContext<CreateUsagePriceFormSchema>()

  return (
    <FormField
      control={control}
      name="product.slug"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Slug</FormLabel>
          <FormControl>
            <Input
              {...field}
              value={field.value ?? ''}
              placeholder="usage-price-slug"
            />
          </FormControl>
          <FormDescription>
            A unique identifier for this usage price
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

interface CreateUsagePriceModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  usageMeter: UsageMeter.ClientRecord
}

/**
 * CreateUsagePriceModal component
 *
 * Creates a new usage price for a specific usage meter.
 * Behind the scenes, this creates a product with a usage price attached.
 * The product is an implementation detail hidden from the user.
 */
export const CreateUsagePriceModal = ({
  isOpen,
  setIsOpen,
  usageMeter,
}: CreateUsagePriceModalProps) => {
  const { organization } = useAuthenticatedContext()
  const createProduct = trpc.products.create.useMutation()
  const utils = trpc.useUtils()

  if (!organization) {
    return null
  }

  const zeroDecimal = isCurrencyZeroDecimal(
    organization.defaultCurrency
  )

  // Validate defaultValues with createProductFormSchema (allows empty slug).
  // Form submission uses createUsagePriceFormSchema (requires slug minLength 1).
  const defaultValues = createProductFormSchema.parse({
    product: {
      name: '',
      active: true,
      description: '',
      imageURL: '',
      singularQuantityLabel: null,
      pluralQuantityLabel: null,
      pricingModelId: usageMeter.pricingModelId,
      default: false,
      slug: '',
    },
    price: {
      ...usagePriceDefaultColumns,
      currency: organization.defaultCurrency,
      isDefault: true,
      usageMeterId: usageMeter.id,
      usageEventsPerUnit: 1,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 0,
    },
    __rawPriceString: zeroDecimal ? '0' : '0.00',
  })

  return (
    <FormModal
      title="Create Usage Price"
      formSchema={createUsagePriceFormSchema}
      defaultValues={defaultValues}
      onSubmit={async (input) => {
        const unitPrice = rawStringAmountToCountableCurrencyAmount(
          organization.defaultCurrency,
          input.__rawPriceString!
        )

        await createProduct.mutateAsync({
          ...input,
          price: {
            ...input.price,
            unitPrice,
            // Use the same slug for both product and price
            slug: input.product.slug,
          },
        })
      }}
      onSuccess={async () => {
        // Invalidate the prices query to refresh the grid
        await utils.prices.getTableRows.invalidate()
        toast.success('Usage price created successfully')
      }}
      isOpen={isOpen}
      setIsOpen={setIsOpen}
    >
      <SlugField />
      <PriceFormFields
        priceOnly={true}
        pricingModelId={usageMeter.pricingModelId}
        hideUsageMeter={true}
        disablePriceType={true}
        hidePriceName={true}
        hidePriceType={true}
      />
    </FormModal>
  )
}

export default CreateUsagePriceModal
