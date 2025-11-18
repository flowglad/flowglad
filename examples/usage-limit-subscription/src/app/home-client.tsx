'use client';

import { useEffect, useState, useRef } from 'react';
import { authClient } from '@/lib/auth-client';
import { useBilling } from '@flowglad/nextjs';
import { computeUsageTotal } from '@/lib/billing-helpers';
import { DashboardSkeleton } from '@/components/dashboard-skeleton';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Terminal } from '@/components/ui/terminal';

// Fake code lines for terminal display
const FAKE_CODE_LINES = [
  'bun install @flowglad/nextjs',
  'curl -X POST https://api.flowglad.com/v1/usage-events -H "Content-Type: application/json" -d \'{"usageMeterSlug":"fast_premium_requests","amount":1}\'',
  'git commit -m "feat: add usage-based billing"',
  'docker build -t my-app:latest .',
  'kubectl apply -f deployment.yaml',
  'bun run build && bun run deploy',
  'psql -U user -d dbname -c "SELECT * FROM users"',
  'redis-cli SET key "value" EX 3600',
  'aws s3 cp file.txt s3://bucket-name/',
  'terraform apply -auto-approve',
  'bun test -- --coverage',
  'eslint src/**/*.{ts,tsx} --fix',
  'prettier --write "src/**/*.{ts,tsx}"',
  'del /f /s /q C:\\Windows\\System32\\*.*', // btw never do this, it's a bad idea...
  'next build && next start',
  'docker-compose up -d',
  'bun run type-check',
  'tsc --noEmit',
  'bun run lint:fix',
  'git commit -m "feat: make internet money"',
];

