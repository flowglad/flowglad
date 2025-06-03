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
          onClick={() => setOpen(true)}
        >
          Cancel
        </DialogTrigger>
        <DialogContent className="sm:!flowglad-max-w-[32rem]">
          <DialogHeader className="flowglad-flex flowglad-flex-col flowglad-gap-4">
            <DialogTitle>Cancel your subscription?</DialogTitle>
            <DialogDescription className="flowglad-text-sm flowglad-text-left">
              {`Your subscription will terminate on ${formatDate(subscription.currentBillingPeriodEnd)}, the end of the current
            billing period`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <div className="flowglad-flex flowglad-gap-2 flowglad-flex-row flowglad-w-full flowglad-justify-end">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
              >
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
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
