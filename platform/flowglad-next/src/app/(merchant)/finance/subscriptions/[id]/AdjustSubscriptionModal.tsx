'use client'

import { CurrencyCode, PriceType } from '@db-core/enums'
import type { Price } from '@db-core/schema/prices'
import { encodeCursor } from '@db-core/tableUtils'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { useFormContext } from 'react-hook-form'
import { toast } from 'sonner'
import { trpc } from '@/app/_trpc/client'
import { useDebounce } from '@/app/hooks/useDebounce'
import FormModal, {
  type ModalInterfaceProps,
} from '@/components/forms/FormModal'
import { Skeleton } from '@/components/ui/skeleton'
import type { RichSubscription } from '@/subscriptions/schemas'
import { SubscriptionAdjustmentTiming } from '@/types'
import { AdjustmentPreview } from './AdjustmentPreview'
import { AdjustSubscriptionFormFields } from './AdjustSubscriptionFormFields'
import {
  type AdjustSubscriptionFormValues,
  adjustSubscriptionFormSchema,
} from './adjustSubscriptionFormSchema'

interface AdjustSubscriptionModalProps extends ModalInterfaceProps {
  subscription: RichSubscription
  pricingModelId: string
}

/**
 * Builds the adjustment payload from form values.
 * Shared between preview and submit to avoid duplication.
 */
function buildAdjustmentPayload(
  priceId: string,
  quantity: number,
  timing: SubscriptionAdjustmentTiming,
  prorateCurrentBillingPeriod: boolean
) {
  const newSubscriptionItems = [{ priceId, quantity }]

  if (timing === SubscriptionAdjustmentTiming.Immediately) {
    return {
      timing: SubscriptionAdjustmentTiming.Immediately as const,
      newSubscriptionItems,
      prorateCurrentBillingPeriod,
    }
  }

  if (
    timing ===
    SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod
  ) {
    return {
      timing:
        SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod as const,
      newSubscriptionItems,
    }
  }

  // Auto timing
  return {
    timing: SubscriptionAdjustmentTiming.Auto as const,
    newSubscriptionItems,
    prorateCurrentBillingPeriod,
  }
}

/**
 * Inner component that has access to the form context for watching values
 * and triggering preview requests.
 */
const AdjustSubscriptionModalContent = ({
  subscription,
  availablePrices,
  isLoadingPrices,
  onPreviewStateChange,
}: {
  subscription: RichSubscription
  availablePrices: Price.ClientRecord[]
  isLoadingPrices: boolean
  onPreviewStateChange: (canAdjust: boolean | undefined) => void
}) => {
  const form = useFormContext<AdjustSubscriptionFormValues>()
  const priceId = form.watch('priceId')
  const quantity = form.watch('quantity')
  const timing = form.watch('timing')
  const prorateCurrentBillingPeriod = form.watch(
    'prorateCurrentBillingPeriod'
  )

  const previewMutation =
    trpc.subscriptions.previewAdjust.useMutation({
      onSuccess: (data) => {
        onPreviewStateChange(data.canAdjust)
      },
      onError: () => {
        onPreviewStateChange(false)
      },
    })

  // Debounced preview function using the shared hook
  const debouncedPreview = useDebounce(() => {
    if (!priceId) return

    previewMutation.mutate({
      id: subscription.id,
      adjustment: buildAdjustmentPayload(
        priceId,
        quantity,
        timing,
        prorateCurrentBillingPeriod
      ),
    })
  }, 300)

  // Trigger preview when form values change
  useEffect(() => {
    if (priceId) {
      debouncedPreview()
    } else {
      // Reset canAdjust state when no price selected
      onPreviewStateChange(undefined)
    }
  }, [
    priceId,
    quantity,
    timing,
    prorateCurrentBillingPeriod,
    debouncedPreview,
    onPreviewStateChange,
  ])

  // Get current price ID from subscription items
  const currentPriceId = subscription.subscriptionItems[0]?.price.id

  // Get currency from current subscription item price
  const currency =
    subscription.subscriptionItems[0]?.price.currency ??
    CurrencyCode.USD

  if (isLoadingPrices) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <AdjustSubscriptionFormFields
        availablePrices={availablePrices}
        currentPriceId={currentPriceId}
        currency={currency}
      />

      <AdjustmentPreview
        preview={previewMutation.data}
        isLoading={previewMutation.isPending}
        error={previewMutation.error?.message}
        currency={currency}
      />
    </div>
  )
}

export const AdjustSubscriptionModal = ({
  isOpen,
  setIsOpen,
  subscription,
  pricingModelId,
}: AdjustSubscriptionModalProps) => {
  const router = useRouter()
  const adjustMutation = trpc.subscriptions.adjust.useMutation()
  const [previewCanAdjust, setPreviewCanAdjust] = useState<
    boolean | undefined
  >(undefined)

  // Fetch prices for the pricing model
  const { data: pricesData, isLoading: isLoadingPrices } =
    trpc.prices.list.useQuery(
      {
        cursor: encodeCursor({
          parameters: {
            pricingModelId,
          },
          createdAt: new Date(0),
          direction: 'forward',
        }),
        limit: 100,
      },
      {
        enabled: isOpen,
        refetchOnMount: 'always',
        staleTime: 0,
      }
    )

  // Filter to only subscription-type prices (not usage prices) that are active
  const availablePrices = useMemo(() => {
    if (!pricesData?.data) return []
    return pricesData.data.filter(
      (price) => price.type !== PriceType.Usage && price.active
    )
  }, [pricesData])

  // Get current subscription item details for defaults
  const currentSubscriptionItem = subscription.subscriptionItems[0]
  const currentPriceId = currentSubscriptionItem?.price.id
  const currentQuantity = currentSubscriptionItem?.quantity ?? 1

  const getDefaultValues = (): AdjustSubscriptionFormValues => ({
    // Pre-select current price so users can easily change just quantity
    priceId: currentPriceId ?? '',
    quantity: currentQuantity,
    timing: SubscriptionAdjustmentTiming.Auto,
    prorateCurrentBillingPeriod: true,
  })

  const handleSubmit = async (
    values: AdjustSubscriptionFormValues
  ) => {
    try {
      const result = await adjustMutation.mutateAsync({
        id: subscription.id,
        adjustment: buildAdjustmentPayload(
          values.priceId,
          values.quantity,
          values.timing,
          values.prorateCurrentBillingPeriod
        ),
      })

      const timingLabel =
        result.resolvedTiming ===
        SubscriptionAdjustmentTiming.Immediately
          ? 'immediately'
          : 'at end of billing period'

      toast.success(
        `Subscription ${result.isUpgrade ? 'upgraded' : 'adjusted'} ${timingLabel}`
      )

      // Refresh page data to show updated subscription state
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to adjust subscription'
      )
      throw error
    }
  }

  // Disable submit if:
  // - No available prices
  // - Mutation is pending
  // - Preview explicitly says canAdjust: false
  const submitDisabled =
    !availablePrices.length ||
    adjustMutation.isPending ||
    previewCanAdjust === false

  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Adjust Subscription"
      formSchema={adjustSubscriptionFormSchema}
      defaultValues={getDefaultValues}
      onSubmit={handleSubmit}
      submitButtonText="Confirm Adjustment"
      submitDisabled={submitDisabled}
    >
      <AdjustSubscriptionModalContent
        subscription={subscription}
        availablePrices={availablePrices}
        isLoadingPrices={isLoadingPrices}
        onPreviewStateChange={setPreviewCanAdjust}
      />
    </FormModal>
  )
}
