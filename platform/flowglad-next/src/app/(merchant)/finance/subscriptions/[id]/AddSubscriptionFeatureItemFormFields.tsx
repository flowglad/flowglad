'use client'

import {
  type CurrencyCode,
  FeatureType,
  FeatureUsageGrantFrequency,
} from '@db-core/enums'
import type { subscriptionItemFeaturesClientSelectSchema } from '@db-core/schema/subscriptionItemFeatures'
import { Info } from 'lucide-react'
import { useEffect } from 'react'
import { useFormContext } from 'react-hook-form'
import type { z } from 'zod'
import { trpc } from '@/app/_trpc/client'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import type { RichSubscription } from '@/subscriptions/schemas'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import type { AddSubscriptionFeatureFormValues } from './addSubscriptionFeatureFormSchema'

interface AddSubscriptionFeatureItemFormFieldsProps {
  subscriptionItems: RichSubscription['subscriptionItems']
  featureItems?: z.infer<
    typeof subscriptionItemFeaturesClientSelectSchema
  >[]
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
  featureItems = [],
}: AddSubscriptionFeatureItemFormFieldsProps) => {
  const activeSubscriptionItems = subscriptionItems.filter(
    (item) => !item.expiredAt
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

  // Get feature IDs of toggle features already added to this subscription
  const toggleFeatures = featureItems.filter(
    (item) =>
      item.type === FeatureType.Toggle &&
      !item.expiredAt &&
      item.subscriptionItemId === selectedSubscriptionItem?.id
  )
  const existingToggleFeatureIds = new Set(
    toggleFeatures.map((item) => item.featureId)
  )

  // Filter out toggle features that are already added to the subscription
  const allActiveFeatures =
    featuresData?.features.filter((feature) => feature.active) ?? []
  const featureOptions = allActiveFeatures.filter((feature) => {
    // For toggle features, exclude if already added
    if (feature.type === FeatureType.Toggle) {
      return !existingToggleFeatureIds.has(feature.id)
    }
    // For usage credit grants, always show (can be added multiple times)
    return true
  })

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

  // Check if selected feature already exists as an active recurring usage credit grant
  const existingRecurringUsageGrants = featureItems.filter(
    (item) =>
      item.type === FeatureType.UsageCreditGrant &&
      item.featureId === selectedFeatureId &&
      !item.expiredAt &&
      item.renewalFrequency ===
        FeatureUsageGrantFrequency.EveryBillingPeriod
  )
  const currentAmount = existingRecurringUsageGrants.reduce(
    (sum, item) => sum + (item.amount ?? 0),
    0
  )
  const isSelectedFeatureARecurringUsageGrant =
    selectedFeature?.type === FeatureType.UsageCreditGrant &&
    selectedFeature.renewalFrequency ===
      FeatureUsageGrantFrequency.EveryBillingPeriod
  const newAmount =
    isSelectedFeatureARecurringUsageGrant && selectedSubscriptionItem
      ? (selectedFeature.amount ?? 0) *
        selectedSubscriptionItem.quantity
      : 0

  const showExistingFeatureCallout =
    isSelectedFeatureARecurringUsageGrant &&
    existingRecurringUsageGrants.length > 0 &&
    currentAmount > 0

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
    <div className="space-y-2">
      <p className="mb-5 text-sm text-muted-foreground">
        Grant an additional feature to this subscription. Action
        cannot be undone.
      </p>
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
            <FormLabel className="sr-only">Feature</FormLabel>
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
            {showExistingFeatureCallout && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  This feature already exists on this subscription and
                  currently grants {currentAmount} credits every
                  period. Re-adding {selectedFeature.name} will grant{' '}
                  {currentAmount + newAmount} total credits every
                  period going forward.
                </AlertDescription>
              </Alert>
            )}
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
