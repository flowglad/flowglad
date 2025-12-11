'use client'

import { CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/registry/components/dialog'
import type { UncancelSubscriptionDialogProps } from './types'

export function UncancelSubscriptionDialog({
  isOpen,
  onOpenChange,
  subscriptionId,
  currentPeriodEnd,
  onConfirm,
  loading = false,
}: UncancelSubscriptionDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-32px)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            Uncancel Subscription
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to uncancel your subscription?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md bg-muted p-4">
            <h4 className="text-sm text-foreground mb-2">
              What happens when you uncancel:
            </h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>
                • You will be charged normally when the current period
                ends
              </li>
              <li>• Your subscription will remain active</li>
            </ul>
          </div>

          {subscriptionId && (
            <div className="text-sm text-muted-foreground">
              Subscription ID:{' '}
              <span className="font-mono text-xs">
                {subscriptionId}
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Go back
          </Button>
          <Button
            variant="default"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Uncanceling...' : 'Uncancel subscription'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
