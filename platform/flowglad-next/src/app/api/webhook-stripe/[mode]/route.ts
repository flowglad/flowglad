import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import core from '@/utils/core'
import {
  handleStripeConnectWebhookEvent,
  handleStripePrimaryWebhookEvent,
} from '@/utils/processStripeEvents'
import { constructStripeWebhookEvent } from '@/utils/stripe'

type WebhookMode = 'livemode' | 'testmode'
const stripeWebhookSigningSecret = ({
  mode,
  connect,
}: {
  mode: WebhookMode
  connect: boolean
}) => {
  if (mode !== 'livemode' && connect) {
    throw new Error('Connect webhooks are not supported in testmode')
  }
  if (connect) {
    return core.envVariable('STRIPE_CONNECT_WEBHOOK_SIGNING_SECRET')
  } else if (mode === 'testmode') {
    return core.envVariable('STRIPE_TESTMODE_WEBHOOK_SIGNING_SECRET')
  } else {
    return core.envVariable('STRIPE_WEBHOOK_SIGNING_SECRET')
  }
}

/**
 * A single endpoint that is registered with TWO different Stripe webhooks:
 * - `STRIPE_WEBHOOK_SIGNING_SECRET`
 * - `STRIPE_CONNECT_WEBHOOK_SIGNING_SECRET`
 *
 * This endpoint will attempt to verify the webhook using the primary secret.
 * If that fails, it will attempt to verify the webhook using the connect secret.
 * Stripe requires registration of separate webhooks for primary and connect accounts,
 * which means each one gets its own signing secret.
 *
 * But in dev, Stripe sends all events (both connect and main) to a single webhook,
 * with a single signing secret. Stripe's webhooks architecture therefore *wants* to be
 * handled by a single endpoint, just with two different signing secrets.
 */
export const POST = async (
  request: NextRequest,
  { params }: { params: Promise<{ mode: string }> }
) => {
  const { mode } = await params
  if (mode !== 'livemode' && mode !== 'testmode') {
    return NextResponse.json(
      {
        error: `Invalid mode: ${mode}. Must be 'livemode' or 'testmode'`,
      },
      { status: 400 }
    )
  }
  try {
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')
    if (!signature) {
      return NextResponse.json(
        { error: 'No signature provided' },
        { status: 200 }
      )
    }
    let event: Stripe.Event | null = null
    try {
      const signingSecret = stripeWebhookSigningSecret({
        mode,
        connect: false,
      })
      event = constructStripeWebhookEvent({
        payload: body,
        signature,
        signingSecret,
        livemode: mode === 'livemode',
      })
    } catch (err) {
      // If primary account verification fails, try verifying webhook using connect secret
      event = constructStripeWebhookEvent({
        payload: body,
        signature,
        signingSecret: stripeWebhookSigningSecret({
          mode,
          connect: true,
        }),
        livemode: true,
      })
    }
    /**
     * Use presence of `event.account` to determine which handler to use
     * @see https://docs.stripe.com/api/events/object#event_object-account
     */
    if (event.account) {
      await handleStripeConnectWebhookEvent(event)
    } else {
      await handleStripePrimaryWebhookEvent(event)
    }

    return NextResponse.json({ received: true }, { status: 200 })
  } catch (err) {
    console.error('Error processing Stripe webhook:', err)
    return NextResponse.json(
      { error: 'Webhook signature verification failed' },
      { status: 400 }
    )
  }
}
