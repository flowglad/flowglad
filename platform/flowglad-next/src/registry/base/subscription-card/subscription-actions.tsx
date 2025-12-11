'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/registry/lib/cn'
import { CancelSubscriptionDialog } from './cancel-subscription-dialog'
import type { SubscriptionActionsProps } from './types'
import { UncancelSubscriptionDialog } from './uncancel-subscription-dialog'

export function SubscriptionActions({
  subscriptionId,
  subscriptionName,
  status,
  cancelAtPeriodEnd,
  currentPeriodEnd,
  onCancel,
  onUncancel,
  loading = false,
  className,
}: SubscriptionActionsProps) {
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showUncancelModal, setShowUncancelModal] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  const handleCancel = async () => {
    if (!onCancel) return

    setIsProcessing(true)
    try {
      await onCancel(subscriptionId)
      setShowCancelModal(false)
    } catch (error) {
      console.error('Failed to cancel subscription:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleUncancel = async () => {
    if (!onUncancel) return

    setIsProcessing(true)
    try {
      await onUncancel(subscriptionId)
      setShowUncancelModal(false)
    } catch (error) {
      console.error('Failed to uncancel subscription:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const canCancel = status === 'active' || status === 'trialing'

  // Show uncancel button if subscription is scheduled to cancel
  if (cancelAtPeriodEnd && onUncancel) {
    return (
      <div className={cn('flex gap-2', className)}>
        <Button
          variant="default"
          size="sm"
          onClick={() => setShowUncancelModal(true)}
          disabled={loading || isProcessing}
        >
          Uncancel Subscription
        </Button>

        <UncancelSubscriptionDialog
          isOpen={showUncancelModal}
          onOpenChange={setShowUncancelModal}
          subscriptionId={subscriptionId}
          subscriptionName={subscriptionName}
          currentPeriodEnd={currentPeriodEnd}
          onConfirm={handleUncancel}
          loading={isProcessing}
        />
      </div>
    )
  }

  // Show cancel button if subscription can be canceled
  if (!canCancel || !onCancel) {
    return null
  }

  return (
    <div className={cn('flex gap-2', className)}>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setShowCancelModal(true)}
        disabled={loading || isProcessing}
      >
        Cancel Subscription
      </Button>

      <CancelSubscriptionDialog
        isOpen={showCancelModal}
        onOpenChange={setShowCancelModal}
        subscriptionId={subscriptionId}
        subscriptionName={subscriptionName}
        currentPeriodEnd={currentPeriodEnd}
        onConfirm={handleCancel}
        loading={isProcessing}
      />
    </div>
  )
}
