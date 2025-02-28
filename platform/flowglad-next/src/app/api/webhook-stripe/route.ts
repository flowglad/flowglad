import core from '@/utils/core'
import {
  handleStripeConnectWebhookEvent,
  handleStripePrimaryWebhookEvent,
} from '@/utils/processStripeEvents'
import { constructStripeWebhookEvent } from '@/utils/stripe'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

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
export const POST = async (request: Request) => {
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
      /**
       * FOR NOW: only support webhooks assuming live mode.
       * We need to set up webhooks in the sandbox, and then update this.
       */
      event = constructStripeWebhookEvent({
        payload: body,
        signature,
        signingSecret: core.envVariable(
          'STRIPE_WEBHOOK_SIGNING_SECRET'
        ),
        livemode: true,
      })
    } catch (err) {
      // If primary account verification fails, try verifying webhook using connect secret
      event = constructStripeWebhookEvent({
        payload: body,
        signature,
        signingSecret: core.envVariable(
          'STRIPE_CONNECT_WEBHOOK_SIGNING_SECRET'
        ),
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
