'use client'

import {
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
import type { AddSubscriptionFeatureFormValues } from './addSubscriptionFeatureFormSchema'

interface AddSubscriptionFeatureItemFormFieldsProps {
  featureItems?: z.infer<
    typeof subscriptionItemFeaturesClientSelectSchema
  >[]
}

export const AddSubscriptionFeatureItemFormFields = ({
  featureItems = [],
}: AddSubscriptionFeatureItemFormFieldsProps) => {
  const form = useFormContext<AddSubscriptionFeatureFormValues>()
  const subscriptionId = form.watch('id')

  const { data: pricingModelData } = trpc.subscriptions.get.useQuery(
    { id: subscriptionId },
    {
      enabled: Boolean(subscriptionId),
      staleTime: 0,
    }
  )

  const pricingModelId = pricingModelData?.subscription.pricingModelId

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
    form.setValue('featureId', '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriptionId])

  // Get feature IDs of toggle features already added to this subscription
  const toggleFeatures = featureItems.filter(
    (item) => item.type === FeatureType.Toggle && !item.expiredAt
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
    isLoadingFeatures ||
    !pricingModelId ||
    featureOptions.length === 0

  const selectedFeature = featureOptions.find(
    (feature) => feature.id === selectedFeatureId
  )
  const showImmediateGrantToggle =
    selectedFeature?.type === FeatureType.UsageCreditGrant

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
    isSelectedFeatureARecurringUsageGrant && selectedFeature
      ? (selectedFeature.amount ?? 0)
      : 0

  const showExistingFeatureCallout =
    isSelectedFeatureARecurringUsageGrant &&
    existingRecurringUsageGrants.length > 0 &&
    currentAmount > 0

  return (
    <div className="space-y-2">
      <p className="mb-5 text-sm text-muted-foreground">
        Grant an additional feature to this subscription. Action
        cannot be undone.
      </p>

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
