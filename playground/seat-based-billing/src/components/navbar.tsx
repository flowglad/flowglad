'use client'

import { useBilling } from '@flowglad/nextjs'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AdjustSubscriptionGrid } from '@/components/adjust-subscription-grid'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { authClient } from '@/lib/auth-client'

export function Navbar() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: session } = authClient.useSession()
  const billing = useBilling()
  const [isCancelling, setIsCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [isUncancelling, setIsUncancelling] = useState(false)
  const [uncancelError, setUncancelError] = useState<string | null>(
    null
  )
  const [isChangePlanOpen, setIsChangePlanOpen] = useState(false)

  if (!session?.user) {
    return null
  }

  if (!billing.loaded || billing.errors || !billing.customer) {
    return null // or loading skeleton
  }

  async function handleSignOut() {
    await queryClient.clear()
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push('/sign-in')
        },
      },
    })
  }

  async function handleCancelSubscription() {
    // By default, each customer can only have one active subscription at a time,
    // so accessing the first currentSubscriptions is sufficient.
    // Multiple subscriptions per customer can be enabled in dashboard > settings
    const currentSubscription = billing.currentSubscriptions?.[0]
    const subscriptionId = currentSubscription?.id

    if (!subscriptionId || !billing.cancelSubscription) {
      return
    }

    // Confirm cancellation
    const confirmed = window.confirm(
      'Are you sure you want to cancel your membership? Your subscription will remain active until the end of the current billing period.'
    )

    if (!confirmed) {
      return
    }

    setIsCancelling(true)
    setCancelError(null)

    try {
      await billing.cancelSubscription({
        id: subscriptionId,
        cancellation: {
          timing: 'at_end_of_current_billing_period',
        },
      })
    } catch (error) {
      setCancelError(
        error instanceof Error
          ? error.message
          : 'Failed to cancel subscription. Please try again.'
      )
    } finally {
      setIsCancelling(false)
    }
  }

  async function handleUncancelSubscription() {
    const currentSubscription = billing.currentSubscriptions?.[0]
    const subscriptionId = currentSubscription?.id

    if (!subscriptionId || !billing.uncancelSubscription) {
      return
    }

    // Confirm uncancellation
    const confirmed = window.confirm(
      'Are you sure you want to uncancel your membership? Your subscription will continue as normal.'
    )

    if (!confirmed) {
      return
    }

    setIsUncancelling(true)
    setUncancelError(null)

    try {
      await billing.uncancelSubscription({
        id: subscriptionId,
      })
    } catch (error) {
      setUncancelError(
        error instanceof Error
          ? error.message
          : 'Failed to uncancel subscription. Please try again.'
      )
    } finally {
      setIsUncancelling(false)
    }
  }

  const accountName =
    session.user.name || session.user.email || 'Account'
  // By default, each customer can only have one active subscription at a time,
  // so accessing the first currentSubscriptions is sufficient.
  // Multiple subscriptions per customer can be enabled in dashboard > settings
  const currentSubscription = billing.currentSubscriptions?.[0]

  // Check if subscription is scheduled for cancellation
  // Flowglad subscriptions have: status === "cancellation_scheduled" or cancelScheduledAt property
  const isCancelled =
    currentSubscription &&
    (currentSubscription.status === 'cancellation_scheduled' ||
      (currentSubscription.cancelScheduledAt &&
        !currentSubscription.canceledAt))

  // Format cancellation date for display
  // cancelScheduledAt is in milliseconds (Unix timestamp)
  const cancellationDate = currentSubscription?.cancelScheduledAt
    ? new Date(
        currentSubscription.cancelScheduledAt
      ).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  // Check if subscription is scheduled for cancellation in the future
  const isScheduledForCancellation =
    isCancelled &&
    cancellationDate &&
    currentSubscription?.cancelScheduledAt &&
    currentSubscription.cancelScheduledAt > Date.now()

  return (
    <>
      <nav className="absolute top-0 right-0 flex justify-end items-center gap-4 p-4 z-50">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {accountName}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Account Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleSignOut}>
              Log out
            </DropdownMenuItem>
            {!currentSubscription?.isFreePlan && (
              <>
                <DropdownMenuItem
                  onSelect={() => setIsChangePlanOpen(true)}
                >
                  Change Plan
                </DropdownMenuItem>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="w-full">
                      <DropdownMenuItem
                        onSelect={handleCancelSubscription}
                        disabled={Boolean(
                          isCancelling ||
                            !currentSubscription ||
                            isCancelled
                        )}
                        variant="destructive"
                        className={
                          isCancelled
                            ? 'opacity-60 text-destructive/70'
                            : ''
                        }
                      >
                        {isCancelling
                          ? 'Cancelling...'
                          : 'Cancel Subscription'}
                      </DropdownMenuItem>
                    </span>
                  </TooltipTrigger>
                  {isCancelled && cancellationDate && (
                    <TooltipContent>
                      <p>
                        Subscription is scheduled for cancellation on{' '}
                        {cancellationDate}
                      </p>
                    </TooltipContent>
                  )}
                </Tooltip>
                {isScheduledForCancellation && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="w-full">
                        <DropdownMenuItem
                          onSelect={handleUncancelSubscription}
                          disabled={isUncancelling}
                          className="text-green-600 hover:text-green-700"
                        >
                          {isUncancelling
                            ? 'Uncancelling...'
                            : 'Uncancel Subscription'}
                        </DropdownMenuItem>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        Reverse the scheduled cancellation on{' '}
                        {cancellationDate}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                )}
                {cancelError && (
                  <DropdownMenuItem
                    disabled
                    className="text-destructive text-xs"
                  >
                    {cancelError}
                  </DropdownMenuItem>
                )}
                {uncancelError && (
                  <DropdownMenuItem
                    disabled
                    className="text-destructive text-xs"
                  >
                    {uncancelError}
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>

      <Dialog
        open={isChangePlanOpen}
        onOpenChange={setIsChangePlanOpen}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Change Your Plan</DialogTitle>
            <DialogDescription>
              Select a new plan to switch to. Upgrades take effect
              immediately with prorated billing. Downgrades take
              effect at the end of your current billing period.
            </DialogDescription>
          </DialogHeader>
          <AdjustSubscriptionGrid
            onSuccess={() => setIsChangePlanOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
