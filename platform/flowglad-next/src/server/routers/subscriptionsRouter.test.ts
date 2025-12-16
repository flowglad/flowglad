import { TRPCError } from '@trpc/server'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupBillingPeriod,
  setupCustomer,
  setupOrg,
  setupSubscription,
  setupUserAndApiKey,
} from '@/../seedDatabase'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { Customer } from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import type { Subscription } from '@/db/schema/subscriptions'
import type { TRPCApiContext } from '@/server/trpcContext'
import { BillingPeriodStatus, SubscriptionStatus } from '@/types'
import { subscriptionsRouter } from './subscriptionsRouter'

const createCaller = (
  organization: Organization.Record,
  apiKeyToken: string,
  livemode: boolean = true
) => {
  return subscriptionsRouter.createCaller({
    organizationId: organization.id,
    organization,
    apiKey: apiKeyToken,
    livemode,
    environment: livemode ? ('live' as const) : ('test' as const),
    isApi: true,
    path: '',
    user: null,
    session: null,
  } as TRPCApiContext)
}

describe('subscriptionsRouter', () => {
  let organization: Organization.Record
  let customer: Customer.Record
  let apiKeyToken: string
  let doNotChargeSubscription: Subscription.Record
  let billingPeriod: BillingPeriod.Record

  beforeEach(async () => {
    // Setup organization with API key
    const orgSetup = await setupOrg()
    organization = orgSetup.organization

    const userApiKeySetup = await setupUserAndApiKey({
      organizationId: organization.id,
      livemode: true,
    })
    if (!userApiKeySetup.apiKey.token) {
      throw new Error('API key token not found after setup')
    }
    apiKeyToken = userApiKeySetup.apiKey.token

    // Setup customer
    customer = await setupCustomer({
      organizationId: organization.id,
      email: `customer+${Date.now()}@test.com`,
    })

    // Setup subscription with doNotCharge: true
    doNotChargeSubscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: orgSetup.price.id,
      status: SubscriptionStatus.Active,
      livemode: true,
      doNotCharge: true,
      currentBillingPeriodStart:
        Date.now() - 15 * 24 * 60 * 60 * 1000, // 15 days ago
      currentBillingPeriodEnd: Date.now() + 15 * 24 * 60 * 60 * 1000, // 15 days from now
    })

    // Setup billing period in Active status (valid for retry)
    billingPeriod = await setupBillingPeriod({
      subscriptionId: doNotChargeSubscription.id,
      startDate: doNotChargeSubscription.currentBillingPeriodStart!,
      endDate: doNotChargeSubscription.currentBillingPeriodEnd!,
      livemode: true,
      status: BillingPeriodStatus.Active,
    })
  })

  describe('retryBillingRunProcedure', () => {
    it('should throw BAD_REQUEST when attempting to retry billing for a doNotCharge subscription', async () => {
      const caller = createCaller(organization, apiKeyToken)

      const error = await caller
        .retryBillingRunProcedure({
          billingPeriodId: billingPeriod.id,
        })
        .catch((e) => e)

      expect(error).toBeInstanceOf(TRPCError)
      expect(error.code).toBe('BAD_REQUEST')
      expect(error.message).toBe(
        'Cannot retry billing for doNotCharge subscriptions'
      )
    })
  })
})
