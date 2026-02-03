'use client'

import { PriceType } from '@db-core/enums'
import type { Price } from '@db-core/schema/prices'
import { encodeCursor } from '@db-core/tableUtils'
import { useEffect, useMemo, useRef } from 'react'
import { useFormContext } from 'react-hook-form'
import { toast } from 'sonner'
import { trpc } from '@/app/_trpc/client'
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
 * Inner component that has access to the form context for watching values
 * and triggering preview requests.
 */
const AdjustSubscriptionModalContent = ({
  subscription,
  availablePrices,
  isLoadingPrices,
}: {
  subscription: RichSubscription
  availablePrices: Price.ClientRecord[]
  isLoadingPrices: boolean
}) => {
  const form = useFormContext<AdjustSubscriptionFormValues>()
  const priceId = form.watch('priceId')
  const quantity = form.watch('quantity')
  const timing = form.watch('timing')
  const prorateCurrentBillingPeriod = form.watch(
    'prorateCurrentBillingPeriod'
  )

  // Debounce preview requests
  const debounceTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null)

  const previewMutation =
    trpc.subscriptions.previewAdjust.useMutation()

  // Store the mutate function in a ref to avoid dependency issues
  const mutateRef = useRef(previewMutation.mutate)
  mutateRef.current = previewMutation.mutate

  // Trigger preview when form values change
  useEffect(() => {
    // Clear any pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // Only fetch preview if we have a valid price selected
    if (!priceId) {
      return
    }

    debounceTimerRef.current = setTimeout(() => {
      const buildAdjustment = () => {
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

      mutateRef.current({
        id: subscription.id,
        adjustment: buildAdjustment(),
      })
    }, 300) // 300ms debounce

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [
    priceId,
    quantity,
    timing,
    prorateCurrentBillingPeriod,
    subscription.id,
  ])

  // Get current price ID from subscription items
  const currentPriceId = subscription.subscriptionItems[0]?.price.id

  // Get currency from current subscription item price
  const currency =
    subscription.subscriptionItems[0]?.price.currency ?? 'usd'

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
  const adjustMutation = trpc.subscriptions.adjust.useMutation()

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

  // Get current price ID from subscription items
  const currentPriceId = subscription.subscriptionItems[0]?.price.id

  const getDefaultValues = (): AdjustSubscriptionFormValues => ({
    priceId: '',
    quantity: subscription.subscriptionItems[0]?.quantity ?? 1,
    timing: SubscriptionAdjustmentTiming.Auto,
    prorateCurrentBillingPeriod: true,
  })

  const handleSubmit = async (
    values: AdjustSubscriptionFormValues
  ) => {
    try {
      const buildAdjustment = () => {
        const newSubscriptionItems = [
          { priceId: values.priceId, quantity: values.quantity },
        ]

        if (
          values.timing === SubscriptionAdjustmentTiming.Immediately
        ) {
          return {
            timing: SubscriptionAdjustmentTiming.Immediately as const,
            newSubscriptionItems,
            prorateCurrentBillingPeriod:
              values.prorateCurrentBillingPeriod,
          }
        }

        if (
          values.timing ===
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
          prorateCurrentBillingPeriod:
            values.prorateCurrentBillingPeriod,
        }
      }

      const result = await adjustMutation.mutateAsync({
        id: subscription.id,
        adjustment: buildAdjustment(),
      })

      const timingLabel =
        result.resolvedTiming ===
        SubscriptionAdjustmentTiming.Immediately
          ? 'immediately'
          : 'at end of billing period'

      toast.success(
        `Subscription ${result.isUpgrade ? 'upgraded' : 'adjusted'} ${timingLabel}`
      )
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to adjust subscription'
      )
      throw error
    }
  }

  // Disable submit if no price is selected or if it's the same as current
  const submitDisabled =
    !availablePrices.length || adjustMutation.isPending

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
      />
    </FormModal>
  )
}
