import { usePriceFormContext } from '@/app/hooks/usePriceFormContext'
import { trpc } from '@/app/_trpc/client'
import { Controller, FieldError } from 'react-hook-form'
import Select from '@/components/ion/Select'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import Label from '@/components/ion/Label'
import Switch from '@/components/ion/Switch'
import { Price } from '@/db/schema/prices'

const FIELD_NAME = 'price.overagePriceId'

export const overagePriceLabelFromPrice = (
  price: Price.ClientUsageRecord
) => {
  return `${price.name ?? 'Unnamed'} - ${stripeCurrencyAmountToHumanReadableCurrencyAmount(price.currency, price.unitPrice)} ${price.usageEventsPerUnit === 1 ? 'each' : `/ ${price.usageEventsPerUnit}`}`
}

const OveragePriceSelect = ({ productId }: { productId: string }) => {
  const {
    formState: { errors },
    control,
    watch,
    setValue,
  } = usePriceFormContext()
  const { data: overagePrices, isLoading } =
    trpc.prices.listUsagePricesForProduct.useQuery({
      productId,
    })

  const overagePriceId = watch(FIELD_NAME)

  useEffect(() => {
    if (!overagePrices?.length) {
      return
    }
    if (overagePriceId) {
      return
    }
    setValue(FIELD_NAME, overagePrices[0].id)
  }, [overagePriceId, overagePrices, setValue])

  return (
    <>
      <Label>Overage Price</Label>
      {isLoading ? (
        <Skeleton className="h-9 w-full" />
      ) : (
        <Controller
          name={FIELD_NAME}
          control={control}
          render={({ field }) => (
            <Select
              placeholder="Select overage price"
              options={
                overagePrices?.map((price) => ({
                  label: overagePriceLabelFromPrice(price),
                  value: price.id,
                })) ?? []
              }
              value={field.value ?? ''}
              onValueChange={field.onChange}
              hint="The display price to show for overages on the checkout screen."
              error={
                (errors.price?.overagePriceId as FieldError)?.message
              }
            />
          )}
        />
      )}
    </>
  )
}

export const RecurringUsageCreditsOveragePriceSelect = ({
  productId,
}: {
  productId: string
}) => {
  const {
    formState: { errors },
    control,
    watch,
    setValue,
  } = usePriceFormContext()
  const fieldName = 'price.overagePriceId'
  const overagePriceId = watch(fieldName)
  const [isRecurringUsageCredits, setIsRecurringUsageCredits] =
    useState(Boolean(overagePriceId))

  return (
    <div className="flex flex-col gap-2.5">
      <Switch
        label="Intended for Recurring Usage Credits"
        checked={isRecurringUsageCredits}
        onCheckedChange={(checked) => {
          setIsRecurringUsageCredits(checked)
          if (!checked) {
            setValue(fieldName, null)
          }
        }}
      />
      {isRecurringUsageCredits && (
        <OveragePriceSelect productId={productId} />
      )}
    </div>
  )
}
