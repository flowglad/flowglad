import { beforeEach, describe, expect, it } from 'bun:test'
import { Result } from 'better-result'
import {
  setupCustomer,
  setupOrg,
  setupUserAndApiKey,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import type { ApiKey } from '@/db/schema/apiKeys'
import type { Customer } from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import type { User } from '@/db/schema/users'
import {
  selectCustomers,
  updateCustomer,
} from '@/db/tableMethods/customerMethods'
import { insertMembership } from '@/db/tableMethods/membershipMethods'
import { NotFoundError } from '@/db/tableUtils'
import { MembershipRole } from '@/types'

/**
 * Reference suite for merchant-facing RLS isolation using `authenticatedTransaction`.
 *
 * Later, this pattern can be replicated for other tables that scope access by
 * organization membership.
 */
describe('RLS (merchant) for customers via authenticatedTransaction', () => {
  let org1: Organization.Record
  let org2: Organization.Record
  let pricingModel1Id: string
  let pricingModel2Id: string

  let userA: User.Record
  let apiKeyForOrg1: ApiKey.Record
  let apiKeyForOrg2: ApiKey.Record

  let customerOrg1: Customer.Record
  let customerOrg2: Customer.Record

  beforeEach(async () => {
    const orgSetup1 = (await setupOrg()).unwrap()
    org1 = orgSetup1.organization
    pricingModel1Id = orgSetup1.pricingModel.id

    const orgSetup2 = (await setupOrg()).unwrap()
    org2 = orgSetup2.organization
    pricingModel2Id = orgSetup2.pricingModel.id

    const uaOrg1 = (
      await setupUserAndApiKey({
        organizationId: org1.id,
        livemode: true,
      })
    ).unwrap()
    userA = uaOrg1.user
    apiKeyForOrg1 = uaOrg1.apiKey

    await adminTransaction(async ({ transaction }) => {
      await insertMembership(
        {
          organizationId: org2.id,
          userId: userA.id,
          focused: false,
          livemode: true,
          role: MembershipRole.Member,
        },
        transaction
      )
      return Result.ok(undefined)
    })

    const ubOrg2 = (
      await setupUserAndApiKey({
        organizationId: org2.id,
        livemode: true,
      })
    ).unwrap()
    apiKeyForOrg2 = ubOrg2.apiKey

    customerOrg1 = (
      await setupCustomer({
        organizationId: org1.id,
        email: `customer-org1+${Date.now()}@test.com`,
        pricingModelId: pricingModel1Id,
      })
    ).unwrap()

    customerOrg2 = (
      await setupCustomer({
        organizationId: org2.id,
        email: `customer-org2+${Date.now()}@test.com`,
        pricingModelId: pricingModel2Id,
      })
    ).unwrap()
  })

  it('does not allow selecting customers from another organization by id', async () => {
    const [accessibleInOrg1] = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectCustomers({ id: customerOrg1.id }, transaction)
      },
      { apiKey: apiKeyForOrg1.token }
    )
    expect(accessibleInOrg1?.id).toBe(customerOrg1.id)

    const inaccessibleInOrg1 = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectCustomers({ id: customerOrg2.id }, transaction)
      },
      { apiKey: apiKeyForOrg1.token }
    )
    expect(inaccessibleInOrg1).toHaveLength(0)
  })

  it('does not allow updating customers from another organization', async () => {
    await expect(
      authenticatedTransaction(
        async ({ transaction }) => {
          await updateCustomer(
            { id: customerOrg2.id, name: 'Blocked update' },
            transaction
          )
        },
        { apiKey: apiKeyForOrg1.token }
      )
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('allows updating a customer in the current organization', async () => {
    const updatedName = 'Updated Customer Name'
    const updated = await authenticatedTransaction(
      async ({ transaction }) => {
        return updateCustomer(
          { id: customerOrg1.id, name: updatedName },
          transaction
        )
      },
      { apiKey: apiKeyForOrg1.token }
    )
    expect(updated.name).toBe(updatedName)

    const [selectedAfter] = await authenticatedTransaction(
      async ({ transaction }) =>
        selectCustomers({ id: customerOrg1.id }, transaction),
      { apiKey: apiKeyForOrg1.token }
    )
    expect(selectedAfter?.name).toBe(updatedName)
  })

  it('switching organization context changes which customers are visible', async () => {
    const inOrg1 = await authenticatedTransaction(
      async ({ transaction }) => selectCustomers({}, transaction),
      { apiKey: apiKeyForOrg1.token }
    )
    expect(inOrg1.some((c) => c.id === customerOrg1.id)).toBe(true)
    expect(inOrg1.some((c) => c.id === customerOrg2.id)).toBe(false)

    const inOrg2 = await authenticatedTransaction(
      async ({ transaction }) => selectCustomers({}, transaction),
      { apiKey: apiKeyForOrg2.token }
    )
    expect(inOrg2.some((c) => c.id === customerOrg2.id)).toBe(true)
    expect(inOrg2.some((c) => c.id === customerOrg1.id)).toBe(false)
  })
})
