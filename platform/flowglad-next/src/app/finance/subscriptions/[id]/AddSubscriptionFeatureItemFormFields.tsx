'use client'

import { useEffect, useMemo } from 'react'
import { trpc } from '@/app/_trpc/client'
import { useFormContext } from 'react-hook-form'
import type { AddSubscriptionFeatureFormValues } from './addSubscriptionFeatureFormSchema'
import type { RichSubscription } from '@/subscriptions/schemas'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Info } from 'lucide-react'
import {
  CurrencyCode,
  FeatureType,
  FeatureUsageGrantFrequency,
} from '@/types'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'

interface AddSubscriptionFeatureItemFormFieldsProps {
  subscriptionItems: RichSubscription['subscriptionItems']
}

const getSubscriptionItemDisplayName = (
  item: RichSubscription['subscriptionItems'][number]
) => {
  if (item.name) return item.name
  if (item.price?.name) return item.price.name
  return `Subscription item ${item.id.slice(0, 8)}`
}

const getSubscriptionItemPriceDisplay = (
  item: RichSubscription['subscriptionItems'][number]
) => {
  if (
    !item.price ||
    item.price.unitPrice === null ||
    item.price.unitPrice === undefined
  ) {
    return 'N/A'
  }
  return stripeCurrencyAmountToHumanReadableCurrencyAmount(
    (item.price.currency ?? 'USD') as CurrencyCode,
    item.price.unitPrice
  )
}

export const AddSubscriptionFeatureItemFormFields = ({
  subscriptionItems,
}: AddSubscriptionFeatureItemFormFieldsProps) => {
  const activeSubscriptionItems = useMemo(
    () => subscriptionItems.filter((item) => !item.expiredAt),
    [subscriptionItems]
  )
  const hasSingleActiveItem = activeSubscriptionItems.length === 1
  const form = useFormContext<AddSubscriptionFeatureFormValues>()
  const subscriptionItemId = form.watch('subscriptionItemId')
  useEffect(() => {
    if (
      hasSingleActiveItem &&
      activeSubscriptionItems[0]?.id !== subscriptionItemId
    ) {
      form.setValue(
        'subscriptionItemId',
        activeSubscriptionItems[0]?.id
      )
      return
    }
    if (
      (!subscriptionItemId ||
        !activeSubscriptionItems.some(
          (item) => item.id === subscriptionItemId
        )) &&
      activeSubscriptionItems[0]
    ) {
      form.setValue(
        'subscriptionItemId',
        activeSubscriptionItems[0].id
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    subscriptionItemId,
    activeSubscriptionItems,
    hasSingleActiveItem,
  ])

  const selectedSubscriptionItem =
    activeSubscriptionItems.find(
      (item) => item.id === subscriptionItemId
    ) ?? activeSubscriptionItems[0]

  const productId = selectedSubscriptionItem?.price?.productId

  const { data: productData, isLoading: isLoadingProduct } =
    trpc.products.get.useQuery(
      { id: productId ?? '' },
      {
        enabled: Boolean(productId),
        staleTime: 0,
      }
    )

  const pricingModelId = productData?.pricingModelId

  const { data: featuresData, isLoading: isLoadingFeatures } =
    trpc.features.getFeaturesForPricingModel.useQuery(
      { pricingModelId: pricingModelId ?? '' },
      {
        enabled: Boolean(pricingModelId),
        staleTime: 0,
      }
    )

  const selectedFeatureId = form.watch('featureId')
  const grantCreditsImmediatelyValue = form.watch(
    'grantCreditsImmediately'
  )

  useEffect(() => {
    if (!selectedSubscriptionItem?.id) {
      return
    }
    form.setValue('featureId', '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubscriptionItem?.id])

  const featureOptions =
    featuresData?.features.filter((feature) => feature.active) ?? []

  const isFeatureSelectDisabled =
    isLoadingProduct ||
    isLoadingFeatures ||
    !productId ||
    !pricingModelId ||
    featureOptions.length === 0

  const selectedFeature = featureOptions.find(
    (feature) => feature.id === selectedFeatureId
  )
  const showImmediateGrantToggle =
    selectedFeature?.type === FeatureType.UsageCreditGrant &&
    selectedFeature.renewalFrequency ===
      FeatureUsageGrantFrequency.EveryBillingPeriod
  useEffect(() => {
    if (!showImmediateGrantToggle && grantCreditsImmediatelyValue) {
      form.setValue('grantCreditsImmediately', false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showImmediateGrantToggle, grantCreditsImmediatelyValue])

  if (activeSubscriptionItems.length === 0) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          This subscription does not have any active subscription
          items. Add an item before granting additional features.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {!hasSingleActiveItem && (
        <FormField
          control={form.control}
          name="subscriptionItemId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Subscription item</FormLabel>
              <FormControl>
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a subscription item" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeSubscriptionItems.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        <div className="flex flex-col gap-1 text-left">
                          <span className="font-medium">
                            {getSubscriptionItemDisplayName(item)}
                          </span>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>Quantity: {item.quantity}</span>
                            <span className="text-muted-foreground">
                              •
                            </span>
                            <span>
                              Price:{' '}
                              {getSubscriptionItemPriceDisplay(item)}
                            </span>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
              {!isLoadingFeatures &&
                pricingModelId &&
                featureOptions.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No active features are available for the selected
                    pricing model.
                  </p>
                )}
            </FormItem>
          )}
        />
      )}

      <FormField
        control={form.control}
        name="featureId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Feature</FormLabel>
            <FormControl>
              {isLoadingFeatures ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={isFeatureSelectDisabled}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a feature" />
                  </SelectTrigger>
                  <SelectContent>
                    {featureOptions.map((feature) => (
                      <SelectItem key={feature.id} value={feature.id}>
                        <div className="flex flex-col gap-0.5 text-left">
                          <span className="font-medium">
                            {feature.name}
                          </span>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge
                              variant={
                                feature.type ===
                                FeatureType.UsageCreditGrant
                                  ? 'default'
                                  : 'secondary'
                              }
                            >
                              {feature.type ===
                              FeatureType.UsageCreditGrant
                                ? 'Usage grant'
                                : 'Toggle'}
                            </Badge>
                            <span>{feature.slug}</span>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                    {featureOptions.length === 0 && (
                      <SelectItem value="__no_features" disabled>
                        No active features available for this pricing
                        model
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {showImmediateGrantToggle && (
        <FormField
          control={form.control}
          name="grantCreditsImmediately"
          render={({ field }) => (
            <FormItem className="flex flex-col gap-3 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <FormLabel className="text-base">
                    Grant credits immediately
                  </FormLabel>
                  <p className="text-sm text-muted-foreground">
                    Issue usage credits right away in addition to the
                    next billing period grant.
                  </p>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  )
}
