'use client'

import { PriceType } from '@db-core/enums'
import { trpc } from '@/app/_trpc/client'
import FormModal from '@/components/forms/FormModal'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { createPriceFormSchema, Price } from '@/db/schema/prices'
import {
  countableCurrencyAmountToRawStringAmount,
  rawStringAmountToCountableCurrencyAmount,
} from '@/utils/stripe'
import PriceFormFields from './PriceFormFields'

interface CreatePriceModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  productId: string
  previousPrice: Price.ClientRecord
}

const getDefaultValues = (
  previousPrice: Price.ClientRecord
): { price: Price.ClientInsert; __rawPriceString: string } => {
  const __rawPriceString = countableCurrencyAmountToRawStringAmount(
    previousPrice.currency,
    previousPrice.unitPrice
  )

  const baseCoreValues = {
    isDefault: previousPrice.isDefault,
    unitPrice: previousPrice.unitPrice,
    slug: previousPrice.slug,
    active: true,
  }

  if (previousPrice.type === PriceType.SinglePayment) {
    // Single payment prices require productId
    if (!Price.clientHasProductId(previousPrice)) {
      throw new Error('Single payment prices must have a productId')
    }
    return {
      price: {
        ...baseCoreValues,
        productId: previousPrice.productId,
        type: PriceType.SinglePayment,
      },
      __rawPriceString,
    }
  }
  if (previousPrice.type === PriceType.Subscription) {
    // Subscription prices require productId
    if (!Price.clientHasProductId(previousPrice)) {
      throw new Error('Subscription prices must have a productId')
    }
    return {
      price: {
        ...baseCoreValues,
        productId: previousPrice.productId,
        type: PriceType.Subscription,
        intervalUnit: previousPrice.intervalUnit,
        intervalCount: previousPrice.intervalCount,
        trialPeriodDays: previousPrice.trialPeriodDays,
        usageEventsPerUnit: previousPrice.usageEventsPerUnit,
        usageMeterId: previousPrice.usageMeterId,
      },
      __rawPriceString,
    }
  }
  if (previousPrice.type === PriceType.Usage) {
    // Usage prices don't have productId
    return {
      price: {
        ...baseCoreValues,
        productId: null,
        intervalCount: previousPrice.intervalCount,
        intervalUnit: previousPrice.intervalUnit,
        trialPeriodDays: previousPrice.trialPeriodDays,
        usageEventsPerUnit: previousPrice.usageEventsPerUnit,
        type: PriceType.Usage,
        usageMeterId: previousPrice.usageMeterId,
      },
      __rawPriceString,
    }
  }
  throw new Error('Invalid price type')
}

const CreatePriceModal: React.FC<CreatePriceModalProps> = ({
  isOpen,
  setIsOpen,
  productId,
  previousPrice,
}) => {
  const createPrice = trpc.prices.create.useMutation()
  const { organization } = useAuthenticatedContext()
  const productQuery = trpc.products.get.useQuery({ id: productId })
  const isDefaultProduct = productQuery.data?.default === true
  const pricingModelId = productQuery.data?.pricingModelId
  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="New Price"
      formSchema={createPriceFormSchema}
      defaultValues={() => getDefaultValues(previousPrice)}
      onSubmit={async (input) => {
        await createPrice.mutateAsync({
          ...input,
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
        productId={productId}
        disablePriceType
        isDefaultProductOverride={isDefaultProduct}
        pricingModelId={pricingModelId}
      />
    </FormModal>
  )
}

export default CreatePriceModal
