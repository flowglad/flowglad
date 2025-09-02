'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/core'
import { SubscriptionActionsProps } from '../types'
import { CancelSubscriptionModal } from './cancel-subscription-modal'

export function SubscriptionActions({
  subscriptionId,
  subscriptionName,
  status,
  cancelAtPeriodEnd,
  currentPeriodEnd,
  onCancel,
  loading = false,
  className,
}: SubscriptionActionsProps) {
  const [showCancelModal, setShowCancelModal] = useState(false)
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

  const canCancel = status === 'active' || status === 'trialing'

  if (!canCancel || cancelAtPeriodEnd || !onCancel) {
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

      {showCancelModal && (
        <CancelSubscriptionModal
          isOpen={showCancelModal}
          onOpenChange={setShowCancelModal}
          subscriptionId={subscriptionId}
          subscriptionName={subscriptionName}
          currentPeriodEnd={currentPeriodEnd}
          onConfirm={handleCancel}
          loading={isProcessing}
        />
      )}
    </div>
  )
}