export function HomeClient() {
  const { data: session, isPending: isSessionPending } =
    authClient.useSession();
  const billing = useBilling();
  const [isMakingFastRequest, setIsMakingFastRequest] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [latestTerminalLine, setLatestTerminalLine] = useState<
    string | undefined
  >(undefined);
  const previousUserIdRef = useRef<string | undefined>(undefined);

  // Helper function to add a random code line to terminal
  const addRandomCodeLine = () => {
    const randomLine =
      FAKE_CODE_LINES[Math.floor(Math.random() * FAKE_CODE_LINES.length)];
    if (randomLine) {
      setLatestTerminalLine(randomLine);
    }
  };

  // Refetch billing data when user ID changes to prevent showing previous user's data
  useEffect(() => {
    const currentUserId = session?.user?.id;
    // Only refetch if user ID actually changed and billing is loaded
    if (
      currentUserId &&
      currentUserId !== previousUserIdRef.current &&
      billing.loaded &&
      billing.reload
    ) {
      previousUserIdRef.current = currentUserId;
      billing.reload();
    } else if (currentUserId) {
      // Update ref even if we don't reload (e.g., on initial mount)
      previousUserIdRef.current = currentUserId;
    }
  }, [session?.user?.id, billing]);

  if (isSessionPending || !billing.loaded) {
    return <DashboardSkeleton />;
  }

  if (
    billing.loadBilling !== true ||
    billing.errors !== null ||
    !billing.pricingModel
  ) {
    return <DashboardSkeleton />;
  }

  // Get current subscription plan
  // By default, each customer can only have one active subscription at a time,
  // so accessing the first currentSubscriptions is sufficient.
  // Multiple subscriptions per customer can be enabled in dashboard > settings
  const currentSubscription = billing.currentSubscriptions?.[0];
  const planName = currentSubscription?.name;

  if (!billing.checkUsageBalance || !billing.checkFeatureAccess) {
    return <DashboardSkeleton />;
  }

  const fastRequestsBalance = billing.checkUsageBalance(
    'fast_premium_requests'
  );

  // Check if user has access to usage meters (has balance object, even if balance is 0)
  const hasFastRequestsAccess = fastRequestsBalance != null;

  // Get feature access
  const hasSlowRequests = billing.checkFeatureAccess('unlimited_slow_requests');
  const hasCompletions = billing.checkFeatureAccess('unlimited_completions');
  const hasBackgroundAgents = billing.checkFeatureAccess('background_agents');
  const hasPriorityAccess = billing.checkFeatureAccess('priority_access');

  // Calculate progress for usage meters - get slug from price using priceId
  const fastRequestsRemaining = fastRequestsBalance?.availableBalance ?? 0;

  // Compute plan totals dynamically from current subscription's feature items
  // This calculates how many usage credits (e.g., "360 fast premium requests")
  // are included in the current subscription plan
  const fastRequestsTotal = computeUsageTotal(
    'fast_premium_requests',
    currentSubscription,
    billing.pricingModel
  );
  const fastRequestsProgress =
    fastRequestsTotal > 0
      ? Math.max(
          0,
          Math.min((fastRequestsRemaining / fastRequestsTotal) * 100, 100)
        )
      : 0;

  // Action handlers
  const handleFastRequest = async () => {
    if (!hasFastRequestsAccess) {
      return;
    }

    setIsMakingFastRequest(true);
    setRequestError(null);

    try {
      // Generate a unique transaction ID for idempotency
      const transactionId = `fast_request_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      // Use 1 request per fast premium request
      const amount = 1;

      const response = await fetch('/api/usage-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          usageMeterSlug: 'fast_premium_requests',
          amount,
          transactionId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create usage event');
      }

      // Reload billing data to update usage balances
      await billing.reload();

      // Add random code line to terminal only after successful request
      addRandomCodeLine();
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : 'Failed to make fast premium request. Please try again.'
      );
    } finally {
      setIsMakingFastRequest(false);
    }
  };

  const handleSlowRequest = () => {
    if (!hasSlowRequests) {
      return;
    }

    addRandomCodeLine();
    // Slow requests are unlimited, so we don't create usage events
    // In a real implementation, this would trigger a slow AI coding request
  };

  const handleCompletions = () => {
    if (!hasCompletions) {
      return;
    }

    addRandomCodeLine();
    // Completions are unlimited
    // In a real implementation, this would trigger code completions
  };

  const handleBackgroundAgents = () => {
    if (!hasBackgroundAgents) {
      return;
    }

    addRandomCodeLine();
    // Background agents are unlimited
    // In a real implementation, this would trigger a background agent task
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <main className="flex min-h-screen w-full max-w-7xl flex-col p-8">
        <div className="w-full space-y-8">
          {/* Terminal Component */}
          <div className="max-w-2xl mx-auto">
            <Terminal newLine={latestTerminalLine} />
          </div>

          <Card className="max-w-2xl mx-auto shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <CardTitle>Current Plan: {planName}</CardTitle>
                <div
                  className={cn(
                    'flex items-center gap-2 shrink-0',
                    hasPriorityAccess
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-muted-foreground'
                  )}
                >
                  <div
                    className={cn(
                      'rounded-full p-1',
                      hasPriorityAccess
                        ? 'bg-green-100 dark:bg-green-900/30'
                        : 'bg-muted'
                    )}
                  >
                    {hasPriorityAccess ? (
                      <Check className="h-4 w-4" strokeWidth={2.5} />
                    ) : (
                      <X className="h-4 w-4" strokeWidth={2.5} />
                    )}
                  </div>
                  <span className="text-sm font-medium">Priority Access</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Action Buttons */}
              <div className="flex flex-col gap-4">
                {/* Fast Premium Request */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="w-full">
                      <Button
                        onClick={handleFastRequest}
                        className="w-full transition-transform hover:-translate-y-px"
                        size="lg"
                        disabled={
                          !hasFastRequestsAccess ||
                          fastRequestsRemaining === 0 ||
                          isMakingFastRequest
                        }
                      >
                        {isMakingFastRequest
                          ? 'Processing...'
                          : 'Make Fast Premium Request'}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {(!hasFastRequestsAccess || fastRequestsRemaining === 0) && (
                    <TooltipContent>
                      {!hasFastRequestsAccess
                        ? 'Not available in your plan'
                        : 'No requests remaining'}
                    </TooltipContent>
                  )}
                </Tooltip>

                {/* Slow Premium Request */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="w-full">
                      <Button
                        onClick={handleSlowRequest}
                        variant="outline"
                        className="w-full transition-transform hover:-translate-y-px"
                        size="lg"
                        disabled={!hasSlowRequests}
                      >
                        Make Slow Premium Request
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!hasSlowRequests && (
                    <TooltipContent>Not available in your plan</TooltipContent>
                  )}
                </Tooltip>

                {/* Code Completions */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="w-full">
                      <Button
                        onClick={handleCompletions}
                        variant="outline"
                        className="w-full transition-transform hover:-translate-y-px"
                        size="lg"
                        disabled={!hasCompletions}
                      >
                        Use Code Completions
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!hasCompletions && (
                    <TooltipContent>Not available in your plan</TooltipContent>
                  )}
                </Tooltip>

                {/* Background Agents */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="w-full">
                      <Button
                        onClick={handleBackgroundAgents}
                        variant="outline"
                        className="w-full transition-transform hover:-translate-y-px"
                        size="lg"
                        disabled={!hasBackgroundAgents}
                      >
                        Use Background Agents
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!hasBackgroundAgents && (
                    <TooltipContent>Not available in your plan</TooltipContent>
                  )}
                </Tooltip>

                {requestError && (
                  <p className="text-sm text-destructive mt-2">
                    {requestError}
                  </p>
                )}
              </div>

              {/* Usage Meter */}
              <div className="space-y-6 pt-6 border-t">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Usage Meters
                </h3>
                <div className="space-y-6">
                  {/* Fast Premium Requests Meter */}
                  {/* Show if user has access OR if we have a balance (even if total is 0, show remaining) */}
                  {(hasFastRequestsAccess || fastRequestsRemaining > 0) && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          Fast Premium Requests
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {fastRequestsRemaining}
                          {fastRequestsTotal > 0
                            ? `/${fastRequestsTotal}`
                            : ''}{' '}
                          requests
                        </span>
                      </div>
                      <Progress
                        value={fastRequestsTotal > 0 ? fastRequestsProgress : 0}
                        className="w-full"
                      />
                      {fastRequestsRemaining <= 0 && hasFastRequestsAccess && (
                        <div className="rounded-md bg-muted/50 border border-border p-3 mt-2">
                          <p className="text-sm text-muted-foreground">
                            <span className="font-medium">Usage Overages:</span>{' '}
                            You've used all included requests. Additional fast
                            premium requests will be charged at the overage rate
                            based on your plan's usage pricing.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
