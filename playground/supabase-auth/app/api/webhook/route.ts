import { NextRequest, NextResponse } from 'next/server';
import {
  verifyWebhook,
  WebhookVerificationError
} from '@flowglad/nextjs/server';

export async function POST(request: NextRequest) {
  try {
    // Get raw body as string (CRITICAL: use .text(), not .json())
    const rawBody = await request.text();

    // Convert headers to plain object
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Verify webhook signature
    const payload = verifyWebhook(
      rawBody,
      headers,
      process.env.FLOWGLAD_WEBHOOK_SECRET!
    );

    console.log('Verified webhook payload:', payload);

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 });
    }
    throw err;
  }
}
