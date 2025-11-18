'use client'

import FormModal from '@/components/forms/FormModal'
import { createUsageMeterFormSchema } from '@/db/schema/usageMeters'
import UsageMeterFormFields from '@/components/forms/UsageMeterFormFields'
import PriceFormFields from '@/components/forms/PriceFormFields'
import { trpc } from '@/app/_trpc/client'
import { UsageMeterAggregationType, PriceType } from '@/types'
import { useAuthenticatedContext } from '@/contexts/authContext'
import {
  isCurrencyZeroDecimal,
  rawStringAmountToCountableCurrencyAmount,
} from '@/utils/stripe'
import { toast } from 'sonner'

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
      defaultValues={{
        usageMeter: {
          name: '',
          slug: '',
          pricingModelId: defaultPricingModelId || '',
          aggregationType: UsageMeterAggregationType.Sum,
        },
        price: {
          type: PriceType.Usage,
          usageEventsPerUnit: 1,
        },
        __rawPriceString: zeroDecimal ? '0' : '0.00',
      }}
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
            disableUsageMeter={true}
            disablePriceType={true}
          />
        </div>
      </div>
    </FormModal>
  )
}

export default CreateUsageMeterModal
