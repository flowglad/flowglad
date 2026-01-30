'use client'

import { IntervalUnit, PriceType } from '@db-core/enums'
import {
  createPriceFormSchema,
  Price,
  pricesClientInsertSchema,
} from '@db-core/schema/prices'
import { trpc } from '@/app/_trpc/client'
import FormModal from '@/components/forms/FormModal'
import { useAuthenticatedContext } from '@/contexts/authContext'
import {
  countableCurrencyAmountToRawStringAmount,
  rawStringAmountToCountableCurrencyAmount,
} from '@/utils/stripe'
import PriceFormFields from './PriceFormFields'

interface EditPriceModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  price: Price.ClientRecord
}

export const parseEditPriceDefaultValues = (
  price: Price.ClientRecord
): { price: Price.ClientInsert; __rawPriceString: string } => {
  const processedPrice = {
    ...price,
    productId: price.productId,
    // Ensure all required fields are present based on price type
    unitPrice: price.unitPrice ?? 0,
    // For SinglePayment, these should be null/undefined
    intervalCount:
      price.type === PriceType.SinglePayment
        ? null
        : (price.intervalCount ?? 1),
    intervalUnit:
      price.type === PriceType.SinglePayment
        ? null
        : (price.intervalUnit ?? IntervalUnit.Month),
    trialPeriodDays: price.trialPeriodDays ?? null,
    usageEventsPerUnit: price.usageEventsPerUnit ?? null,
    usageMeterId: price.usageMeterId ?? null,
  }
  const parsedPrice = pricesClientInsertSchema.parse(processedPrice)
  return {
    price: parsedPrice,
    __rawPriceString: countableCurrencyAmountToRawStringAmount(
      price.currency,
      price.unitPrice!
    ),
  }
}

const EditPriceModal: React.FC<EditPriceModalProps> = ({
  isOpen,
  setIsOpen,
  price,
}) => {
  // we create a new price in backend to keep prices immutable
  // for now, the newly created price will be active & default
  // all other prices will be made non-default and not active
  const editPrice = trpc.prices.create.useMutation({
    onSuccess: () => {
      setIsOpen(false)
    },
  })
  const getDefaultValues = () => parseEditPriceDefaultValues(price)

  const { organization } = useAuthenticatedContext()

  // Only fetch product for non-usage prices (prices with productId)
  const hasProductId = Price.clientHasProductId(price)
  const productQuery = trpc.products.get.useQuery(
    { id: hasProductId ? price.productId : '' },
    { enabled: hasProductId }
  )
  const isDefaultProduct = productQuery.data?.default === true
  const isDefaultPrice = price.isDefault === true
  const pricingModelId = productQuery.data?.pricingModelId
  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Edit Price"
      formSchema={createPriceFormSchema}
      defaultValues={getDefaultValues}
      onSubmit={async (input) => {
        await editPrice.mutateAsync({
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
        edit
        productId={hasProductId ? price.productId : undefined}
        isDefaultProductOverride={isDefaultProduct}
        isDefaultPriceOverride={isDefaultPrice}
        pricingModelId={pricingModelId}
      />
    </FormModal>
  )
}

export default EditPriceModal
