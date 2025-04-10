import { flowgladServer } from '@/utils/flowglad';
import { NextResponse } from 'next/server';

export const GET = async () => {
  const billing = await flowgladServer.getBilling();
  const currentSubscriptions = billing.currentSubscriptions;
  const usageMeterId = billing.catalog.usageMeters[0]?.id;
  if (!usageMeterId) {
    throw new Error('No usage meter id found');
  }
  let priceId: string | undefined;
  billing.catalog.products.forEach((product) =>
    product.prices.forEach((price) => {
      if (price.usageMeterId === usageMeterId) {
        priceId = price.id;
      }
    })
  );

  if (!priceId) {
    throw new Error('No price found');
  }
  let currentSubscriptionId: string | undefined;
  if (!currentSubscriptions || currentSubscriptions.length === 0) {
    console.log('====creating new subscription');
    console.log('====priceId', priceId);
    const { subscription: newSubscription } =
      await flowgladServer.createSubscription({
        priceId,
        trialEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).getTime()
      });
    currentSubscriptionId = newSubscription.id;
  } else {
    currentSubscriptionId = currentSubscriptions[0].id;
  }
  if (!currentSubscriptionId) {
    throw new Error('No current subscription id found');
  }
  const usageEvent = await flowgladServer.createUsageEvent({
    usageMeterId,
    transactionId: currentSubscriptionId,
    subscriptionId: currentSubscriptionId,
    priceId,
    amount: 1
  });

  return NextResponse.json({
    message: 'Hello, world!',
    usageEvent
  });
};
