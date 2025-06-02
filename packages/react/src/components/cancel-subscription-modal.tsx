'use client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog'
import { Button, buttonVariants } from './ui/button'
import { SubscriptionCardSubscription } from '../types'
import { formatDate } from '../lib/utils'
import { useState } from 'react'
import { useFlowgladTheme } from '../FlowgladTheme'

export const CancelSubscriptionModal = ({
  subscription,
  cancelSubscription,
}: {
  subscription: SubscriptionCardSubscription
  cancelSubscription: (
    subscription: SubscriptionCardSubscription
  ) => void
}) => {
  const [cancelLoading, setCancelLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const { themedCn } = useFlowgladTheme()
  return (
    <div className={themedCn()}>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          className={themedCn(
            buttonVariants({
              variant: 'destructiveGhost',
              size: 'sm',
            })
          )}
        >
          Cancel
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you sure?</DialogTitle>
            <DialogDescription>
              {`Your subscription will terminate on ${formatDate(subscription.currentBillingPeriodEnd)}, the end of the current
            billing period`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={cancelLoading}
              onClick={async () => {
                setCancelLoading(true)
                await cancelSubscription(subscription)
                setCancelLoading(false)
                setOpen(false)
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
