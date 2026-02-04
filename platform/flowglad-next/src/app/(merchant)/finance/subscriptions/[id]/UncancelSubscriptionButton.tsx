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

interface UncancelSubscriptionButtonProps {
  subscriptionId: string
}

export const UncancelSubscriptionButton = ({
  subscriptionId,
}: UncancelSubscriptionButtonProps) => {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const uncancelMutation = trpc.subscriptions.uncancel.useMutation({
    onSuccess: () => {
      toast.success('Subscription cancellation has been reverted')
      router.refresh()
      setIsOpen(false)
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to uncancel subscription')
    },
  })

  const handleConfirm = () => {
    uncancelMutation.mutate({ id: subscriptionId })
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          Undo Cancellation
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Undo Scheduled Cancellation
          </AlertDialogTitle>
          <AlertDialogDescription>
            This will restore the subscription to active status and
            reschedule billing. The subscription will continue to
            renew as normal.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={uncancelMutation.isPending}>
            Go Back
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              handleConfirm()
            }}
            disabled={uncancelMutation.isPending}
          >
            {uncancelMutation.isPending ? 'Reverting...' : 'Confirm'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
