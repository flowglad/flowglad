import {
  beforeEach,
  describe,
  expect,
  it,
  setDefaultTimeout,
} from 'bun:test'
import { TRPCError } from '@trpc/server'
import {
  setupCustomer,
  setupOrg,
  setupSubscription,
  setupUserAndApiKey,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  type Customer,
  editCustomerInputSchema,
} from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import type { TRPCApiContext } from '@/server/trpcContext'
import { SubscriptionStatus } from '@/types'
import { customersRouter } from './customersRouter'

// Increase timeout for tests that involve subscription cancellation
setDefaultTimeout(30000)

const createCaller = (
  organization: Organization.Record,
  apiKeyToken: string,
  livemode: boolean = true
) => {
  return customersRouter.createCaller({
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

describe('customersRouter.archive', () => {
  let organization: Organization.Record
  let apiKeyToken: string
  let priceId: string

  beforeEach(async () => {
    // Setup organization with API key
    const orgSetup = await setupOrg()
    organization = orgSetup.organization
    priceId = orgSetup.price.id

    const userApiKeySetup = await setupUserAndApiKey({
      organizationId: organization.id,
      livemode: true,
    })
    if (!userApiKeySetup.apiKey.token) {
      throw new Error('API key token not found after setup')
    }
    apiKeyToken = userApiKeySetup.apiKey.token
  })

  it('sets archived=true on customer and returns the archived customer record', async () => {
    // Setup: create active customer
    const customer = await setupCustomer({
      organizationId: organization.id,
      email: `customer+${Date.now()}@test.com`,
      externalId: `ext-archive-test-${Date.now()}`,
    })

    expect(customer.archived).toBe(false)

    const caller = createCaller(organization, apiKeyToken)

    // Action: call archive endpoint
    const result = await caller.archive({
      externalId: customer.externalId!,
    })

    // Assert: customer.archived === true
    expect(result.customer.id).toBe(customer.id)
    expect(result.customer.archived).toBe(true)
    expect(result.customer.externalId).toBe(customer.externalId)
  })

  it('cancels all active subscriptions when archiving a customer', async () => {
    // Setup: create customer with 2 active subscriptions
    const customer = await setupCustomer({
      organizationId: organization.id,
      email: `customer+${Date.now()}@test.com`,
      externalId: `ext-archive-subs-${Date.now()}`,
    })

    const subscription1 = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId,
      status: SubscriptionStatus.Active,
      livemode: true,
      currentBillingPeriodStart:
        Date.now() - 15 * 24 * 60 * 60 * 1000,
      currentBillingPeriodEnd: Date.now() + 15 * 24 * 60 * 60 * 1000,
    })

    const subscription2 = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId,
      status: SubscriptionStatus.Active,
      livemode: true,
      currentBillingPeriodStart:
        Date.now() - 10 * 24 * 60 * 60 * 1000,
      currentBillingPeriodEnd: Date.now() + 20 * 24 * 60 * 60 * 1000,
    })

    const caller = createCaller(organization, apiKeyToken)

    // Action: call archive endpoint
    const result = await caller.archive({
      externalId: customer.externalId!,
    })

    // Assert: customer is archived
    expect(result.customer.archived).toBe(true)

    // Assert: both subscriptions are canceled
    await adminTransaction(async ({ transaction }) => {
      const updatedSub1 = await selectSubscriptionById(
        subscription1.id,
        transaction
      )
      const updatedSub2 = await selectSubscriptionById(
        subscription2.id,
        transaction
      )

      expect(updatedSub1.status).toBe(SubscriptionStatus.Canceled)
      expect(updatedSub1.cancellationReason).toBe('customer_archived')

      expect(updatedSub2.status).toBe(SubscriptionStatus.Canceled)
      expect(updatedSub2.cancellationReason).toBe('customer_archived')
    })
  })

  /**
   * This test validates that the partial unique index (from migration 0282)
   * allows reusing an externalId after a customer is archived.
   * If this test fails with a unique constraint violation, the migration
   * has not been applied to the database.
   */
  it('allows creating new customer with same externalId after archive (partial unique index)', async () => {
    // Setup: create customer
    const uniqueExternalId = `ext-reuse-${Date.now()}`
    const customer = await setupCustomer({
      organizationId: organization.id,
      email: `customer+${Date.now()}@test.com`,
      externalId: uniqueExternalId,
    })

    const caller = createCaller(organization, apiKeyToken)

    // Archive the customer
    await caller.archive({
      externalId: customer.externalId!,
    })

    // Action: create new customer with same externalId
    const newCustomerResult = await caller.create({
      customer: {
        email: `newcustomer+${Date.now()}@test.com`,
        name: 'New Customer',
        externalId: uniqueExternalId,
      },
    })

    // Assert: new customer created successfully with same externalId
    expect(newCustomerResult.data.customer.externalId).toBe(
      uniqueExternalId
    )
    expect(newCustomerResult.data.customer.id).not.toBe(customer.id)
    expect(newCustomerResult.data.customer.archived).toBe(false)
  })

  it('is idempotent - archiving already archived customer is a no-op and returns the customer', async () => {
    // Setup: create and archive customer
    const customer = await setupCustomer({
      organizationId: organization.id,
      email: `customer+${Date.now()}@test.com`,
      externalId: `ext-idempotent-${Date.now()}`,
    })

    const caller = createCaller(organization, apiKeyToken)

    // Archive the customer first time
    const firstResult = await caller.archive({
      externalId: customer.externalId!,
    })
    expect(firstResult.customer.archived).toBe(true)

    // Action: call archive endpoint again
    const secondResult = await caller.archive({
      externalId: customer.externalId!,
    })

    // Assert: no error, customer unchanged
    expect(secondResult.customer.archived).toBe(true)
    expect(secondResult.customer.id).toBe(customer.id)
  })

  it('returns NOT_FOUND for non-existent customer externalId', async () => {
    const caller = createCaller(organization, apiKeyToken)

    // Action: call archive with non-existent externalId
    const error = await caller
      .archive({
        externalId: 'non-existent-external-id',
      })
      .catch((e: unknown) => e)

    // Assert: TRPCError NOT_FOUND
    expect(error).toBeInstanceOf(TRPCError)
    expect((error as TRPCError).code).toBe('NOT_FOUND')
    expect((error as TRPCError).message).toContain(
      'non-existent-external-id'
    )
  })
})

