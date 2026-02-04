'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/app/_trpc/client'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

interface CancelScheduledAdjustmentButtonProps {
  subscriptionId: string
}

export const CancelScheduledAdjustmentButton = ({
  subscriptionId,
}: CancelScheduledAdjustmentButtonProps) => {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const cancelScheduledAdjustmentMutation =
    trpc.subscriptions.cancelScheduledAdjustment.useMutation({
      onSuccess: (data) => {
        const itemCount = data.canceledItemCount
        let itemSuffix: string
        if (itemCount > 0) {
          itemSuffix = ` (${itemCount} item${itemCount === 1 ? '' : 's'} removed)`
        } else {
          itemSuffix = ''
        }
        toast.success(`Scheduled adjustment canceled${itemSuffix}`)
        router.refresh()
        setIsOpen(false)
      },
      onError: (error) => {
        toast.error(
          error.message || 'Failed to cancel scheduled adjustment'
        )
      },
    })

  const handleConfirm = () => {
    cancelScheduledAdjustmentMutation.mutate({ id: subscriptionId })
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          Cancel Scheduled Change
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Cancel Scheduled Adjustment
          </AlertDialogTitle>
          <AlertDialogDescription>
            This will cancel the scheduled plan change. The
            subscription will continue with its current plan without
            any changes at the end of the billing period.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={cancelScheduledAdjustmentMutation.isPending}
          >
            Go Back
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              handleConfirm()
            }}
            disabled={cancelScheduledAdjustmentMutation.isPending}
          >
            {cancelScheduledAdjustmentMutation.isPending
              ? 'Canceling...'
              : 'Confirm'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
