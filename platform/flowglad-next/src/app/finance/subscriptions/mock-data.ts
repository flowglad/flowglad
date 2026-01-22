/**
 * Mock data for the subscriptions table showing all possible status variants.
 * This file can be deleted once no longer needed for development/testing.
 */
import type { Subscription } from '@/db/schema/subscriptions'
import {
  CurrencyCode,
  IntervalUnit,
  PriceType,
  SubscriptionStatus,
} from '@/types'

const now = Date.now()
const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000
const oneMonthFromNow = now + 30 * 24 * 60 * 60 * 1000

/**
 * Creates a mock subscription with the given status and customer name.
 * Uses type assertion since this is temporary mock data for testing.
 */
function createMockSubscription(
  index: number,
  status: SubscriptionStatus,
  customerName: string
): Subscription.TableRowData {
  const isActive =
    status === SubscriptionStatus.Active ||
    status === SubscriptionStatus.Trialing ||
    status === SubscriptionStatus.PastDue ||
    status === SubscriptionStatus.CancellationScheduled ||
    status === SubscriptionStatus.CreditTrial

  // CreditTrial is only valid for non-renewing subscriptions
  const isNonRenewing = status === SubscriptionStatus.CreditTrial

  const subscription = isNonRenewing
    ? {
        id: `sub_mock_${index}_${status.toLowerCase()}`,
        createdAt: oneMonthAgo,
        updatedAt: now,
        livemode: false,
        startDate: oneMonthAgo,
        customerId: `cus_mock_${index}`,
        organizationId: 'org_mock_1',
        status,
        defaultPaymentMethodId: null,
        backupPaymentMethodId: null,
        trialEnd: null,
        currentBillingPeriodStart: null,
        currentBillingPeriodEnd: null,
        metadata: null,
        canceledAt: null,
        cancelScheduledAt: null,
        cancellationReason: null,
        replacedBySubscriptionId: null,
        isFreePlan: false,
        doNotCharge: false,
        priceId: `price_mock_${index}`,
        runBillingAtPeriodStart: true,
        interval: null,
        intervalCount: null,
        billingCycleAnchorDate: null,
        name: `Mock Subscription ${index}`,
        renews: false as const,
        pricingModelId: `pm_mock_${index}`,
        current: isActive,
      }
    : {
        id: `sub_mock_${index}_${status.toLowerCase()}`,
        createdAt: oneMonthAgo,
        updatedAt: now,
        livemode: false,
        startDate: oneMonthAgo,
        customerId: `cus_mock_${index}`,
        organizationId: 'org_mock_1',
        status,
        defaultPaymentMethodId: null,
        backupPaymentMethodId: null,
        trialEnd:
          status === SubscriptionStatus.Trialing
            ? oneMonthFromNow
            : null,
        currentBillingPeriodStart: oneMonthAgo,
        currentBillingPeriodEnd: oneMonthFromNow,
        metadata: null,
        canceledAt:
          status === SubscriptionStatus.Canceled ||
          status === SubscriptionStatus.IncompleteExpired
            ? now
            : null,
        cancelScheduledAt:
          status === SubscriptionStatus.CancellationScheduled
            ? oneMonthFromNow
            : null,
        cancellationReason:
          status === SubscriptionStatus.Canceled
            ? 'Customer requested cancellation'
            : null,
        replacedBySubscriptionId: null,
        isFreePlan: false,
        doNotCharge: false,
        priceId: `price_mock_${index}`,
        runBillingAtPeriodStart: true,
        interval: IntervalUnit.Month,
        intervalCount: 1,
        billingCycleAnchorDate: oneMonthAgo,
        name: `Mock Subscription ${index}`,
        renews: true as const,
        pricingModelId: `pm_mock_${index}`,
        current: isActive,
      }

  return {
    subscription,
    customer: {
      id: `cus_mock_${index}`,
      createdAt: oneMonthAgo,
      updatedAt: now,
      createdByCommit: null,
      updatedByCommit: null,
      position: index,
      livemode: false,
      email: `${customerName.toLowerCase().replace(' ', '.')}@example.com`,
      name: customerName,
      organizationId: 'org_mock_1',
      externalId: `ext_mock_${index}`,
      invoiceNumberBase: `INV-MOCK-${index}`,
      metadata: null,
      userId: null,
      domain: null,
      iconURL: null,
      logoURL: null,
      archived: false,
      pricingModelId: `pm_mock_1`,
    },
    price: {
      id: `price_mock_${index}`,
      createdAt: oneMonthAgo,
      updatedAt: now,
      livemode: false,
      name: 'Pro Plan',
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 4900, // $49.00
      organizationId: 'org_mock_1',
      productId: `prod_mock_1`,
      trialPeriodDays: 14,
      setupFeePrice: null,
      isDefault: false,
      isArchived: false,
      type: PriceType.Subscription,
      displayUnitLabel: null,
      displayUnitLabelPlural: null,
      usageMeterId: null,
      currency: CurrencyCode.USD,
      slug: 'pro-plan',
      active: true,
      metadata: null,
      pricingModelId: `pm_mock_1`,
      usageEventsPerUnit: null,
    },
    product: {
      id: `prod_mock_1`,
      createdAt: oneMonthAgo,
      updatedAt: now,
      createdByCommit: null,
      updatedByCommit: null,
      position: 1,
      livemode: false,
      name: 'Pro Plan',
      organizationId: 'org_mock_1',
      description: 'Our most popular plan',
      imageURL: null,
      slug: 'pro-plan',
      singularQuantityLabel: null,
      pluralQuantityLabel: null,
      active: true,
      metadata: null,
      pricingModelId: `pm_mock_1`,
      default: false,
    },
  } as Subscription.TableRowData
}

/**
 * Mock data representing all possible subscription statuses.
 * Use this with the SubscriptionsDataTable by setting useMockData={true}.
 */
export const mockSubscriptionsData: Subscription.TableRowData[] = [
  createMockSubscription(
    1,
    SubscriptionStatus.Active,
    'Alice Johnson'
  ),
  createMockSubscription(2, SubscriptionStatus.Trialing, 'Bob Smith'),
  createMockSubscription(
    3,
    SubscriptionStatus.CreditTrial,
    'Charlie Brown'
  ),
  createMockSubscription(
    4,
    SubscriptionStatus.PastDue,
    'Diana Prince'
  ),
  createMockSubscription(
    5,
    SubscriptionStatus.Unpaid,
    'Edward Norton'
  ),
  createMockSubscription(
    6,
    SubscriptionStatus.CancellationScheduled,
    'Fiona Green'
  ),
  createMockSubscription(
    7,
    SubscriptionStatus.Incomplete,
    'George Lucas'
  ),
  createMockSubscription(
    8,
    SubscriptionStatus.IncompleteExpired,
    'Hannah Montana'
  ),
  createMockSubscription(
    9,
    SubscriptionStatus.Canceled,
    'Ivan Drago'
  ),
  createMockSubscription(
    10,
    SubscriptionStatus.Paused,
    'Julia Roberts'
  ),
]
