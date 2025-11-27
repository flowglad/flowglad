import { NextResponse } from 'next/server'
import { flowglad } from '@/utils/flowglad'
import { createClient } from '@/utils/supabase/server'

export const GET = async () => {
  // get billing
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.id) {
    throw new Error('User not found')
  }
  const scopedFlowglad = flowglad(user.id)
  const billing = await scopedFlowglad.getBilling()
  // get current subscriptions and usage meter id
  const currentSubscriptions = billing.currentSubscriptions
  const usageMeterId = billing.catalog.usageMeters[0]?.id
  if (!usageMeterId) {
    throw new Error('No usage meter id found')
  }
  // attempt to get the price for the usage meter
  let priceId: string | undefined
  billing.catalog.products.forEach((product) =>
    product.prices.forEach((price) => {
      if (price.usageMeterId === usageMeterId) {
        priceId = price.id
      }
    })
  )

  if (!priceId) {
    throw new Error('No price found')
  }
  // if there are no current subscriptions, create a new one
  // otherwise, use the first one
  let currentSubscriptionId: string | undefined
  if (
    !currentSubscriptions ||
    currentSubscriptions.length === 0 ||
    true
  ) {
    const { subscription: newSubscription } =
      await scopedFlowglad.createSubscription({
        priceId,
        trialEnd: new Date(
          Date.now() + 1000 * 60 * 60 * 24 * 30
        ).getTime(),
      })
    currentSubscriptionId = newSubscription.id
  }
  if (!currentSubscriptionId) {
    throw new Error('No current subscription id found')
  }
  // create a usage event
  // const usageEvent = await flowgladServer.createUsageEvent({
  //   usageMeterId,
  //   transactionId: currentSubscriptionId,
  //   subscriptionId: currentSubscriptionId,
  //   priceId,
  //   amount: 1,
  //   properties: {
  //     githubOrganization: 'flowglad',
  //     user: 'lol'
  //   }
  // });

  return NextResponse.json({
    message: 'Hello, world!',
    // usageEvent
  })
}
