'use client'

import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/registry/lib/cn'
import { X, AlertTriangle } from 'lucide-react'
import { CancelSubscriptionModalProps } from './types'
import { formatDate } from '@/registry/lib/date'

export function CancelSubscriptionModal({
  isOpen,
  onOpenChange,
  subscriptionId,
  subscriptionName,
  currentPeriodEnd,
  onConfirm,
  loading = false,
}: CancelSubscriptionModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onOpenChange(false)
    }
  }

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false)
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () =>
        document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onOpenChange])

  if (!isOpen) return null

  return (
    <div
      ref={overlayRef}
      className={cn(
        'fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4',
        'animate-in fade-in duration-200'
      )}
      onClick={handleOverlayClick}
    >
      <Card className="w-full max-w-md animate-in slide-in-from-bottom-2 duration-300">
        <CardHeader className="relative">
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-4 top-4 h-8 w-8 p-0"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <CardTitle>Cancel Subscription</CardTitle>
          </div>
          <CardDescription>
            Are you sure you want to cancel your subscription?
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-md bg-amber-50 p-4">
            <h4 className="text-sm font-medium text-amber-900 mb-2">
              What happens when you cancel:
            </h4>
            <ul className="text-sm text-amber-700 space-y-1">
              <li>
                • Your subscription will remain active until{' '}
                {formatDate(currentPeriodEnd)}
              </li>
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
        </CardContent>

        <CardFooter className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Keep Subscription
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Canceling...' : 'Cancel Subscription'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
