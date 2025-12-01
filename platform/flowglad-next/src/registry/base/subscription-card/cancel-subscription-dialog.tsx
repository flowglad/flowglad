'use client'

import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'
import { CancelSubscriptionDialogProps } from './types'
import { formatDate } from '@/registry/lib/date'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/registry/components/dialog'

export function CancelSubscriptionDialog({
  isOpen,
  onOpenChange,
  subscriptionId,
  currentPeriodEnd,
  onConfirm,
  loading = false,
}: CancelSubscriptionDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-32px)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            Cancel Subscription
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to cancel your subscription?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md bg-muted p-4">
            <h4 className="text-sm text-foreground mb-2">
              What happens when you cancel:
            </h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              {currentPeriodEnd && (
                <li>
                  • Your subscription will remain active until{' '}
                  {formatDate(currentPeriodEnd)}
                </li>
              )}
              <li>
                • You won&apos;t be charged after the current period
                ends
              </li>
              <li>• Your data and settings will be preserved</li>
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
            variant="destructive"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Canceling...' : 'Cancel subscription'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
