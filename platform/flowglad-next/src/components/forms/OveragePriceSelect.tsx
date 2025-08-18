import { usePriceFormContext } from '@/app/hooks/usePriceFormContext'
import { trpc } from '@/app/_trpc/client'
import { Controller, FieldError } from 'react-hook-form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Price } from '@/db/schema/prices'
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'

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
      {isLoading ? (
        <Skeleton className="h-9 w-full" />
      ) : (
        <FormField
          control={control}
          name={FIELD_NAME}
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>Overage Price</FormLabel>
              <FormControl>
                <Select
                  value={field.value ?? ''}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select overage price" />
                  </SelectTrigger>
                  <SelectContent>
                    {overagePrices?.map((price) => (
                      <SelectItem key={price.id} value={price.id}>
                        {overagePriceLabelFromPrice(price)}
                      </SelectItem>
                    )) ?? []}
                  </SelectContent>
                </Select>
              </FormControl>
              <p className="text-sm text-muted-foreground mt-1">
                The display price to show for overages on the checkout
                screen.
              </p>
              <FormMessage />
            </FormItem>
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
