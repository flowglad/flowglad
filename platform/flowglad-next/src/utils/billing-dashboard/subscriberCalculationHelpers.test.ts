import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
import {
  IntervalUnit,
  RevenueChartIntervalUnit,
  SubscriptionStatus,
} from '@/types'

// Mock the subscription methods
vi.mock('@/db/tableMethods/subscriptionMethods', () => ({
  currentSubscriptionStatuses: [
    SubscriptionStatus.Active,
    SubscriptionStatus.Trialing,
  ],
  getActiveSubscriptionsForPeriod: vi.fn(),
}))

import {
  calculateActiveSubscribersByMonth,
  calculateSubscriberBreakdown,
  getCurrentActiveSubscribers,
  MonthlyActiveSubscribers,
  SubscriberBreakdown,
} from './subscriberCalculationHelpers'
import { Subscription } from '@/db/schema/subscriptions'
import {
  addDays,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  differenceInDays,
} from 'date-fns'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupOrg,
  setupCustomer,
  setupPaymentMethod,
  setupSubscription,
} from '../../../seedDatabase'
import { DbTransaction } from '@/db/types'

// Import the mocked functions
import { getActiveSubscriptionsForPeriod } from '@/db/tableMethods/subscriptionMethods'

const coreSubscriptionValues = {
  id: 'sub-1',
  organizationId: 'org-1',
  customerId: 'cust-1',
  defaultPaymentMethodId: 'pm-1',
  priceId: 'price-1',
  status: SubscriptionStatus.Active,
  canceledAt: null,
  startDate: new Date(),
  livemode: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  name: 'Test Subscription 1',
  interval: IntervalUnit.Month,
  intervalCount: 1,
  externalId: 'sub-1',
  billingCycleAnchorDate: new Date(),
  metadata: {},
  backupPaymentMethodId: null,
  currentBillingPeriodEnd: new Date(),
  currentBillingPeriodStart: new Date(),
  cancelScheduledAt: null,
  runBillingAtPeriodStart: false,
  stripeSetupIntentId: null,
  trialEnd: null,
} as const

// Helper function to create subscription objects with all required properties
const createSubscription = (
  values: Partial<Subscription.Record>
): Subscription.Record => ({
  ...coreSubscriptionValues,
  ...values,
})

