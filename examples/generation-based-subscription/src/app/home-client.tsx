'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
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

// Mock images to cycle through
const mockImages = [
  '/images/flowglad.png',
  '/images/unsplash-1.jpg',
  '/images/unsplash-2.jpg',
  '/images/unsplash-3.jpg',
  '/images/unsplash-4.jpg',
  '/images/unsplash-5.jpg',
];

// Mock GIFs for video generation
const mockVideoGif = [
  'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExd252Y2NwNG5vdmQxMXl6cWxsMWNpYzV0ZnU3a3UwbGhtcHFkZTNoMCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/a6OnFHzHgCU1O/giphy.gif',
  'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNnNyOXhnNXp3cTJnaWw1OGZodXducHlzeThvbTBwdDc4cGw5OWFuZyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/WI4A2fVnRBiYE/giphy.gif',
  'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3OWN6emx1M2JpM3lkczB4Y2Y2M3U5ejgyNzNmbnJnM2ZqMDlvb3B4ciZlcD12MV9naWZzX3RyZW5kaW5nJmN0PWc/pa37AAGzKXoek/giphy.gif',
];

export function HomeClient() {
  const router = useRouter();
  const { data: session, isPending: isSessionPending } =
    authClient.useSession();
  const billing = useBilling();
  const [isGeneratingFastImage, setIsGeneratingFastImage] = useState(false);
  const [isGeneratingHDVideo, setIsGeneratingHDVideo] = useState(false);
  const [isGeneratingRelaxImage, setIsGeneratingRelaxImage] = useState(false);
  const [isGeneratingRelaxSDVideo, setIsGeneratingRelaxSDVideo] =
    useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [hdVideoError, setHdVideoError] = useState<string | null>(null);
  const [topUpError, setTopUpError] = useState<string | null>(null);
  const [displayedContent, setDisplayedContent] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [currentVideoGifIndex, setCurrentVideoGifIndex] = useState(0);
  const previousUserIdRef = useRef<string | undefined>(undefined);

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

  // Check if user is on free plan and redirect to pricing page
  useEffect(() => {
    if (isSessionPending || !billing.loaded) {
      return;
    }

    // Check if user has at least one non-free plan subscription
    // isFreePlan is true when the subscription's price has unitPrice === 0
    const hasNonFreePlan =
      billing.currentSubscriptions &&
      billing.currentSubscriptions.length > 0 &&
      billing.currentSubscriptions.some((sub) => !sub.isFreePlan);

    // If user is on free plan (no non-free plan found), redirect to pricing
    if (!hasNonFreePlan) {
      router.push('/pricing');
    }
  }, [isSessionPending, billing.loaded, billing.currentSubscriptions, router]);

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
  const planName = currentSubscription?.name || 'Unknown Plan';

  if (!billing.checkUsageBalance || !billing.checkFeatureAccess) {
    return <DashboardSkeleton />;
  }

  const fastGenerationsBalance = billing.checkUsageBalance('fast_generations');
  const hdVideoMinutesBalance = billing.checkUsageBalance('hd_video_minutes');

  // Check if user has access to usage meters (has balance object, even if balance is 0)
  const hasFastGenerationsAccess = fastGenerationsBalance != null;
  const hasHDVideoMinutesAccess = hdVideoMinutesBalance != null;

  // Get feature access
  const hasRelaxMode = !!billing.checkFeatureAccess('unlimited_relaxed_images');
  const hasUnlimitedRelaxedSDVideo = !!billing.checkFeatureAccess(
    'unlimited_relaxed_sd_video'
  );
  const hasOptionalTopUps = !!billing.checkFeatureAccess(
    'optional_credit_top_ups'
  );

  // Calculate progress for usage meters - get slug from price using priceId
  const fastGenerationsRemaining =
    fastGenerationsBalance?.availableBalance ?? 0;

  // Compute plan totals dynamically from current subscription's feature items
  // This calculates how many usage credits (e.g., "360 fast generations")
  // are included in the current subscription plan
  const fastGenerationsTotal = computeUsageTotal(
    'fast_generations',
    currentSubscription,
    billing.pricingModel
  );
  const fastGenerationsProgress =
    fastGenerationsTotal > 0
      ? Math.min((fastGenerationsRemaining / fastGenerationsTotal) * 100, 100)
      : 0;

  const hdVideoMinutesRemaining = hdVideoMinutesBalance?.availableBalance ?? 0;
  const hdVideoMinutesTotal = computeUsageTotal(
    'hd_video_minutes',
    currentSubscription,
    billing.pricingModel
  );
  const hdVideoMinutesProgress =
    hdVideoMinutesTotal > 0
      ? Math.min((hdVideoMinutesRemaining / hdVideoMinutesTotal) * 100, 100)
      : 0;

  // Action handlers
  const handleGenerateFastImage = async () => {
    if (!hasFastGenerationsAccess || fastGenerationsRemaining === 0) {
      return;
    }

    setIsGeneratingFastImage(true);
    setGenerateError(null);

    try {
      // Generate a unique transaction ID for idempotency
      const transactionId = `fast_image_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      // Random amount between 3-5
      const amount = Math.floor(Math.random() * 3) + 3;

      const response = await fetch('/api/usage-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          usageMeterSlug: 'fast_generations',
          amount,
          transactionId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create usage event');
      }

      // Cycle through mock images
      const nextIndex = (currentImageIndex + 1) % mockImages.length;
      setCurrentImageIndex(nextIndex);
      const nextImage = mockImages[nextIndex];
      if (nextImage) {
        setDisplayedContent(nextImage);
      }

      // Reload billing data to update usage balances
      await billing.reload();
    } catch (error) {
      setGenerateError(
        error instanceof Error
          ? error.message
          : 'Failed to generate image. Please try again.'
      );
    } finally {
      setIsGeneratingFastImage(false);
    }
  };

  const handleGenerateHDVideo = async () => {
    if (!hasHDVideoMinutesAccess || hdVideoMinutesRemaining === 0) {
      return;
    }

    setIsGeneratingHDVideo(true);
    setHdVideoError(null);

    try {
      // Generate a unique transaction ID for idempotency
      const transactionId = `hd_video_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      // Random amount between 1-3 minutes
      const amount = Math.floor(Math.random() * 3) + 1;

      const response = await fetch('/api/usage-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          usageMeterSlug: 'hd_video_minutes',
          amount,
          transactionId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create usage event');
      }

      // Cycle through mock video GIFs
      const nextIndex = (currentVideoGifIndex + 1) % mockVideoGif.length;
      setCurrentVideoGifIndex(nextIndex);
      const nextGif = mockVideoGif[nextIndex];
      if (nextGif) {
        setDisplayedContent(nextGif);
      }

      // Reload billing data to update usage balances
      await billing.reload();
    } catch (error) {
      setHdVideoError(
        error instanceof Error
          ? error.message
          : 'Failed to generate HD video. Please try again.'
      );
    } finally {
      setIsGeneratingHDVideo(false);
    }
  };

  const handleGenerateRelaxImage = async () => {
    if (!hasRelaxMode) {
      return;
    }

    setIsGeneratingRelaxImage(true);

    try {
      // Cycle through mock images for relax mode
      const nextIndex = (currentImageIndex + 1) % mockImages.length;
      setCurrentImageIndex(nextIndex);
      const nextImage = mockImages[nextIndex];
      if (nextImage) {
        setDisplayedContent(nextImage);
      }
    } finally {
      setIsGeneratingRelaxImage(false);
    }
  };

  const handleGenerateRelaxSDVideo = async () => {
    if (!hasUnlimitedRelaxedSDVideo) {
      return;
    }

    setIsGeneratingRelaxSDVideo(true);

    try {
      // Cycle through mock video GIFs
      const nextIndex = (currentVideoGifIndex + 1) % mockVideoGif.length;
      setCurrentVideoGifIndex(nextIndex);
      const nextGif = mockVideoGif[nextIndex];
      if (nextGif) {
        setDisplayedContent(nextGif);
      }
    } finally {
      setIsGeneratingRelaxSDVideo(false);
    }
  };

  const handlePurchaseFastGenerationTopUp = async () => {
    if (!billing.createCheckoutSession || !billing.getPrice) {
      return;
    }

    setTopUpError(null);

    const price = billing.getPrice('fast_generation_top_up');
    if (!price) {
      setTopUpError('Price not found. Please contact support.');
      return;
    }

    try {
      await billing.createCheckoutSession({
        priceId: price.id,
        successUrl: window.location.href,
        cancelUrl: window.location.href,
        quantity: 1,
        autoRedirect: true,
      });
    } catch (error) {
      setTopUpError(
        error instanceof Error
          ? error.message
          : 'Failed to start checkout. Please try again.'
      );
    }
  };

  const handlePurchaseHDVideoTopUp = async () => {
    if (!billing.createCheckoutSession || !billing.getPrice) {
      return;
    }

    setTopUpError(null);

    const price = billing.getPrice('hd_video_minute_top_up');
    if (!price) {
      setTopUpError('Price not found. Please contact support.');
      return;
    }

    try {
      await billing.createCheckoutSession({
        priceId: price.id,
        successUrl: window.location.href,
        cancelUrl: window.location.href,
        quantity: 1,
        autoRedirect: true,
      });
    } catch (error) {
      setTopUpError(
        error instanceof Error
          ? error.message
          : 'Failed to start checkout. Please try again.'
      );
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <main className="flex min-h-screen w-full max-w-7xl flex-col p-8">
        <div className="w-full space-y-8">
          {/* Image Display Area with Action Buttons */}
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle>Current Plan: {planName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Image Display Area - Standardized 16:9 aspect ratio */}
              <div className="relative w-full aspect-video bg-muted rounded-lg border-2 border-dashed overflow-hidden">
                {/* Loading spinner overlay */}
                {isGeneratingFastImage ||
                isGeneratingHDVideo ||
                isGeneratingRelaxImage ||
                isGeneratingRelaxSDVideo ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-muted/80 z-10">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm text-muted-foreground">
                        Generating...
                      </p>
                    </div>
                  </div>
                ) : null}
                {displayedContent ? (
                  <Image
                    src={displayedContent}
                    alt="Generated content"
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground">
                      Generate an image or video to see it here!
                    </p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-6">
                {/* Primary Generation Actions */}
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">
                    Primary Generation
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Generate Fast Image */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="w-full">
                          <Button
                            onClick={handleGenerateFastImage}
                            className="w-full transition-transform hover:-translate-y-px"
                            size="lg"
                            disabled={
                              !hasFastGenerationsAccess ||
                              fastGenerationsRemaining === 0 ||
                              isGeneratingFastImage
                            }
                          >
                            {isGeneratingFastImage
                              ? 'Generating...'
                              : 'Generate Fast Image'}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {(!hasFastGenerationsAccess ||
                        fastGenerationsRemaining === 0) && (
                        <TooltipContent>
                          {!hasFastGenerationsAccess
                            ? 'Not available in your plan'
                            : 'No credits remaining'}
                        </TooltipContent>
                      )}
                    </Tooltip>
                    {generateError && (
                      <p className="text-sm text-destructive mt-2">
                        {generateError}
                      </p>
                    )}

                    {/* Generate HD Video */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="w-full">
                          <Button
                            onClick={handleGenerateHDVideo}
                            className="w-full transition-transform hover:-translate-y-px"
                            size="lg"
                            disabled={
                              !hasHDVideoMinutesAccess ||
                              hdVideoMinutesRemaining === 0 ||
                              isGeneratingHDVideo
                            }
                          >
                            {isGeneratingHDVideo
                              ? 'Generating...'
                              : 'Generate HD Video'}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {(!hasHDVideoMinutesAccess ||
                        hdVideoMinutesRemaining === 0) && (
                        <TooltipContent>
                          {!hasHDVideoMinutesAccess
                            ? 'Not available in your plan'
                            : 'No credits remaining'}
                        </TooltipContent>
                      )}
                    </Tooltip>
                    {hdVideoError && (
                      <p className="text-sm text-destructive mt-2">
                        {hdVideoError}
                      </p>
                    )}
                  </div>
                </div>

                {/* Relax Mode Actions */}
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">
                    Relax Mode (Unlimited)
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Generate Relax Mode Image */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="w-full">
                          <Button
                            onClick={handleGenerateRelaxImage}
                            variant="outline"
                            className="w-full transition-transform hover:-translate-y-px"
                            disabled={!hasRelaxMode || isGeneratingRelaxImage}
                          >
                            {isGeneratingRelaxImage
                              ? 'Generating...'
                              : 'Generate Relax Image'}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {!hasRelaxMode && (
                        <TooltipContent>
                          Not available in your plan
                        </TooltipContent>
                      )}
                    </Tooltip>

                    {/* Generate Relax Mode SD Video */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="w-full">
                          <Button
                            onClick={handleGenerateRelaxSDVideo}
                            variant="outline"
                            className="w-full transition-transform hover:-translate-y-px"
                            disabled={
                              !hasUnlimitedRelaxedSDVideo ||
                              isGeneratingRelaxSDVideo
                            }
                          >
                            {isGeneratingRelaxSDVideo
                              ? 'Generating...'
                              : 'Generate Relax SD Video'}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {!hasUnlimitedRelaxedSDVideo && (
                        <TooltipContent>
                          Not available in your plan
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </div>
                </div>

                {/* Credit Top-Ups */}
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">
                    Purchase Additional Credits
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Fast Generation Top-Up */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="w-full">
                          <Button
                            onClick={handlePurchaseFastGenerationTopUp}
                            variant="secondary"
                            className="w-full transition-transform hover:-translate-y-px"
                            disabled={!hasOptionalTopUps}
                          >
                            Buy Fast Generations ($4.00 for 80)
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {!hasOptionalTopUps && (
                        <TooltipContent>
                          Not available in your plan
                        </TooltipContent>
                      )}
                    </Tooltip>

                    {/* HD Video Minute Top-Up */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="w-full">
                          <Button
                            onClick={handlePurchaseHDVideoTopUp}
                            variant="secondary"
                            className="w-full transition-transform hover:-translate-y-px"
                            disabled={!hasOptionalTopUps}
                          >
                            Buy HD Video Minutes ($10.00 for 10 min)
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {!hasOptionalTopUps && (
                        <TooltipContent>
                          Not available in your plan
                        </TooltipContent>
                      )}
                    </Tooltip>
                    {topUpError && (
                      <p className="text-sm text-destructive mt-2">
                        {topUpError}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Usage Meters */}
              <div className="space-y-6 pt-6 border-t">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Usage Meters
                </h3>
                <div className="space-y-6">
                  {/* Fast Generations Meter */}
                  {/* Show if user has access OR if we have a balance (even if total is 0, show remaining) */}
                  {(hasFastGenerationsAccess ||
                    fastGenerationsRemaining > 0) && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          Fast Generations
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {fastGenerationsRemaining}
                          {fastGenerationsTotal > 0
                            ? `/${fastGenerationsTotal}`
                            : ''}{' '}
                          credits
                        </span>
                      </div>
                      <Progress
                        value={
                          fastGenerationsTotal > 0 ? fastGenerationsProgress : 0
                        }
                        className="w-full"
                      />
                    </div>
                  )}

                  {/* HD Video Minutes Meter */}
                  {/* Show if user has access OR if we have a balance (even if total is 0, show remaining) */}
                  {(hasHDVideoMinutesAccess || hdVideoMinutesRemaining > 0) && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          HD Video Minutes
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {hdVideoMinutesRemaining}
                          {hdVideoMinutesTotal > 0
                            ? `/${hdVideoMinutesTotal}`
                            : ''}{' '}
                          minutes
                        </span>
                      </div>
                      <Progress
                        value={
                          hdVideoMinutesTotal > 0 ? hdVideoMinutesProgress : 0
                        }
                        className="w-full"
                      />
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
