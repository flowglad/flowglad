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
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Info } from 'lucide-react'
import { CurrencyCode, FeatureType } from '@/types'
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
  const form = useFormContext<AddSubscriptionFeatureFormValues>()
  const subscriptionItemId = form.watch('subscriptionItemId')
  useEffect(() => {
    if (!subscriptionItemId && activeSubscriptionItems[0]) {
      form.setValue(
        'subscriptionItemId',
        activeSubscriptionItems[0].id
      )
    }
  }, [subscriptionItemId, activeSubscriptionItems, form])

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

  useEffect(() => {
    form.setValue('featureId', '')
  }, [selectedSubscriptionItem?.id, form])

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

  const featureOptions =
    featuresData?.features.filter((feature) => feature.active) ?? []

  const isFeatureSelectDisabled =
    isLoadingProduct ||
    isLoadingFeatures ||
    !productId ||
    !pricingModelId

  return (
    <div className="space-y-6">
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
                      <div className="flex flex-col gap-0.5 text-left">
                        <span className="font-medium">
                          {getSubscriptionItemDisplayName(item)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Quantity: {item.quantity} • Price:{' '}
                          {getSubscriptionItemPriceDisplay(item)}
                        </span>
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

      <div className="space-y-2 rounded-lg border bg-muted/30 p-4 text-sm">
        <p className="font-medium">Selected product details</p>
        {isLoadingProduct ? (
          <Skeleton className="h-5 w-48" />
        ) : productData ? (
          <div className="text-muted-foreground space-y-1">
            <p>
              <span className="font-medium text-foreground">
                Product:
              </span>{' '}
              {productData.name}
            </p>
            <p>
              <span className="font-medium text-foreground">
                Pricing model:
              </span>{' '}
              {productData.pricingModelId}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground">
            Unable to load product details.
          </p>
        )}
      </div>

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
    </div>
  )
}
