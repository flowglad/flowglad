'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/core'
import { SubscriptionActionsProps } from '../types'
import { CancelSubscriptionModal } from './cancel-subscription-modal'

export function SubscriptionActions({
  subscriptionId,
  status,
  cancelAtPeriodEnd,
  onCancel,
  onReactivate,
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

  const handleReactivate = async () => {
    if (!onReactivate) return

    setIsProcessing(true)
    try {
      await onReactivate(subscriptionId)
    } catch (error) {
      console.error('Failed to reactivate subscription:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const canCancel = status === 'active' || status === 'trialing'
  const canReactivate = cancelAtPeriodEnd && status !== 'canceled'

  if (!canCancel && !canReactivate) {
    return null
  }

  return (
    <div className={cn('flex gap-2', className)}>
      {canReactivate && onReactivate && (
        <Button
          variant="default"
          size="sm"
          onClick={handleReactivate}
          disabled={loading || isProcessing}
        >
          Reactivate Subscription
        </Button>
      )}

      {canCancel && onCancel && !cancelAtPeriodEnd && (
        <>
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
              subscriptionName=""
              currentPeriodEnd={new Date()}
              onConfirm={handleCancel}
              loading={isProcessing}
            />
          )}
        </>
      )}
    </div>
  )
}
