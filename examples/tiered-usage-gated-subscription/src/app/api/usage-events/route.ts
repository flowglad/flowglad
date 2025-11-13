import { flowgladServer } from '@/lib/flowglad';
import {
  findUsagePriceBySlug,
  findUsageMeterBySlug,
} from '@/lib/billing-helpers';
import { NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * POST /api/usage-events
 * Creates a usage event for the current customer
 *
 * Body: {
 *   priceSlug: string;       // e.g., 'plus_o3_overage' or 'pro_o3_tracking'
 *   usageMeterSlug: string;  // e.g., 'o3_messages' - used for validation
 *   amount: number;          // e.g., 1
 *   transactionId?: string; // Optional: for idempotency
 * }
 */
const createUsageEventSchema = z.object({
  priceSlug: z.string().min(1, 'priceSlug is required'),
  usageMeterSlug: z.string().min(1, 'usageMeterSlug is required'),
  amount: z
    .number()
    .int('amount must be an integer')
    .positive('amount must be a positive integer'),
  transactionId: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parseResult = createUsageEventSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid request body',
          details: parseResult.error.issues,
        },
        { status: 400 }
      );
    }

    const {
      priceSlug,
      usageMeterSlug,
      amount: amountNumber,
      transactionId,
    } = parseResult.data;

    // Generate transaction ID if not provided
    const finalTransactionId =
      transactionId ||
      `usage_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Get billing information to extract required IDs
    const billing = await flowgladServer.getBilling();

    if (!billing.customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    // Find the current subscription
    // By default, each customer can only have one active subscription at a time,
    // so accessing the first currentSubscriptions is sufficient.
    // Multiple subscriptions per customer can be enabled in dashboard > settings
    const currentSubscription = billing.currentSubscriptions?.[0];
    if (!currentSubscription) {
      return NextResponse.json(
        { error: 'No active subscription found' },
        { status: 404 }
      );
    }

    const subscriptionId = currentSubscription.id;

    // Find the usage meter by slug for validation
    const usageMeter = findUsageMeterBySlug(
      usageMeterSlug,
      billing.pricingModel
    );
    console.log(usageMeter);
    if (!usageMeter) {
      return NextResponse.json(
        {
          error: `Usage meter not found: ${usageMeterSlug}`,
        },
        { status: 404 }
      );
    }

    // Find the usage price directly by slug
    const usagePrice = findUsagePriceBySlug(priceSlug, billing.pricingModel);

    if (!usagePrice) {
      return NextResponse.json(
        {
          error: `Usage price not found: ${priceSlug}`,
        },
        { status: 404 }
      );
    }

    if (usagePrice.type !== 'usage') {
      return NextResponse.json(
        {
          error: `Price ${priceSlug} is not a usage price`,
        },
        { status: 400 }
      );
    }

    if (!usagePrice.usageMeterId) {
      return NextResponse.json(
        {
          error: `Price ${priceSlug} does not have a usage meter associated`,
        },
        { status: 400 }
      );
    }

    // Validate that the price's usage meter matches the provided usage meter slug
    if (usagePrice.usageMeterId !== usageMeter.id) {
      return NextResponse.json(
        {
          error: `Price ${priceSlug} is associated with a different usage meter than ${usageMeterSlug}`,
        },
        { status: 400 }
      );
    }

    const priceId = usagePrice.id;
    const usageMeterId = usagePrice.usageMeterId;

    // Create usage event with all required IDs
    // Note: customerId is automatically resolved from the session by FlowgladServer
    const usageEvent = await flowgladServer.createUsageEvent({
      subscriptionId,
      priceId,
      usageMeterId,
      amount: amountNumber,
      transactionId: finalTransactionId,
    });

    return NextResponse.json({
      success: true,
      usageEvent,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to create usage event',
      },
      { status: 500 }
    );
  }
}
