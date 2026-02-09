'use client'

import { PriceType, UsageMeterAggregationType } from '@db-core/enums'
import { createUsageMeterFormSchema } from '@db-core/schema/usageMeters'
import { toast } from 'sonner'
import { trpc } from '@/app/_trpc/client'
import FormModal from '@/components/forms/FormModal'
import PriceFormFields from '@/components/forms/PriceFormFields'
import UsageMeterFormFields from '@/components/forms/UsageMeterFormFields'
import { useAuthenticatedContext } from '@/contexts/authContext'
import {
  isCurrencyZeroDecimal,
  rawStringAmountToCountableCurrencyAmount,
} from '@/utils/stripe'

interface CreateUsageMeterModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  defaultPricingModelId?: string
}

const CreateUsageMeterModal: React.FC<CreateUsageMeterModalProps> = ({
  isOpen,
  setIsOpen,
  defaultPricingModelId,
}) => {
  const createUsageMeter = trpc.usageMeters.create.useMutation({
    onSuccess: () => {
      toast.success('Usage meter created successfully')
    },
    onError: () => {
      toast.error('Failed to create usage meter')
    },
  })
  const trpcContext = trpc.useContext()
  const { organization } = useAuthenticatedContext()

  if (!organization) {
    return null
  }

  const zeroDecimal = isCurrencyZeroDecimal(
    organization.defaultCurrency
  )

  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Create Usage Meter"
      formSchema={createUsageMeterFormSchema}
      defaultValues={() => ({
        usageMeter: {
          name: '',
          slug: '',
          aggregationType: UsageMeterAggregationType.Sum,
        },
        price: {
          type: PriceType.Usage,
          usageEventsPerUnit: 1,
        },
        __rawPriceString: zeroDecimal ? '0' : '0.00',
      })}
      onSubmit={async (input) => {
        await createUsageMeter.mutateAsync({
          usageMeter: input.usageMeter,
          price: {
            ...input.price,
            unitPrice: rawStringAmountToCountableCurrencyAmount(
              organization!.defaultCurrency,
              input.__rawPriceString!
            ),
          },
        })
      }}
      onSuccess={() => {
        trpcContext.usageMeters.list.invalidate()
      }}
    >
      <div className="space-y-6">
        <UsageMeterFormFields />
        <div className="border-t pt-6">
          <h3 className="text-sm font-medium mb-4">
            Price Configuration
          </h3>
          <PriceFormFields
            priceOnly
            pricingModelId={defaultPricingModelId}
            hideUsageMeter={true}
            hidePriceName={true}
            hidePriceType={true}
            disablePriceType={true}
          />
        </div>
      </div>
    </FormModal>
  )
}

export default CreateUsageMeterModal
