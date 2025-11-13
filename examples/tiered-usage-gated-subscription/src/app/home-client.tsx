'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
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

export function HomeClient() {
  const router = useRouter();
  const { data: session, isPending: isSessionPending } =
    authClient.useSession();
  const billing = useBilling();
  const [isSendingGPT5Thinking, setIsSendingGPT5Thinking] = useState(false);
  const [isSendingO3, setIsSendingO3] = useState(false);
  const [isSendingO4Mini, setIsSendingO4Mini] = useState(false);
  const [isSendingO4MiniHigh, setIsSendingO4MiniHigh] = useState(false);
  const [isUsingAgentMode, setIsUsingAgentMode] = useState(false);
  const [isUsingDeepResearch, setIsUsingDeepResearch] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<
    Array<{ role: string; content: string; model?: string }>
  >([]);
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
      Array.isArray(billing.currentSubscriptions) &&
      billing.currentSubscriptions.length > 0 &&
      billing.currentSubscriptions.some((sub) => {
        return 'isFreePlan' in sub && sub.isFreePlan !== true;
      });

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
    !('pricingModel' in billing) ||
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

  // Usage meter balances
  const gpt5ThinkingBalance = billing.checkUsageBalance(
    'gpt_5_thinking_messages'
  );
  const o3Balance = billing.checkUsageBalance('o3_messages');
  const o4MiniBalance = billing.checkUsageBalance('o4_mini_messages');
  const o4MiniHighBalance = billing.checkUsageBalance('o4_mini_high_messages');
  const agentMessagesBalance = billing.checkUsageBalance('agent_messages');
  const deepResearchBalance = billing.checkUsageBalance(
    'deep_research_requests'
  );

  // Check if user has access to usage meters
  // Having a usage meter balance (even if 0) means you have access to that meter
  const hasGPT5ThinkingAccess = gpt5ThinkingBalance != null;
  const hasO3Access = o3Balance != null;
  const hasO4MiniAccess = o4MiniBalance != null;
  const hasO4MiniHighAccess = o4MiniHighBalance != null;
  const hasAgentModeAccess = agentMessagesBalance != null;
  const hasDeepResearchAccess = deepResearchBalance != null;

  // Check toggle features for model access
  // If toggle exists without usage meter = unlimited access
  // If toggle exists with usage meter = limited access (check credits)
  const hasGPT5Fast = !!billing.checkFeatureAccess('gpt_5_fast');
  const hasGPT5Thinking = !!billing.checkFeatureAccess('gpt_5_thinking');
  const hasO3AccessFeature = !!billing.checkFeatureAccess('o3_access');
  const hasO4MiniAccessFeature = !!billing.checkFeatureAccess('o4_mini_access');
  const hasO4MiniHighAccessFeature = !!billing.checkFeatureAccess(
    'o4_mini_high_access'
  );
  const hasAgentMode = !!billing.checkFeatureAccess('agent_mode');
  const hasDeepResearch = !!billing.checkFeatureAccess('deep_research');

  // Determine if models are unlimited (toggle exists but no usage meter) or limited (has usage meter)
  const isGPT5ThinkingUnlimited = hasGPT5Thinking && !hasGPT5ThinkingAccess;
  const isO3Unlimited = hasO3AccessFeature && !hasO3Access;
  const isO4MiniUnlimited = hasO4MiniAccessFeature && !hasO4MiniAccess;
  const isO4MiniHighUnlimited =
    hasO4MiniHighAccessFeature && !hasO4MiniHighAccess;
  const isAgentModeUnlimited = hasAgentMode && !hasAgentModeAccess;
  const isDeepResearchUnlimited = hasDeepResearch && !hasDeepResearchAccess;

  // Calculate usage meter balances and totals
  const gpt5ThinkingRemaining = gpt5ThinkingBalance?.availableBalance ?? 0;
  const gpt5ThinkingTotal = computeUsageTotal(
    'gpt_5_thinking_messages',
    currentSubscription,
    billing.pricingModel
  );
  const gpt5ThinkingProgress =
    gpt5ThinkingTotal > 0
      ? (gpt5ThinkingRemaining / gpt5ThinkingTotal) * 100
      : 0;

  const o3Remaining = o3Balance?.availableBalance ?? 0;
  const o3Total = computeUsageTotal(
    'o3_messages',
    currentSubscription,
    billing.pricingModel
  );
  const o3Progress = o3Total > 0 ? (o3Remaining / o3Total) * 100 : 0;

  const o4MiniRemaining = o4MiniBalance?.availableBalance ?? 0;
  const o4MiniTotal = computeUsageTotal(
    'o4_mini_messages',
    currentSubscription,
    billing.pricingModel
  );
  const o4MiniProgress =
    o4MiniTotal > 0 ? (o4MiniRemaining / o4MiniTotal) * 100 : 0;

  const o4MiniHighRemaining = o4MiniHighBalance?.availableBalance ?? 0;
  const o4MiniHighTotal = computeUsageTotal(
    'o4_mini_high_messages',
    currentSubscription,
    billing.pricingModel
  );
  const o4MiniHighProgress =
    o4MiniHighTotal > 0 ? (o4MiniHighRemaining / o4MiniHighTotal) * 100 : 0;

  const agentMessagesRemaining = agentMessagesBalance?.availableBalance ?? 0;
  const agentMessagesTotal = computeUsageTotal(
    'agent_messages',
    currentSubscription,
    billing.pricingModel
  );
  const agentMessagesProgress =
    agentMessagesTotal > 0
      ? (agentMessagesRemaining / agentMessagesTotal) * 100
      : 0;

  const deepResearchRemaining = deepResearchBalance?.availableBalance ?? 0;
  const deepResearchTotal = computeUsageTotal(
    'deep_research_requests',
    currentSubscription,
    billing.pricingModel
  );
  const deepResearchProgress =
    deepResearchTotal > 0
      ? (deepResearchRemaining / deepResearchTotal) * 100
      : 0;

  // Action handlers for sending messages to different models
  const handleSendGPT5Thinking = async () => {
    // Unlimited: just need toggle feature
    // Limited: need toggle feature AND usage meter access AND credits remaining
    if (!hasGPT5Thinking) return;
    if (
      !isGPT5ThinkingUnlimited &&
      (!hasGPT5ThinkingAccess || gpt5ThinkingRemaining === 0)
    ) {
      return;
    }

    setIsSendingGPT5Thinking(true);
    setMessageError(null);

    try {
      const transactionId = `gpt5_thinking_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const amount = 1;

      const response = await fetch('/api/usage-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceSlug: 'gpt5_tracking',
          usageMeterSlug: 'gpt_5_thinking_messages',
          amount,
          transactionId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create usage event');
      }

      // Add mock message to chat
      setChatMessages((prev) => [
        ...prev,
        { role: 'user', content: 'Hello, GPT-5 Thinking!' },
        {
          role: 'assistant',
          content:
            "Hello! I'm GPT-5 Thinking, ready to help with complex reasoning tasks.",
          model: 'GPT-5 Thinking',
        },
      ]);

      await billing.reload();
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : 'Failed to send message. Please try again.'
      );
    } finally {
      setIsSendingGPT5Thinking(false);
    }
  };

  const handleSendO3 = async () => {
    if (!hasO3AccessFeature) return;
    if (!isO3Unlimited && (!hasO3Access || o3Remaining === 0)) {
      return;
    }

    setIsSendingO3(true);
    setMessageError(null);

    try {
      // Only create usage event if model is limited (has usage meter)
      if (!isO3Unlimited) {
        const transactionId = `o3_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const amount = 1;

        const response = await fetch('/api/usage-events', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            priceSlug: 'o3_tracking',
            usageMeterSlug: 'o3_messages',
            amount,
            transactionId,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create usage event');
        }

        await billing.reload();
      }

      setChatMessages((prev) => [
        ...prev,
        { role: 'user', content: 'Hello, o3!' },
        {
          role: 'assistant',
          content:
            "Hello! I'm o3, a reasoning model designed for complex problem-solving.",
          model: 'o3',
        },
      ]);
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : 'Failed to send message. Please try again.'
      );
    } finally {
      setIsSendingO3(false);
    }
  };

  const handleSendO4Mini = async () => {
    if (!hasO4MiniAccessFeature) return;
    if (!isO4MiniUnlimited && (!hasO4MiniAccess || o4MiniRemaining === 0)) {
      return;
    }

    setIsSendingO4Mini(true);
    setMessageError(null);

    try {
      // Only create usage event if model is limited (has usage meter)
      if (!isO4MiniUnlimited) {
        const transactionId = `o4_mini_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const amount = 1;

        const response = await fetch('/api/usage-events', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            priceSlug: 'o4_mini_tracking',
            usageMeterSlug: 'o4_mini_messages',
            amount,
            transactionId,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create usage event');
        }

        await billing.reload();
      }

      setChatMessages((prev) => [
        ...prev,
        { role: 'user', content: 'Hello, o4-mini!' },
        {
          role: 'assistant',
          content: "Hello! I'm o4-mini, a fast reasoning model.",
          model: 'o4-mini',
        },
      ]);
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : 'Failed to send message. Please try again.'
      );
    } finally {
      setIsSendingO4Mini(false);
    }
  };

  const handleSendO4MiniHigh = async () => {
    if (!hasO4MiniHighAccessFeature) return;
    if (
      !isO4MiniHighUnlimited &&
      (!hasO4MiniHighAccess || o4MiniHighRemaining === 0)
    ) {
      return;
    }

    setIsSendingO4MiniHigh(true);
    setMessageError(null);

    try {
      // Only create usage event if model is limited (has usage meter)
      if (!isO4MiniHighUnlimited) {
        const transactionId = `o4_mini_high_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const amount = 1;

        const response = await fetch('/api/usage-events', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            priceSlug: 'o4_mini_high_tracking',
            usageMeterSlug: 'o4_mini_high_messages',
            amount,
            transactionId,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create usage event');
        }

        await billing.reload();
      }

      setChatMessages((prev) => [
        ...prev,
        { role: 'user', content: 'Hello, o4-mini-high!' },
        {
          role: 'assistant',
          content: "Hello! I'm o4-mini-high, an advanced reasoning model.",
          model: 'o4-mini-high',
        },
      ]);
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : 'Failed to send message. Please try again.'
      );
    } finally {
      setIsSendingO4MiniHigh(false);
    }
  };

  const handleUseAgentMode = async () => {
    if (!hasAgentMode) return;
    if (
      !isAgentModeUnlimited &&
      (!hasAgentModeAccess || agentMessagesRemaining === 0)
    ) {
      return;
    }

    setIsUsingAgentMode(true);
    setMessageError(null);

    try {
      const transactionId = `agent_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const amount = 1;

      const response = await fetch('/api/usage-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceSlug: 'agent_tracking',
          usageMeterSlug: 'agent_messages',
          amount,
          transactionId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create usage event');
      }

      setChatMessages((prev) => [
        ...prev,
        { role: 'user', content: 'Start agent mode task' },
        {
          role: 'assistant',
          content:
            "Agent mode activated! I'll work on this complex task step by step.",
          model: 'Agent Mode',
        },
      ]);

      await billing.reload();
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : 'Failed to start agent mode. Please try again.'
      );
    } finally {
      setIsUsingAgentMode(false);
    }
  };

  const handleUseDeepResearch = async () => {
    if (!hasDeepResearch) return;
    if (
      !isDeepResearchUnlimited &&
      (!hasDeepResearchAccess || deepResearchRemaining === 0)
    ) {
      return;
    }

    setIsUsingDeepResearch(true);
    setMessageError(null);

    try {
      const transactionId = `deep_research_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const amount = 1;

      const response = await fetch('/api/usage-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceSlug: 'deep_research_tracking',
          usageMeterSlug: 'deep_research_requests',
          amount,
          transactionId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create usage event');
      }

      setChatMessages((prev) => [
        ...prev,
        { role: 'user', content: 'Start deep research' },
        {
          role: 'assistant',
          content:
            'Deep research initiated! Gathering comprehensive information from multiple sources...',
          model: 'Deep Research',
        },
      ]);

      await billing.reload();
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : 'Failed to start deep research. Please try again.'
      );
    } finally {
      setIsUsingDeepResearch(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <main className="flex min-h-screen w-full max-w-7xl flex-col p-8">
        <div className="w-full space-y-8">
          {/* Chat Interface with Action Buttons */}
          <Card className="max-w-4xl mx-auto">
            <CardHeader>
              <CardTitle>Current Plan: {planName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Chat Display Area */}
              <div className="relative w-full h-96 bg-muted rounded-lg border-2 border-dashed overflow-y-auto p-4">
                {isSendingGPT5Thinking ||
                isSendingO3 ||
                isSendingO4Mini ||
                isSendingO4MiniHigh ||
                isUsingAgentMode ||
                isUsingDeepResearch ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-muted/80 z-10">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm text-muted-foreground">
                        Processing...
                      </p>
                    </div>
                  </div>
                ) : null}
                {chatMessages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground">
                      Send a message to one of the AI models to start chatting!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {chatMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex ${
                          msg.role === 'user' ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg p-3 ${
                            msg.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          }`}
                        >
                          {msg.model && (
                            <p className="text-xs opacity-70 mb-1">
                              {msg.model}
                            </p>
                          )}
                          <p className="text-sm">{msg.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-6">
                {/* AI Model Actions */}
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">
                    AI Models
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* GPT-5 Thinking */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="w-full">
                          <Button
                            onClick={handleSendGPT5Thinking}
                            className="w-full transition-transform hover:-translate-y-px"
                            size="lg"
                            disabled={
                              !hasGPT5Thinking ||
                              (!isGPT5ThinkingUnlimited &&
                                (!hasGPT5ThinkingAccess ||
                                  gpt5ThinkingRemaining === 0)) ||
                              isSendingGPT5Thinking
                            }
                          >
                            {isSendingGPT5Thinking
                              ? 'Sending...'
                              : 'GPT-5 Thinking'}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {(!hasGPT5Thinking ||
                        (!isGPT5ThinkingUnlimited &&
                          (!hasGPT5ThinkingAccess ||
                            gpt5ThinkingRemaining === 0))) && (
                        <TooltipContent>
                          {!hasGPT5Thinking
                            ? 'Not available in your plan'
                            : !hasGPT5ThinkingAccess
                              ? 'No access'
                              : 'No credits remaining'}
                        </TooltipContent>
                      )}
                    </Tooltip>

                    {/* o3 */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="w-full">
                          <Button
                            onClick={handleSendO3}
                            className="w-full transition-transform hover:-translate-y-px"
                            size="lg"
                            disabled={
                              !hasO3AccessFeature ||
                              (!isO3Unlimited &&
                                (!hasO3Access || o3Remaining === 0)) ||
                              isSendingO3
                            }
                          >
                            {isSendingO3 ? 'Sending...' : 'o3 Model'}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {(!hasO3AccessFeature ||
                        (!isO3Unlimited &&
                          (!hasO3Access || o3Remaining === 0))) && (
                        <TooltipContent>
                          {!hasO3AccessFeature
                            ? 'Not available in your plan'
                            : !hasO3Access
                              ? 'No access'
                              : 'No credits remaining'}
                        </TooltipContent>
                      )}
                    </Tooltip>

                    {/* o4-mini */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="w-full">
                          <Button
                            onClick={handleSendO4Mini}
                            className="w-full transition-transform hover:-translate-y-px"
                            size="lg"
                            disabled={
                              !hasO4MiniAccessFeature ||
                              (!isO4MiniUnlimited &&
                                (!hasO4MiniAccess || o4MiniRemaining === 0)) ||
                              isSendingO4Mini
                            }
                          >
                            {isSendingO4Mini ? 'Sending...' : 'o4-mini'}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {(!hasO4MiniAccessFeature ||
                        (!isO4MiniUnlimited &&
                          (!hasO4MiniAccess || o4MiniRemaining === 0))) && (
                        <TooltipContent>
                          {!hasO4MiniAccessFeature
                            ? 'Not available in your plan'
                            : !hasO4MiniAccess
                              ? 'No access'
                              : 'No credits remaining'}
                        </TooltipContent>
                      )}
                    </Tooltip>

                    {/* o4-mini-high */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="w-full">
                          <Button
                            onClick={handleSendO4MiniHigh}
                            className="w-full transition-transform hover:-translate-y-px"
                            size="lg"
                            disabled={
                              !hasO4MiniHighAccessFeature ||
                              (!isO4MiniHighUnlimited &&
                                (!hasO4MiniHighAccess ||
                                  o4MiniHighRemaining === 0)) ||
                              isSendingO4MiniHigh
                            }
                          >
                            {isSendingO4MiniHigh
                              ? 'Sending...'
                              : 'o4-mini-high'}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {(!hasO4MiniHighAccessFeature ||
                        (!isO4MiniHighUnlimited &&
                          (!hasO4MiniHighAccess ||
                            o4MiniHighRemaining === 0))) && (
                        <TooltipContent>
                          {!hasO4MiniHighAccessFeature
                            ? 'Not available in your plan'
                            : !hasO4MiniHighAccess
                              ? 'No access'
                              : 'No credits remaining'}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </div>
                </div>

                {/* Advanced Features */}
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">
                    Advanced Features
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Agent Mode */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="w-full">
                          <Button
                            onClick={handleUseAgentMode}
                            variant="outline"
                            className="w-full transition-transform hover:-translate-y-px"
                            disabled={
                              !hasAgentMode ||
                              (!isAgentModeUnlimited &&
                                (!hasAgentModeAccess ||
                                  agentMessagesRemaining === 0)) ||
                              isUsingAgentMode
                            }
                          >
                            {isUsingAgentMode ? 'Activating...' : 'Agent Mode'}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {(!hasAgentMode ||
                        (!isAgentModeUnlimited &&
                          (!hasAgentModeAccess ||
                            agentMessagesRemaining === 0))) && (
                        <TooltipContent>
                          {!hasAgentMode
                            ? 'Not available in your plan'
                            : !hasAgentModeAccess
                              ? 'No access'
                              : 'No credits remaining'}
                        </TooltipContent>
                      )}
                    </Tooltip>

                    {/* Deep Research */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="w-full">
                          <Button
                            onClick={handleUseDeepResearch}
                            variant="outline"
                            className="w-full transition-transform hover:-translate-y-px"
                            disabled={
                              !hasDeepResearch ||
                              (!isDeepResearchUnlimited &&
                                (!hasDeepResearchAccess ||
                                  deepResearchRemaining === 0)) ||
                              isUsingDeepResearch
                            }
                          >
                            {isUsingDeepResearch
                              ? 'Researching...'
                              : 'Deep Research'}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {(!hasDeepResearch ||
                        (!isDeepResearchUnlimited &&
                          (!hasDeepResearchAccess ||
                            deepResearchRemaining === 0))) && (
                        <TooltipContent>
                          {!hasDeepResearch
                            ? 'Not available in your plan'
                            : !hasDeepResearchAccess
                              ? 'No access'
                              : 'No credits remaining'}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </div>
                </div>
                {messageError && (
                  <p className="text-sm text-destructive mt-2">
                    {messageError}
                  </p>
                )}
              </div>

              {/* Usage Meters */}
              <div className="space-y-6 pt-6 border-t">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Usage Meters
                </h3>
                <div className="space-y-4">
                  {/* GPT-5 Thinking Messages */}
                  {(hasGPT5ThinkingAccess || gpt5ThinkingRemaining > 0) && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          GPT-5 Thinking Messages
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {gpt5ThinkingRemaining}
                          {gpt5ThinkingTotal > 0
                            ? `/${gpt5ThinkingTotal}`
                            : ''}{' '}
                          messages
                        </span>
                      </div>
                      <Progress
                        value={gpt5ThinkingTotal > 0 ? gpt5ThinkingProgress : 0}
                        className="w-full"
                      />
                    </div>
                  )}

                  {/* o3 Messages */}
                  {(hasO3Access || o3Remaining > 0) && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">o3 Messages</span>
                        <span className="text-sm text-muted-foreground">
                          {o3Remaining}
                          {o3Total > 0 ? `/${o3Total}` : ''} messages
                        </span>
                      </div>
                      <Progress
                        value={o3Total > 0 ? o3Progress : 0}
                        className="w-full"
                      />
                    </div>
                  )}

                  {/* o4-mini Messages */}
                  {(hasO4MiniAccess || o4MiniRemaining > 0) && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          o4-mini Messages
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {o4MiniRemaining}
                          {o4MiniTotal > 0 ? `/${o4MiniTotal}` : ''} messages
                        </span>
                      </div>
                      <Progress
                        value={o4MiniTotal > 0 ? o4MiniProgress : 0}
                        className="w-full"
                      />
                    </div>
                  )}

                  {/* o4-mini-high Messages */}
                  {(hasO4MiniHighAccess || o4MiniHighRemaining > 0) && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          o4-mini-high Messages
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {o4MiniHighRemaining}
                          {o4MiniHighTotal > 0
                            ? `/${o4MiniHighTotal}`
                            : ''}{' '}
                          messages
                        </span>
                      </div>
                      <Progress
                        value={o4MiniHighTotal > 0 ? o4MiniHighProgress : 0}
                        className="w-full"
                      />
                    </div>
                  )}

                  {/* Agent Messages */}
                  {(hasAgentModeAccess || agentMessagesRemaining > 0) && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          Agent Mode Messages
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {agentMessagesRemaining}
                          {agentMessagesTotal > 0
                            ? `/${agentMessagesTotal}`
                            : ''}{' '}
                          messages
                        </span>
                      </div>
                      <Progress
                        value={
                          agentMessagesTotal > 0 ? agentMessagesProgress : 0
                        }
                        className="w-full"
                      />
                    </div>
                  )}

                  {/* Deep Research Requests */}
                  {(hasDeepResearchAccess || deepResearchRemaining > 0) && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          Deep Research Requests
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {deepResearchRemaining}
                          {deepResearchTotal > 0
                            ? `/${deepResearchTotal}`
                            : ''}{' '}
                          requests
                        </span>
                      </div>
                      <Progress
                        value={deepResearchTotal > 0 ? deepResearchProgress : 0}
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
