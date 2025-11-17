'use client'

import FormModal from '@/components/forms/FormModal'
import {
  UsageMeter,
  editUsageMeterSchema,
} from '@/db/schema/usageMeters'
import UsageMeterFormFields from '@/components/forms/UsageMeterFormFields'
import PriceFormFields from '@/components/forms/PriceFormFields'
import { trpc } from '@/app/_trpc/client'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { PriceType } from '@/types'
import {
  isCurrencyZeroDecimal,
  countableCurrencyAmountToRawStringAmount,
} from '@/utils/stripe'
import { toast } from 'sonner'

interface EditUsageMeterModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  usageMeter: UsageMeter.ClientRecord
}

const EditUsageMeterModal: React.FC<EditUsageMeterModalProps> = ({
  isOpen,
  setIsOpen,
  usageMeter,
}) => {
  const editUsageMeter = trpc.usageMeters.update.useMutation({
    onSuccess: () => {
      toast.success('Usage meter updated successfully')
    },
    onError: () => {
      toast.error('Failed to create usage meter')
    },
  })
  const { organization } = useAuthenticatedContext()

  // Don't render modal if organization is not loaded yet
  if (!organization) {
    return null
  }

  // Query for all prices and filter client-side for this usage meter
  // This is acceptable since we're just loading one usage meter's data
  const pricesQuery = trpc.prices.list.useQuery(
    {
      limit: 100, // Reasonable limit
    },
    {
      enabled: isOpen,
    }
  )

  // Wait for prices to load before rendering the form
  if (isOpen && pricesQuery.isLoading) {
    return null
  }

  // Get the active/default price for this usage meter
  const currentPrice = pricesQuery.data?.data.find(
    (price) =>
      price.usageMeterId === usageMeter.id &&
      price.active &&
      price.isDefault
  )

  // Explicitly exclude create-only and read-only fields from defaultValues
  const {
    pricingModelId,
    organizationId,
    livemode,
    ...editableFields
  } = usageMeter

  const zeroDecimal = isCurrencyZeroDecimal(
    organization.defaultCurrency
  )

  const usageEventsPerUnit =
    currentPrice?.usageEventsPerUnit != null
      ? currentPrice.usageEventsPerUnit
      : 1

  const defaultValues = {
    id: usageMeter.id,
    usageMeter: editableFields,
    price: {
      type: PriceType.Usage,
      usageEventsPerUnit,
    },
    __rawPriceString: currentPrice
      ? countableCurrencyAmountToRawStringAmount(
          currentPrice.currency,
          currentPrice.unitPrice!
        )
      : zeroDecimal
        ? '0'
        : '0.00',
  }

  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Edit Usage Meter"
      formSchema={editUsageMeterSchema}
      defaultValues={defaultValues}
      onSubmit={async (input) => {
        await editUsageMeter.mutateAsync(input)
      }}
    >
      <div className="space-y-6">
        <UsageMeterFormFields edit={true} />
        <div className="border-t pt-6">
          <h3 className="text-sm font-medium mb-4">
            Price Configuration
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Editing the price will create a new price version and mark
            it as active.
          </p>
          <PriceFormFields
            priceOnly
            edit={true}
            pricingModelId={usageMeter.pricingModelId}
            disableUsageMeter={true}
            fixedUsageMeterId={usageMeter.id}
            disablePriceType={true}
          />
        </div>
      </div>
    </FormModal>
  )
}

export default EditUsageMeterModal
