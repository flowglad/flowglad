'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';
import { useBilling } from '@flowglad/nextjs';
import type { Price } from '@flowglad/types';
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
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const billing = useBilling();
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function handleSignOut() {
    await queryClient.clear();
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push('/sign-in');
        },
      },
    });
  }

  async function handleCancelSubscription() {
    // By default, each customer can only have one active subscription at a time,
    // so accessing the first currentSubscriptions is sufficient.
    // Multiple subscriptions per customer can be enabled in dashboard > settings
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
  // By default, each customer can only have one active subscription at a time,
  // so accessing the first currentSubscriptions is sufficient.
  // Multiple subscriptions per customer can be enabled in dashboard > settings
  const currentSubscription = billing.currentSubscriptions?.[0];

  // Check if subscription is a default plan (cannot be cancelled)
  // Default plans have default: true at the product level OR isDefault: true at the price level
  const isDefaultPlan = (() => {
    if (
      !currentSubscription ||
      !billing.loaded ||
      billing.loadBilling !== true ||
      billing.errors !== null ||
      !billing.pricingModel?.products
    )
      return false;

    const priceId = currentSubscription.priceId;

    if (!priceId) return false;

    // Find the product that contains a price matching this subscription
    for (const product of billing.pricingModel.products) {
      const price = product.prices.find((p: Price) => p.id === priceId);
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
    (currentSubscription.status === 'cancellation_scheduled' ||
      (currentSubscription.cancelScheduledAt &&
        !currentSubscription.canceledAt));

  // Format cancellation date for display
  // cancelScheduledAt is in milliseconds (Unix timestamp)
  const cancellationDate =
    currentSubscription && currentSubscription.cancelScheduledAt
      ? new Date(currentSubscription.cancelScheduledAt).toLocaleDateString(
          'en-US',
          {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }
        )
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
          <DropdownMenuItem onSelect={handleSignOut}>Log out</DropdownMenuItem>
          {!isDefaultPlan && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="w-full">
                    <DropdownMenuItem
                      onSelect={handleCancelSubscription}
                      disabled={Boolean(
                        isCancelling || !currentSubscription || isCancelled
                      )}
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
