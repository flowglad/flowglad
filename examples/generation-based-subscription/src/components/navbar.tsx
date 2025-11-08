'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { useBilling } from '@flowglad/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';

export function Navbar() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const billing = useBilling();
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function handleSignOut() {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push('/sign-in');
        },
      },
    });
  }

  async function handleCancelSubscription() {
    const currentSubscription = billing.currentSubscriptions?.[0];
    const subscriptionId = currentSubscription?.id;

    if (!subscriptionId || !billing.cancelSubscription) {
      return;
    }

    // Confirm cancellation
    const confirmed = window.confirm(
      'Are you sure you want to cancel your membership? Your subscription will remain active until the end of the current billing period.'
    );

    if (!confirmed) {
      return;
    }

    setIsCancelling(true);
    setCancelError(null);

    try {
      await billing.cancelSubscription({
        id: subscriptionId,
        cancellation: {
          timing: 'at_end_of_current_billing_period',
        },
      });
      // Reload billing data to reflect changes
      await billing.reload?.();
      // Subscription will be cancelled, user will see pricing page on next render
    } catch (error) {
      setCancelError(
        error instanceof Error
          ? error.message
          : 'Failed to cancel subscription. Please try again.'
      );
    } finally {
      setIsCancelling(false);
    }
  }

  if (!session?.user) {
    return null;
  }

  const accountName = session.user.name || session.user.email || 'Account';
  const currentSubscription = billing.currentSubscriptions?.[0];

  // Check if subscription is a default plan (cannot be cancelled)
  // Default plans have default: true at the product level OR isDefault: true at the price level
  const isDefaultPlan = (() => {
    if (!currentSubscription || !billing.catalog?.products) return false;

    const priceId =
      currentSubscription && 'priceId' in currentSubscription
        ? (currentSubscription as { priceId?: string }).priceId
        : undefined;

    if (!priceId) return false;

    // Find the product that contains a price matching this subscription
    for (const product of billing.catalog.products) {
      const price = product.prices?.find((p) => 'id' in p && p.id === priceId);
      if (price) {
        // Check if the product is default (e.g., Free Plan)
        // Only check product.default, not price.isDefault (which is set for all subscription prices)
        return product.default === true;
      }
    }

    return false;
  })();

  // Check if subscription is scheduled for cancellation
  // Flowglad subscriptions have: status === "cancellation_scheduled" or cancelScheduledAt property
  const isCancelled =
    currentSubscription &&
    (('status' in currentSubscription &&
      (currentSubscription as { status?: string }).status ===
        'cancellation_scheduled') ||
      ('cancelScheduledAt' in currentSubscription &&
        (
          currentSubscription as {
            cancelScheduledAt?: number;
            canceledAt?: number;
          }
        ).cancelScheduledAt &&
        !(
          'canceledAt' in currentSubscription &&
          (currentSubscription as { canceledAt?: number }).canceledAt
        )));

  // Format cancellation date for display
  // cancelScheduledAt is in milliseconds (Unix timestamp)
  const cancellationDate =
    currentSubscription &&
    'cancelScheduledAt' in currentSubscription &&
    (currentSubscription as { cancelScheduledAt?: number }).cancelScheduledAt
      ? new Date(
          (
            currentSubscription as { cancelScheduledAt: number }
          ).cancelScheduledAt
        ).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : null;

  return (
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
          <DropdownMenuItem onClick={handleSignOut}>Log out</DropdownMenuItem>
          {!isDefaultPlan && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="w-full">
                    <DropdownMenuItem
                      onClick={handleCancelSubscription}
                      disabled={
                        isCancelling || !currentSubscription || isCancelled
                      }
                      variant="destructive"
                      className={
                        isCancelled ? 'opacity-60 text-destructive/70' : ''
                      }
                    >
                      {isCancelling ? 'Cancelling...' : 'Cancel Subscription'}
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
              {cancelError && (
                <DropdownMenuItem disabled className="text-destructive text-xs">
                  {cancelError}
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