describe('calculateActiveSubscribersByMonth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return an empty array when there are no subscriptions', async () => {
    const { organization } = await setupOrg()
    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-03-31T05:00:00.000Z')

    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValue([])

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateActiveSubscribersByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

    expect(result.length).toBe(3)
    result.forEach((month) => {
      expect(month.count).toBe(0)
    })
  })

  it('should correctly count a single active subscription spanning the entire period', async () => {
    const { organization } = await setupOrg()
    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-03-31T05:00:00.000Z')

    // Create a subscription that spans before and after the period
    const subscription: Subscription.Record = createSubscription({
      id: 'sub-1',
      organizationId: organization.id,
      customerId: 'cust-1',
      defaultPaymentMethodId: 'pm-1',
      priceId: 'price-1',
      status: SubscriptionStatus.Active,
      startDate: new Date('2022-12-01T05:00:00.000Z'),
      canceledAt: new Date('2023-03-01T05:00:00.000Z'),
      livemode: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Mock subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValue([
      subscription,
    ])

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateActiveSubscribersByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

    // Should have 3 months
    expect(result.length).toBe(3)

    // All months should have 1 active subscriber
    result.forEach((month) => {
      expect(month.count).toBe(1)
    })
  })

  it('should correctly count multiple subscriptions starting and ending on different dates', async () => {
    const { organization } = await setupOrg()
    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-03-31T05:00:00.000Z')

    // Create subscriptions with different start and end dates
    const subscriptions: Subscription.Record[] = [
      createSubscription({
        id: 'sub-1',
        organizationId: organization.id,
        customerId: 'cust-1',
        defaultPaymentMethodId: 'pm-1',
        priceId: 'price-1',
        status: SubscriptionStatus.Active,
        startDate: new Date('2023-01-01T05:00:00.000Z'),
        canceledAt: null,
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      createSubscription({
        id: 'sub-2',
        organizationId: organization.id,
        customerId: 'cust-2',
        defaultPaymentMethodId: 'pm-2',
        priceId: 'price-2',
        status: SubscriptionStatus.Active,
        startDate: new Date('2023-01-15T05:00:00.000Z'),
        canceledAt: new Date('2023-02-15T05:00:00.000Z'),
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      createSubscription({
        id: 'sub-3',
        organizationId: organization.id,
        customerId: 'cust-3',
        defaultPaymentMethodId: 'pm-3',
        priceId: 'price-3',
        status: SubscriptionStatus.Active,
        startDate: new Date('2023-02-01T05:00:00.000Z'),
        canceledAt: null,
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ]

    // Mock subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValue(
      subscriptions
    )

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateActiveSubscribersByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

    // Should have 3 months
    expect(result.length).toBe(3)

    // January: 2 active subscribers (sub-1, sub-2)
    expect(result[0].count).toBe(2)

    // February: 2 active subscribers (sub-1, sub-2, sub-3)
    expect(result[1].count).toBe(3)

    // March: 2 active subscribers (sub-1, sub-3)
    expect(result[2].count).toBe(2)
  })

  it('should return zero counts for an organization with no subscriptions', async () => {
    const { organization } = await setupOrg()
    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-01-31T05:00:00.000Z')

    // Mock empty subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValue([])

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateActiveSubscribersByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

    expect(result.length).toBe(1)
    expect(result[0].count).toBe(0)
  })

  it('should correctly count subscriptions that start before the period and end after it', async () => {
    const { organization } = await setupOrg()
    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-03-31T05:00:00.000Z')

    // Create a subscription that spans before and after the period
    const subscription: Subscription.Record = createSubscription({
      id: 'sub-1',
      organizationId: organization.id,
      customerId: 'cust-1',
      defaultPaymentMethodId: 'pm-1',
      priceId: 'price-1',
      status: SubscriptionStatus.Active,
      startDate: new Date('2022-12-01T05:00:00.000Z'),
      canceledAt: new Date('2023-03-01T05:00:00.000Z'),
      livemode: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Mock subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValue([
      subscription,
    ])

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateActiveSubscribersByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

    // Should have 3 months
    expect(result.length).toBe(3)

    // All months should have 1 active subscriber
    result.forEach((month) => {
      expect(month.count).toBe(1)
    })
  })

  it('should correctly count subscriptions that start during the period and remain active', async () => {
    const { organization } = await setupOrg()
    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-03-31T05:00:00.000Z')

    // Create a subscription that starts during the period
    const subscription: Subscription.Record = createSubscription({
      id: 'sub-1',
      organizationId: organization.id,
      customerId: 'cust-1',
      defaultPaymentMethodId: 'pm-1',
      priceId: 'price-1',
      status: SubscriptionStatus.Active,
      startDate: new Date('2023-02-15T05:00:00.000Z'),
      canceledAt: null,
      livemode: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Mock subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValue([
      subscription,
    ])

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateActiveSubscribersByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

    // Should have 3 months
    expect(result.length).toBe(3)

    // January: 0 active subscribers
    expect(result[0].count).toBe(0)

    // February: 1 active subscriber
    expect(result[1].count).toBe(1)

    // March: 1 active subscriber
    expect(result[2].count).toBe(1)
  })

  it('should correctly count subscriptions that started before the period and ended during it', async () => {
    const { organization } = await setupOrg()
    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-03-31T05:00:00.000Z')

    // Create a subscription that started before and ended during the period
    const subscription: Subscription.Record = createSubscription({
      id: 'sub-1',
      organizationId: organization.id,
      customerId: 'cust-1',
      defaultPaymentMethodId: 'pm-1',
      priceId: 'price-1',
      status: SubscriptionStatus.Active,
      startDate: new Date('2022-12-01T05:00:00.000Z'),
      canceledAt: new Date('2023-01-15T05:00:00.000Z'),
      livemode: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Mock subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValue([
      subscription,
    ])

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateActiveSubscribersByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

    // Should have 3 months
    expect(result.length).toBe(3)

    // January: 1 active subscriber
    expect(result[0].count).toBe(1)

    // February: 0 active subscribers
    expect(result[1].count).toBe(0)

    // March: 0 active subscribers
    expect(result[2].count).toBe(0)
  })

  it('should handle edge cases like subscriptions starting/ending exactly on month boundaries', async () => {
    const { organization } = await setupOrg()
    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-03-31T05:00:00.000Z')

    // Create subscriptions with exact month boundary dates
    const subscriptions: Subscription.Record[] = [
      createSubscription({
        id: 'sub-1',
        organizationId: organization.id,
        customerId: 'cust-1',
        defaultPaymentMethodId: 'pm-1',
        priceId: 'price-1',
        status: SubscriptionStatus.Active,
        startDate: new Date('2023-01-01T05:00:00.000Z'), // Start of January
        canceledAt: null,
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      createSubscription({
        id: 'sub-2',
        organizationId: organization.id,
        customerId: 'cust-2',
        defaultPaymentMethodId: 'pm-2',
        priceId: 'price-2',
        status: SubscriptionStatus.Active,
        startDate: new Date('2022-12-01T05:00:00.000Z'),
        canceledAt: new Date('2023-01-31T04:59:00.000Z'), // End of January
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      createSubscription({
        id: 'sub-3',
        organizationId: organization.id,
        customerId: 'cust-3',
        defaultPaymentMethodId: 'pm-3',
        priceId: 'price-3',
        status: SubscriptionStatus.Active,
        startDate: new Date('2023-02-01T05:00:00.000Z'), // Start of February
        canceledAt: new Date('2023-02-28T05:00:00.000Z'), // End of February
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ]

    // Mock subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValue(
      subscriptions
    )

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateActiveSubscribersByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

    // Should have 3 months
    expect(result.length).toBe(3)

    // January: 2 active subscribers (sub-1, sub-2)
    expect(result[0].count).toBe(2)

    // February: 1 active subscriber (sub1, sub-3)
    expect(result[1].count).toBe(2)

    // March: 1 active subscriber (sub-3)
    expect(result[2].count).toBe(1)
  })

  it('should handle a date range spanning multiple years', async () => {
    const { organization } = await setupOrg()
    const startDate = new Date('2023-12-01T05:00:00.000Z')
    const endDate = new Date('2024-02-29T05:00:00.000Z')

    // Create a subscription that spans across years
    const subscription: Subscription.Record = createSubscription({
      id: 'sub-1',
      organizationId: organization.id,
      customerId: 'cust-1',
      defaultPaymentMethodId: 'pm-1',
      priceId: 'price-1',
      status: SubscriptionStatus.Active,
      startDate: new Date('2023-11-15T05:00:00.000Z'),
      canceledAt: new Date('2024-01-15T05:00:00.000Z'),
      livemode: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Mock subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValue([
      subscription,
    ])

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateActiveSubscribersByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

    // Should have 3 months: Dec 2023, Jan 2024, Feb 2024
    expect(result.length).toBe(3)

    // December 2023: 1 active subscriber
    expect(result[0].count).toBe(1)

    // January 2024: 1 active subscriber
    expect(result[1].count).toBe(1)

    // February 2024: 0 active subscribers
    expect(result[2].count).toBe(0)
  })

  it('should handle a very short date range (single month)', async () => {
    const { organization } = await setupOrg()
    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-01-31T05:00:00.000Z')

    // Create a subscription for January
    const subscription: Subscription.Record = createSubscription({
      id: 'sub-1',
      organizationId: organization.id,
      customerId: 'cust-1',
      defaultPaymentMethodId: 'pm-1',
      priceId: 'price-1',
      status: SubscriptionStatus.Active,
      startDate: new Date('2023-01-15T05:00:00.000Z'),
      canceledAt: null,
      livemode: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Mock subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValue([
      subscription,
    ])

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateActiveSubscribersByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

    // Should have 1 month
    expect(result.length).toBe(1)

    // January: 1 active subscriber
    expect(result[0].count).toBe(1)
  })

  it('should handle subscriptions starting on the last day of a month', async () => {
    const { organization } = await setupOrg()
    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-03-31T05:00:00.000Z')

    // Create a subscription starting on the last day of January
    const subscription: Subscription.Record = createSubscription({
      id: 'sub-1',
      organizationId: organization.id,
      customerId: 'cust-1',
      defaultPaymentMethodId: 'pm-1',
      priceId: 'price-1',
      status: SubscriptionStatus.Active,
      startDate: new Date('2023-01-31T05:00:00.000Z'),
      canceledAt: null,
      livemode: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Mock subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValue([
      subscription,
    ])

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateActiveSubscribersByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

    // Should have 3 months
    expect(result.length).toBe(3)

    // January: 1 active subscriber
    expect(result[0].count).toBe(1)

    // February: 1 active subscriber
    expect(result[1].count).toBe(1)

    // March: 1 active subscriber
    expect(result[2].count).toBe(1)
  })

  it('should handle subscriptions canceled before the month starts', async () => {
    const { organization } = await setupOrg()
    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-03-31T05:00:00.000Z')

    // Create a subscription canceled before January
    const subscription: Subscription.Record = createSubscription({
      id: 'sub-1',
      organizationId: organization.id,
      customerId: 'cust-1',
      defaultPaymentMethodId: 'pm-1',
      priceId: 'price-1',
      status: SubscriptionStatus.Active,
      startDate: new Date('2022-12-01T05:00:00.000Z'),
      canceledAt: new Date('2022-12-31T05:00:00.000Z'),
      livemode: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Mock subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValue([
      subscription,
    ])

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateActiveSubscribersByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

    // Should have 3 months
    expect(result.length).toBe(3)

    // All months should have 0 active subscribers
    result.forEach((month) => {
      expect(month.count).toBe(0)
    })
  })

  it('should handle subscriptions starting and ending within the same month', async () => {
    const { organization } = await setupOrg()
    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-03-31T05:00:00.000Z')

    // Create a subscription that starts and ends within January
    const subscription: Subscription.Record = createSubscription({
      id: 'sub-1',
      organizationId: organization.id,
      customerId: 'cust-1',
      defaultPaymentMethodId: 'pm-1',
      priceId: 'price-1',
      status: SubscriptionStatus.Active,
      startDate: new Date('2023-01-10T05:00:00.000Z'),
      canceledAt: new Date('2023-01-20T05:00:00.000Z'),
      livemode: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Mock subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValue([
      subscription,
    ])

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateActiveSubscribersByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

    // Should have 3 months
    expect(result.length).toBe(3)

    // January: 1 active subscriber
    expect(result[0].count).toBe(1)

    // February: 0 active subscribers
    expect(result[1].count).toBe(0)

    // March: 0 active subscribers
    expect(result[2].count).toBe(0)
  })
})

describe('calculateSubscriberBreakdown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should handle no subscriber changes between months', async () => {
    const { organization } = await setupOrg()
    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')

    // Create a subscription that was active in both months
    const subscription: Subscription.Record = createSubscription({
      id: 'sub-1',
      organizationId: organization.id,
      customerId: 'cust-1',
      defaultPaymentMethodId: 'pm-1',
      priceId: 'price-1',
      status: SubscriptionStatus.Active,
      startDate: new Date('2022-12-01T05:00:00.000Z'),
      canceledAt: null,
      livemode: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Mock subscription data for both months
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValueOnce([
      subscription,
    ]) // Current month
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValueOnce([
      subscription,
    ]) // Previous month

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateSubscriberBreakdown(
        organization.id,
        currentMonth,
        previousMonth,
        transaction
      )
    })

    expect(result.newSubscribers).toBe(0)
    expect(result.churned).toBe(0)
    expect(result.netChange).toBe(0)
  })

  it('should handle only new subscribers in the current month', async () => {
    const { organization } = await setupOrg()
    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')

    // Create a subscription that started in February
    const newSubscription: Subscription.Record = createSubscription({
      id: 'sub-1',
      organizationId: organization.id,
      customerId: 'cust-1',
      defaultPaymentMethodId: 'pm-1',
      priceId: 'price-1',
      status: SubscriptionStatus.Active,
      startDate: new Date('2023-02-15T05:00:00.000Z'),
      canceledAt: null,
      livemode: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Mock subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValueOnce([
      newSubscription,
    ]) // Current month
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValueOnce(
      []
    ) // Previous month

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateSubscriberBreakdown(
        organization.id,
        currentMonth,
        previousMonth,
        transaction
      )
    })

    expect(result.newSubscribers).toBe(1)
    expect(result.churned).toBe(0)
    expect(result.netChange).toBe(1)
  })

  it('should handle only churned subscribers in the current month', async () => {
    const { organization } = await setupOrg()
    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')

    // Create a subscription that was active in January but canceled in February
    const churnedSubscription: Subscription.Record =
      createSubscription({
        id: 'sub-1',
        organizationId: organization.id,
        customerId: 'cust-1',
        defaultPaymentMethodId: 'pm-1',
        priceId: 'price-1',
        status: SubscriptionStatus.Active,
        startDate: new Date('2022-12-01T05:00:00.000Z'),
        canceledAt: new Date('2023-02-15T05:00:00.000Z'),
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

    // Mock subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValueOnce([
      churnedSubscription,
    ]) // Current month
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValueOnce([
      churnedSubscription,
    ]) // Previous month

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateSubscriberBreakdown(
        organization.id,
        currentMonth,
        previousMonth,
        transaction
      )
    })

    expect(result.newSubscribers).toBe(0)
    expect(result.churned).toBe(1)
    expect(result.netChange).toBe(-1)
  })

  it('should handle both new and churned subscribers', async () => {
    const { organization } = await setupOrg()
    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')

    // Create a subscription that started in February
    const newSubscription: Subscription.Record = createSubscription({
      id: 'sub-1',
      organizationId: organization.id,
      customerId: 'cust-1',
      defaultPaymentMethodId: 'pm-1',
      priceId: 'price-1',
      status: SubscriptionStatus.Active,
      startDate: new Date('2023-02-15T05:00:00.000Z'),
      canceledAt: null,
      livemode: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Create a subscription that was active in January but canceled in February
    const churnedSubscription: Subscription.Record =
      createSubscription({
        id: 'sub-2',
        organizationId: organization.id,
        customerId: 'cust-2',
        defaultPaymentMethodId: 'pm-2',
        priceId: 'price-2',
        status: SubscriptionStatus.Active,
        startDate: new Date('2022-12-01T05:00:00.000Z'),
        canceledAt: new Date('2023-02-15T05:00:00.000Z'),
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

    // Mock subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValueOnce([
      newSubscription,
      churnedSubscription,
    ])
    // Current month
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValueOnce([
      churnedSubscription,
    ]) // Previous month

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateSubscriberBreakdown(
        organization.id,
        currentMonth,
        previousMonth,
        transaction
      )
    })

    expect(result.newSubscribers).toBe(1)
    expect(result.churned).toBe(1)
    expect(result.netChange).toBe(0)
  })

  it('should handle equal numbers of new and churned subscribers (zero net change)', async () => {
    const { organization } = await setupOrg()
    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')

    // Create two subscriptions that started in February
    const newSubscriptions: Subscription.Record[] = [
      {
        id: 'sub-1',
        organizationId: organization.id,
        customerId: 'cust-1',
        defaultPaymentMethodId: 'pm-1',
        priceId: 'price-1',
        status: SubscriptionStatus.Active,
        startDate: new Date('2023-02-10T05:00:00.000Z'),
        canceledAt: null,
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'sub-2',
        organizationId: organization.id,
        customerId: 'cust-2',
        defaultPaymentMethodId: 'pm-2',
        priceId: 'price-2',
        status: SubscriptionStatus.Active,
        startDate: new Date('2023-02-20T05:00:00.000Z'),
        canceledAt: null,
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ].map(createSubscription)

    // Create two subscriptions that were active in January but canceled in February
    const churnedSubscriptions: Subscription.Record[] = [
      {
        id: 'sub-3',
        organizationId: organization.id,
        customerId: 'cust-3',
        defaultPaymentMethodId: 'pm-3',
        priceId: 'price-3',
        status: SubscriptionStatus.Active,
        startDate: new Date('2022-12-01T05:00:00.000Z'),
        canceledAt: new Date('2023-02-10T05:00:00.000Z'),
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'sub-4',
        organizationId: organization.id,
        customerId: 'cust-4',
        defaultPaymentMethodId: 'pm-4',
        priceId: 'price-4',
        status: SubscriptionStatus.Active,
        startDate: new Date('2022-12-15T05:00:00.000Z'),
        canceledAt: new Date('2023-02-20T05:00:00.000Z'),
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ].map(createSubscription)

    // Mock subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValueOnce([
      ...newSubscriptions,
      ...churnedSubscriptions,
    ]) // Current month
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValueOnce(
      churnedSubscriptions
    ) // Previous month

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateSubscriberBreakdown(
        organization.id,
        currentMonth,
        previousMonth,
        transaction
      )
    })

    expect(result.newSubscribers).toBe(2)
    expect(result.churned).toBe(2)
    expect(result.netChange).toBe(0)
  })

  it('should handle more new than churned subscribers (positive net change)', async () => {
    const { organization } = await setupOrg()
    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')

    // Create three subscriptions that started in February
    const newSubscriptions: Subscription.Record[] = [
      {
        id: 'sub-1',
        organizationId: organization.id,
        customerId: 'cust-1',
        defaultPaymentMethodId: 'pm-1',
        priceId: 'price-1',
        status: SubscriptionStatus.Active,
        startDate: new Date('2023-02-10T05:00:00.000Z'),
        canceledAt: null,
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'sub-2',
        organizationId: organization.id,
        customerId: 'cust-2',
        defaultPaymentMethodId: 'pm-2',
        priceId: 'price-2',
        status: SubscriptionStatus.Active,
        startDate: new Date('2023-02-20T05:00:00.000Z'),
        canceledAt: null,
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'sub-3',
        organizationId: organization.id,
        customerId: 'cust-3',
        defaultPaymentMethodId: 'pm-3',
        priceId: 'price-3',
        status: SubscriptionStatus.Active,
        startDate: new Date('2023-02-25T05:00:00.000Z'),
        canceledAt: null,
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ].map(createSubscription)

    // Create one subscription that was active in January but canceled in February
    const churnedSubscription: Subscription.Record =
      createSubscription({
        id: 'sub-4',
        organizationId: organization.id,
        customerId: 'cust-4',
        defaultPaymentMethodId: 'pm-4',
        priceId: 'price-4',
        status: SubscriptionStatus.Active,
        startDate: new Date('2022-12-01T05:00:00.000Z'),
        canceledAt: new Date('2023-02-15T05:00:00.000Z'),
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

    // Mock subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValueOnce([
      ...newSubscriptions,
      churnedSubscription,
    ]) // Current month
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValueOnce([
      churnedSubscription,
    ]) // Previous month

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateSubscriberBreakdown(
        organization.id,
        currentMonth,
        previousMonth,
        transaction
      )
    })

    expect(result.newSubscribers).toBe(3)
    expect(result.churned).toBe(1)
    expect(result.netChange).toBe(2)
  })

  it('should handle more churned than new subscribers (negative net change)', async () => {
    const { organization } = await setupOrg()
    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')

    // Create one subscription that started in February
    const newSubscription: Subscription.Record = createSubscription({
      id: 'sub-1',
      organizationId: organization.id,
      customerId: 'cust-1',
      defaultPaymentMethodId: 'pm-1',
      priceId: 'price-1',
      status: SubscriptionStatus.Active,
      startDate: new Date('2023-02-15T05:00:00.000Z'),
      canceledAt: null,
      livemode: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Create three subscriptions that were active in January but canceled in February
    const churnedSubscriptions: Subscription.Record[] = [
      {
        id: 'sub-2',
        organizationId: organization.id,
        customerId: 'cust-2',
        defaultPaymentMethodId: 'pm-2',
        priceId: 'price-2',
        status: SubscriptionStatus.Active,
        startDate: new Date('2022-12-01T05:00:00.000Z'),
        canceledAt: new Date('2023-02-10T05:00:00.000Z'),
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'sub-3',
        organizationId: organization.id,
        customerId: 'cust-3',
        defaultPaymentMethodId: 'pm-3',
        priceId: 'price-3',
        status: SubscriptionStatus.Active,
        startDate: new Date('2022-12-15T05:00:00.000Z'),
        canceledAt: new Date('2023-02-20T05:00:00.000Z'),
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'sub-4',
        organizationId: organization.id,
        customerId: 'cust-4',
        defaultPaymentMethodId: 'pm-4',
        priceId: 'price-4',
        status: SubscriptionStatus.Active,
        startDate: new Date('2022-12-20T05:00:00.000Z'),
        canceledAt: new Date('2023-02-25T05:00:00.000Z'),
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ].map(createSubscription)

    // Mock subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValueOnce([
      newSubscription,
      ...churnedSubscriptions,
    ]) // Current month
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValueOnce(
      churnedSubscriptions
    ) // Previous month

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateSubscriberBreakdown(
        organization.id,
        currentMonth,
        previousMonth,
        transaction
      )
    })

    expect(result.newSubscribers).toBe(1)
    expect(result.churned).toBe(3)
    expect(result.netChange).toBe(-2)
  })

  it('should handle months that have no active subscriptions', async () => {
    const { organization } = await setupOrg()
    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')

    // Mock empty subscription data for both months
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValueOnce(
      []
    ) // Current month
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValueOnce(
      []
    ) // Previous month

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateSubscriberBreakdown(
        organization.id,
        currentMonth,
        previousMonth,
        transaction
      )
    })

    expect(result.newSubscribers).toBe(0)
    expect(result.churned).toBe(0)
    expect(result.netChange).toBe(0)
  })

  it('should handle edge cases where subscribers churn on the first/last day of the month', async () => {
    const { organization } = await setupOrg()
    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')

    // Create a subscription that churned on the first day of February
    const churnedOnFirstDay: Subscription.Record = createSubscription(
      {
        id: 'sub-1',
        organizationId: organization.id,
        customerId: 'cust-1',
        defaultPaymentMethodId: 'pm-1',
        priceId: 'price-1',
        status: SubscriptionStatus.Active,
        startDate: new Date('2022-12-01T05:00:00.000Z'),
        canceledAt: new Date('2023-02-01T05:00:00.000Z'),
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    )

    // Create a subscription that churned on the last day of February
    const churnedOnLastDay: Subscription.Record = createSubscription({
      id: 'sub-2',
      organizationId: organization.id,
      customerId: 'cust-2',
      defaultPaymentMethodId: 'pm-2',
      priceId: 'price-2',
      status: SubscriptionStatus.Active,
      startDate: new Date('2022-12-15T05:00:00.000Z'),
      canceledAt: new Date('2023-02-28T05:00:00.000Z'),
      livemode: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Mock subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValueOnce([
      churnedOnFirstDay,
      churnedOnLastDay,
    ])

    // Current month
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValueOnce([
      churnedOnFirstDay,
      churnedOnLastDay,
    ]) // Previous month

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateSubscriberBreakdown(
        organization.id,
        currentMonth,
        previousMonth,
        transaction
      )
    })

    expect(result.newSubscribers).toBe(0)
    expect(result.churned).toBe(2)
    expect(result.netChange).toBe(-2)
  })

  it("should handle subscriptions active in both months (ensure they don't count as new or churned)", async () => {
    const { organization } = await setupOrg()
    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')

    // Create a subscription that was active in both months
    const activeSubscription: Subscription.Record =
      createSubscription({
        id: 'sub-1',
        organizationId: organization.id,
        customerId: 'cust-1',
        defaultPaymentMethodId: 'pm-1',
        priceId: 'price-1',
        status: SubscriptionStatus.Active,
        startDate: new Date('2022-12-01T05:00:00.000Z'),
        canceledAt: null,
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

    // Mock subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValueOnce([
      activeSubscription,
    ]) // Current month
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValueOnce([
      activeSubscription,
    ]) // Previous month

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateSubscriberBreakdown(
        organization.id,
        currentMonth,
        previousMonth,
        transaction
      )
    })

    expect(result.newSubscribers).toBe(0)
    expect(result.churned).toBe(0)
    expect(result.netChange).toBe(0)
  })

  it('should handle churned subscriptions from non-previous subscribers', async () => {
    const { organization } = await setupOrg()
    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')

    // Create a subscription that started and churned in February (not in January)
    const churnedSubscription: Subscription.Record =
      createSubscription({
        id: 'sub-1',
        organizationId: organization.id,
        customerId: 'cust-1',
        defaultPaymentMethodId: 'pm-1',
        priceId: 'price-1',
        status: SubscriptionStatus.Active,
        startDate: new Date('2023-02-10T05:00:00.000Z'),
        canceledAt: new Date('2023-02-20T05:00:00.000Z'),
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

    // Mock subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValueOnce([
      churnedSubscription,
    ]) // Current month
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValueOnce(
      []
    ) // Previous month

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateSubscriberBreakdown(
        organization.id,
        currentMonth,
        previousMonth,
        transaction
      )
    })

    expect(result.newSubscribers).toBe(1)
    expect(result.churned).toBe(0) // Not churned because it wasn't in the previous month
    expect(result.netChange).toBe(1)
  })

  it('should handle new subscriptions started outside current month', async () => {
    const { organization } = await setupOrg()
    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')

    // Create a subscription that started in January but is active in February
    const newSubscription: Subscription.Record = createSubscription({
      id: 'sub-1',
      organizationId: organization.id,
      customerId: 'cust-1',
      defaultPaymentMethodId: 'pm-1',
      priceId: 'price-1',
      status: SubscriptionStatus.Active,
      startDate: new Date('2023-01-15T05:00:00.000Z'),
      canceledAt: null,
      livemode: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Mock subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValueOnce([
      newSubscription,
    ]) // Current month
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValueOnce(
      []
    ) // Previous month

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateSubscriberBreakdown(
        organization.id,
        currentMonth,
        previousMonth,
        transaction
      )
    })

    expect(result.newSubscribers).toBe(0) // Not new because it started in January
    expect(result.churned).toBe(0)
    expect(result.netChange).toBe(0)
  })

  it('should handle cancellations in previous month', async () => {
    const { organization } = await setupOrg()
    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')

    // Create a subscription that was canceled in January
    const canceledSubscription: Subscription.Record =
      createSubscription({
        id: 'sub-1',
        organizationId: organization.id,
        customerId: 'cust-1',
        defaultPaymentMethodId: 'pm-1',
        priceId: 'price-1',
        status: SubscriptionStatus.Active,
        startDate: new Date('2022-12-01T05:00:00.000Z'),
        canceledAt: new Date('2023-01-15T05:00:00.000Z'),
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

    // Mock subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValueOnce(
      []
    ) // Current month
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValueOnce([
      canceledSubscription,
    ]) // Previous month

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateSubscriberBreakdown(
        organization.id,
        currentMonth,
        previousMonth,
        transaction
      )
    })

    expect(result.newSubscribers).toBe(0)
    expect(result.churned).toBe(0) // Not churned in February because it was canceled in January
    expect(result.netChange).toBe(0)
  })
})

describe('getCurrentActiveSubscribers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return zero when there are no active subscribers', async () => {
    const { organization } = await setupOrg()
    const testDate = new Date('2023-03-15T05:00:00.000Z')

    // Mock empty subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValue([])

    const result = await adminTransaction(async ({ transaction }) => {
      return getCurrentActiveSubscribers(
        { organizationId: organization.id, currentDate: testDate },
        transaction
      )
    })

    expect(result).toBe(0)
  })

  it('should correctly count multiple active subscribers', async () => {
    const { organization } = await setupOrg()
    const testDate = new Date('2023-03-15T05:00:00.000Z')

    // Create multiple active subscriptions
    const subscriptions: Subscription.Record[] = [
      {
        id: 'sub-1',
        organizationId: organization.id,
        customerId: 'cust-1',
        defaultPaymentMethodId: 'pm-1',
        priceId: 'price-1',
        status: SubscriptionStatus.Active,
        startDate: new Date('2023-01-01T05:00:00.000Z'),
        canceledAt: null,
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'sub-2',
        organizationId: organization.id,
        customerId: 'cust-2',
        defaultPaymentMethodId: 'pm-2',
        priceId: 'price-2',
        status: SubscriptionStatus.Active,
        startDate: new Date('2023-02-01T05:00:00.000Z'),
        canceledAt: null,
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'sub-3',
        organizationId: organization.id,
        customerId: 'cust-3',
        defaultPaymentMethodId: 'pm-3',
        priceId: 'price-3',
        status: SubscriptionStatus.Active,
        startDate: new Date('2023-03-01T05:00:00.000Z'),
        canceledAt: null,
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ].map(createSubscription)

    // Mock subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValue(
      subscriptions
    )

    const result = await adminTransaction(async ({ transaction }) => {
      return getCurrentActiveSubscribers(
        { organizationId: organization.id, currentDate: testDate },
        transaction
      )
    })

    expect(result).toBe(3)
  })

  it('should return zero when there are only canceled subscriptions', async () => {
    const { organization } = await setupOrg()
    const testDate = new Date('2023-03-15T05:00:00.000Z')

    // Create subscriptions that are all canceled
    const subscriptions: Subscription.Record[] = [
      {
        id: 'sub-1',
        organizationId: organization.id,
        customerId: 'cust-1',
        defaultPaymentMethodId: 'pm-1',
        priceId: 'price-1',
        status: SubscriptionStatus.Canceled,
        startDate: new Date('2023-01-01T05:00:00.000Z'),
        canceledAt: new Date('2023-02-01T05:00:00.000Z'),
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'sub-2',
        organizationId: organization.id,
        customerId: 'cust-2',
        defaultPaymentMethodId: 'pm-2',
        priceId: 'price-2',
        status: SubscriptionStatus.Canceled,
        startDate: new Date('2023-02-01T05:00:00.000Z'),
        canceledAt: new Date('2023-03-01T05:00:00.000Z'),
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ].map(createSubscription)

    // Mock subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValue(
      subscriptions
    )

    const result = await adminTransaction(async ({ transaction }) => {
      return getCurrentActiveSubscribers(
        { organizationId: organization.id, currentDate: testDate },
        transaction
      )
    })

    expect(result).toBe(0)
  })

  it('should correctly count a mix of active and canceled subscriptions', async () => {
    const { organization } = await setupOrg()
    const testDate = new Date('2023-03-15T05:00:00.000Z')

    // Create a mix of active and canceled subscriptions
    const subscriptions: Subscription.Record[] = [
      {
        id: 'sub-1',
        organizationId: organization.id,
        customerId: 'cust-1',
        defaultPaymentMethodId: 'pm-1',
        priceId: 'price-1',
        status: SubscriptionStatus.Active,
        startDate: new Date('2023-01-01T05:00:00.000Z'),
        canceledAt: null,
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'sub-2',
        organizationId: organization.id,
        customerId: 'cust-2',
        defaultPaymentMethodId: 'pm-2',
        priceId: 'price-2',
        status: SubscriptionStatus.Canceled,
        startDate: new Date('2023-02-01T05:00:00.000Z'),
        canceledAt: new Date('2023-03-01T05:00:00.000Z'),
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'sub-3',
        organizationId: organization.id,
        customerId: 'cust-3',
        defaultPaymentMethodId: 'pm-3',
        priceId: 'price-3',
        status: SubscriptionStatus.Active,
        startDate: new Date('2023-03-01T05:00:00.000Z'),
        canceledAt: null,
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ].map(createSubscription)

    // Mock subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValue(
      subscriptions
    )

    const result = await adminTransaction(async ({ transaction }) => {
      return getCurrentActiveSubscribers(
        { organizationId: organization.id, currentDate: testDate },
        transaction
      )
    })

    expect(result).toBe(2)
  })

  it('should handle month boundaries (first/last day of month)', async () => {
    const { organization } = await setupOrg()

    // Test with the first day of the month
    const firstDayOfMonth = new Date('2023-03-01T05:00:00.000Z')

    // Create active subscriptions
    const subscriptions: Subscription.Record[] = [
      {
        id: 'sub-1',
        organizationId: organization.id,
        customerId: 'cust-1',
        defaultPaymentMethodId: 'pm-1',
        priceId: 'price-1',
        status: SubscriptionStatus.Active,
        startDate: new Date('2023-01-01T05:00:00.000Z'),
        canceledAt: null,
        livemode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ].map(createSubscription)

    // Mock subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValue(
      subscriptions
    )

    const result = await adminTransaction(async ({ transaction }) => {
      return getCurrentActiveSubscribers(
        {
          organizationId: organization.id,
          currentDate: firstDayOfMonth,
        },
        transaction
      )
    })

    expect(result).toBe(1)

    // Now test with the last day of the month
    const lastDayOfMonth = new Date('2023-03-31T05:00:00.000Z')

    const result2 = await adminTransaction(
      async ({ transaction }) => {
        return getCurrentActiveSubscribers(
          {
            organizationId: organization.id,
            currentDate: lastDayOfMonth,
          },
          transaction
        )
      }
    )

    expect(result2).toBe(1)
  })
})

describe('Edge Cases and Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should handle invalid date ranges (end date before start date)', async () => {
    const { organization } = await setupOrg()
    const startDate = new Date('2023-03-01T05:00:00.000Z')
    const endDate = new Date('2023-01-01T05:00:00.000Z') // End date before start date

    // Mock empty subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValue([])

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateActiveSubscribersByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

    // Should return an empty array when end date is before start date
    expect(result).toEqual([])
  })

  it('should handle extremely large date ranges', async () => {
    const { organization } = await setupOrg()
    const startDate = new Date('2020-01-01T05:00:00.000Z')
    const endDate = new Date('2030-12-31T05:00:00.000Z')

    // Create a subscription that spans the entire period
    const subscription: Subscription.Record = createSubscription({
      id: 'sub-1',
      organizationId: organization.id,
      customerId: 'cust-1',
      defaultPaymentMethodId: 'pm-1',
      priceId: 'price-1',
      status: SubscriptionStatus.Active,
      startDate: new Date('2019-12-01T05:00:00.000Z'),
      canceledAt: null,
      livemode: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Mock subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValue([
      subscription,
    ])

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateActiveSubscribersByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

    // Should have 132 months (11 years * 12 months)
    expect(result.length).toBe(132)

    // All months should have 1 active subscriber
    result.forEach((month) => {
      expect(month.count).toBe(1)
    })
  })

  it('should handle dates in the future', async () => {
    const { organization } = await setupOrg()
    const startDate = new Date('2025-01-01T05:00:00.000Z')
    const endDate = new Date('2025-03-31T05:00:00.000Z')

    // Mock empty subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValue([])

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateActiveSubscribersByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

    // Should have 3 months
    expect(result.length).toBe(3)

    // All months should have 0 active subscribers
    result.forEach((month) => {
      expect(month.count).toBe(0)
    })
  })

  it('should handle start date equals end date (single-day/month period)', async () => {
    const { organization } = await setupOrg()
    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-01-02T04:59:59.999Z') // Same day

    // Create a subscription for January
    const subscription: Subscription.Record = createSubscription({
      id: 'sub-1',
      organizationId: organization.id,
      customerId: 'cust-1',
      defaultPaymentMethodId: 'pm-1',
      priceId: 'price-1',
      status: SubscriptionStatus.Active,
      startDate: new Date('2023-02-15T05:00:00.000Z'),
      canceledAt: null,
      livemode: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Mock subscription data
    vi.mocked(getActiveSubscriptionsForPeriod).mockResolvedValue([
      subscription,
    ])

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateActiveSubscribersByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Day,
        },
        transaction
      )
    })

    // Should have 1 month
    expect(result.length).toBe(1)

    // January should have 0 active subscribers (subscription starts on Jan 15)
    expect(result[0].count).toBe(0)
  })
})