describe('customersRouter.update', () => {
  let organization: Organization.Record
  let apiKeyToken: string
  let customer: Customer.Record

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
      externalId: `ext-update-test-${Date.now()}`,
    })
  })

  it('ignores archived field in update input schema, preventing archiving via update endpoint', async () => {
    const caller = createCaller(organization, apiKeyToken)

    // Action: call update with archived: true
    // The archived field should be omitted from the schema, so it should be ignored at runtime
    const result = await caller.update({
      externalId: customer.externalId!,
      customer: {
        name: 'Updated Name',
        // @ts-expect-error - archived is omitted from the schema, testing runtime behavior
        archived: true,
      },
    })

    // Assert: name is updated, but archived is still false
    expect(result.customer.name).toBe('Updated Name')
    expect(result.customer.archived).toBe(false)
  })
})

describe('editCustomerInputSchema', () => {
  it('strips the archived field from parsed input, preventing archiving via update', () => {
    // Input with archived field that should be stripped
    const inputWithArchived = {
      externalId: 'test-external-id',
      customer: {
        name: 'Test Customer',
        archived: true, // This should be stripped by Zod
      },
    }

    // Parse the input through the schema
    const parsed = editCustomerInputSchema.parse(inputWithArchived)

    // Assert: archived field is stripped from the parsed output
    expect(parsed.externalId).toBe('test-external-id')
    expect(parsed.customer.name).toBe('Test Customer')
    expect('archived' in parsed.customer).toBe(false)
  })
})
