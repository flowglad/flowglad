import { beforeEach, describe, expect, it } from 'bun:test'
import {
  setupCustomer,
  setupOrg,
  setupPricingModel,
  setupUserAndApiKey,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { Customer, customers } from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import type { User } from '@/db/schema/users'
import { ArchivedCustomerError } from '@/errors'
import core from '@/utils/core'
import {
  assertCustomerNotArchived,
  assignStackAuthHostedBillingUserIdToCustomersWithMatchingEmailButNoStackAuthHostedBillingUserId,
  insertCustomer,
  selectCustomerByExternalIdAndOrganizationId,
  selectCustomerById,
  selectCustomerPricingInfoBatch,
  selectCustomers,
  selectCustomersCursorPaginatedWithTableRowData,
  setUserIdForCustomerRecords,
  updateCustomer,
} from './customerMethods'

describe('assignStackAuthHostedBillingUserIdToCustomersWithMatchingEmailButNoStackAuthHostedBillingUserId', () => {
  let targetEmail: string
  let stackAuthHostedBillingUserId: string
  let org1Id: string
  let org2Id: string

  beforeEach(async () => {
    targetEmail = `test+${core.nanoid()}@test.com`
    stackAuthHostedBillingUserId = `stackauth_${core.nanoid()}`

    // Set up two organizations
    const { organization: org1 } = await setupOrg()
    const { organization: org2 } = await setupOrg()
    org1Id = org1.id
    org2Id = org2.id
  })

  it('updates all customers with no stackAuthUserBillingId that have the target email across organizations', async () => {
    // Create customers in both orgs
    const customer1 = await setupCustomer({
      organizationId: org1Id,
    })
    const customer2 = await setupCustomer({
      organizationId: org2Id,
    })

    // Create a customer with different email
    const customer3 = await setupCustomer({
      organizationId: org1Id,
    })

    // Update emails
    await adminTransaction(async ({ transaction }) => {
      await updateCustomer(
        { id: customer1.id, email: targetEmail },
        transaction
      )
      await updateCustomer(
        { id: customer2.id, email: targetEmail },
        transaction
      )
      await updateCustomer(
        {
          id: customer3.id,
          email: `different+${core.nanoid()}@test.com`,
        },
        transaction
      )
    })

    await adminTransaction(async ({ transaction }) => {
      await assignStackAuthHostedBillingUserIdToCustomersWithMatchingEmailButNoStackAuthHostedBillingUserId(
        {
          email: targetEmail,
          stackAuthHostedBillingUserId,
        },
        transaction
      )
    })

    // Verify both customers with target email were updated
    const updatedCustomers = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomers(
          {
            email: targetEmail,
          },
          transaction
        )
      }
    )

    expect(updatedCustomers).toHaveLength(2)
    expect(updatedCustomers[0].stackAuthHostedBillingUserId).toBe(
      stackAuthHostedBillingUserId
    )
    expect(updatedCustomers[1].stackAuthHostedBillingUserId).toBe(
      stackAuthHostedBillingUserId
    )
  })

  it('updates all customer records within the same organization that have matching email but no stack auth user id', async () => {
    // Create multiple customers in org1
    const customer1 = await setupCustomer({
      organizationId: org1Id,
    })
    const customer2 = await setupCustomer({
      organizationId: org1Id,
    })

    // Update emails
    await adminTransaction(async ({ transaction }) => {
      await updateCustomer(
        { id: customer1.id, email: targetEmail },
        transaction
      )
      await updateCustomer(
        { id: customer2.id, email: targetEmail },
        transaction
      )
    })

    await adminTransaction(async ({ transaction }) => {
      await assignStackAuthHostedBillingUserIdToCustomersWithMatchingEmailButNoStackAuthHostedBillingUserId(
        {
          email: targetEmail,
          stackAuthHostedBillingUserId,
        },
        transaction
      )
    })

    // Verify both customers in org1 were updated
    const updatedCustomers = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomers(
          {
            organizationId: org1Id,
            email: targetEmail,
          },
          transaction
        )
      }
    )

    expect(updatedCustomers).toHaveLength(2)
    expect(updatedCustomers[0].stackAuthHostedBillingUserId).toBe(
      stackAuthHostedBillingUserId
    )
    expect(updatedCustomers[1].stackAuthHostedBillingUserId).toBe(
      stackAuthHostedBillingUserId
    )
  })

  it('does not update customer records that have an existing stack auth user id even if they have matching email', async () => {
    const existingStackAuthId = `existing_${core.nanoid()}`

    // Create customers
    const customerWithExistingId = await setupCustomer({
      organizationId: org1Id,
    })
    const customerWithoutId = await setupCustomer({
      organizationId: org1Id,
    })

    // Update emails and set existing stack auth id
    await adminTransaction(async ({ transaction }) => {
      await updateCustomer(
        {
          id: customerWithExistingId.id,
          email: targetEmail,
          stackAuthHostedBillingUserId: existingStackAuthId,
        },
        transaction
      )
      await updateCustomer(
        {
          id: customerWithoutId.id,
          email: targetEmail,
        },
        transaction
      )
    })

    await adminTransaction(async ({ transaction }) => {
      await assignStackAuthHostedBillingUserIdToCustomersWithMatchingEmailButNoStackAuthHostedBillingUserId(
        {
          email: targetEmail,
          stackAuthHostedBillingUserId,
        },
        transaction
      )
    })

    // Verify only the customer without existing id was updated
    const updatedCustomers = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomers(
          {
            organizationId: org1Id,
            email: targetEmail,
          },
          transaction
        )
      }
    )

    expect(updatedCustomers).toHaveLength(2)
    const customerWithExistingIdAfter = updatedCustomers.find(
      (c) => c.id === customerWithExistingId.id
    )
    const customerWithoutIdAfter = updatedCustomers.find(
      (c) => c.id === customerWithoutId.id
    )

    expect(
      customerWithExistingIdAfter?.stackAuthHostedBillingUserId
    ).toBe(existingStackAuthId)
    expect(customerWithoutIdAfter?.stackAuthHostedBillingUserId).toBe(
      stackAuthHostedBillingUserId
    )
  })

  it('does not update any records that have different emails', async () => {
    const differentEmail = `different+${core.nanoid()}@test.com`

    // Create customers
    const customerWithDifferentEmail = await setupCustomer({
      organizationId: org1Id,
      email: differentEmail,
    })
    const customerWithTargetEmail = await setupCustomer({
      organizationId: org1Id,
      email: targetEmail,
    })

    // Update emails
    await adminTransaction(async ({ transaction }) => {
      await updateCustomer(
        { id: customerWithDifferentEmail.id, email: differentEmail },
        transaction
      )
      await updateCustomer(
        { id: customerWithTargetEmail.id, email: targetEmail },
        transaction
      )
    })

    await adminTransaction(async ({ transaction }) => {
      await assignStackAuthHostedBillingUserIdToCustomersWithMatchingEmailButNoStackAuthHostedBillingUserId(
        {
          email: targetEmail,
          stackAuthHostedBillingUserId,
        },
        transaction
      )
    })

    // Verify only the customer with target email was updated
    const updatedCustomers = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomers(
          {
            organizationId: org1Id,
          },
          transaction
        )
      }
    )

    expect(updatedCustomers).toHaveLength(2)
    const customerWithDifferentEmailAfter = updatedCustomers.find(
      (c) => c.id === customerWithDifferentEmail.id
    )
    const customerWithTargetEmailAfter = updatedCustomers.find(
      (c) => c.id === customerWithTargetEmail.id
    )

    expect(
      customerWithDifferentEmailAfter?.stackAuthHostedBillingUserId
    ).toBeNull()
    expect(
      customerWithTargetEmailAfter?.stackAuthHostedBillingUserId
    ).toBe(stackAuthHostedBillingUserId)
  })
})

describe('setUserIdForCustomerRecords', () => {
  let organization: Organization.Record
  let targetEmail: string
  let user1: User.Record
  let user2: User.Record

  beforeEach(async () => {
    // Set up organization
    const orgData = await setupOrg()
    organization = orgData.organization

    // Set up users
    const userData1 = await setupUserAndApiKey({
      organizationId: organization.id,
      livemode: true,
    })
    user1 = userData1.user

    const userData2 = await setupUserAndApiKey({
      organizationId: organization.id,
      livemode: true,
    })
    user2 = userData2.user

    targetEmail = `test+${core.nanoid()}@test.com`
  })

  it('should update all customer records with matching email to have the specified userId', async () => {
    // Create multiple customers with the same email
    const customer1 = await setupCustomer({
      organizationId: organization.id,
      email: targetEmail,
    })
    const customer2 = await setupCustomer({
      organizationId: organization.id,
      email: targetEmail,
    })
    const customer3 = await setupCustomer({
      organizationId: organization.id,
      email: targetEmail,
    })

    // Execute the function
    await adminTransaction(async ({ transaction }) => {
      await setUserIdForCustomerRecords(
        {
          customerEmail: targetEmail,
          userId: user1.id,
        },
        transaction
      )
    })

    // Verify all customers with target email were updated
    const updatedCustomers = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomers(
          {
            email: targetEmail,
          },
          transaction
        )
      }
    )

    expect(updatedCustomers).toHaveLength(3)
    expect(updatedCustomers[0].userId).toBe(user1.id)
    expect(updatedCustomers[1].userId).toBe(user1.id)
    expect(updatedCustomers[2].userId).toBe(user1.id)
  })

  it('should not update customer records with different emails', async () => {
    const differentEmail = `different+${core.nanoid()}@test.com`

    // Create customers with different emails
    const customerWithTargetEmail = await setupCustomer({
      organizationId: organization.id,
      email: targetEmail,
    })
    const customerWithDifferentEmail = await setupCustomer({
      organizationId: organization.id,
      email: differentEmail,
    })

    // Execute the function
    await adminTransaction(async ({ transaction }) => {
      await setUserIdForCustomerRecords(
        {
          customerEmail: targetEmail,
          userId: user1.id,
        },
        transaction
      )
    })

    // Verify only the customer with target email was updated
    const targetEmailCustomers = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomers(
          {
            email: targetEmail,
          },
          transaction
        )
      }
    )
    const differentEmailCustomers = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomers(
          {
            email: differentEmail,
          },
          transaction
        )
      }
    )

    expect(targetEmailCustomers).toHaveLength(1)
    expect(targetEmailCustomers[0].userId).toBe(user1.id)

    expect(differentEmailCustomers).toHaveLength(1)
    expect(differentEmailCustomers[0].userId).toBeNull()
  })

  it('should overwrite existing userId when updating customer records', async () => {
    // Create customer with existing userId
    const customer = await setupCustomer({
      organizationId: organization.id,
      email: targetEmail,
    })

    // First, set userId to user2
    await adminTransaction(async ({ transaction }) => {
      await updateCustomer(
        {
          id: customer.id,
          userId: user2.id,
        },
        transaction
      )
    })

    // Verify initial userId is set to user2
    const customerBeforeUpdate = await adminTransaction(
      async ({ transaction }) => {
        const customers = await selectCustomers(
          { id: customer.id },
          transaction
        )
        return customers[0]
      }
    )
    expect(customerBeforeUpdate.userId).toBe(user2.id)

    // Now execute setUserIdForCustomerRecords to change to user1
    await adminTransaction(async ({ transaction }) => {
      await setUserIdForCustomerRecords(
        {
          customerEmail: targetEmail,
          userId: user1.id,
        },
        transaction
      )
    })

    // Verify userId was updated to user1
    const customerAfterUpdate = await adminTransaction(
      async ({ transaction }) => {
        const customers = await selectCustomers(
          { id: customer.id },
          transaction
        )
        return customers[0]
      }
    )
    expect(customerAfterUpdate.userId).toBe(user1.id)
  })

  it('should handle case when no customers exist with the specified email', async () => {
    const nonExistentEmail = `nonexistent+${core.nanoid()}@test.com`

    // Create a customer with different email to ensure table is not empty
    await setupCustomer({
      organizationId: organization.id,
      email: `other+${core.nanoid()}@test.com`,
    })

    // Execute the function with non-existent email
    await adminTransaction(async ({ transaction }) => {
      // Should not throw error even when no records match
      await setUserIdForCustomerRecords(
        {
          customerEmail: nonExistentEmail,
          userId: user1.id,
        },
        transaction
      )
    })

    // Verify no customers exist with the non-existent email
    const customers = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomers(
          {
            email: nonExistentEmail,
          },
          transaction
        )
      }
    )
    expect(customers).toHaveLength(0)
  })

  it('should update customers across different organizations when they have the same email', async () => {
    // Set up second organization
    const org2Data = await setupOrg()
    const organization2 = org2Data.organization

    // Create customers with same email in different organizations
    const customerOrg1 = await setupCustomer({
      organizationId: organization.id,
      email: targetEmail,
    })
    const customerOrg2 = await setupCustomer({
      organizationId: organization2.id,
      email: targetEmail,
    })

    // Execute the function
    await adminTransaction(async ({ transaction }) => {
      await setUserIdForCustomerRecords(
        {
          customerEmail: targetEmail,
          userId: user1.id,
        },
        transaction
      )
    })

    // Verify both customers were updated regardless of organization
    const updatedCustomers = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomers(
          {
            email: targetEmail,
          },
          transaction
        )
      }
    )

    expect(updatedCustomers).toHaveLength(2)
    const org1Customer = updatedCustomers.find(
      (c) => c.organizationId === organization.id
    )
    const org2Customer = updatedCustomers.find(
      (c) => c.organizationId === organization2.id
    )

    expect(org1Customer?.userId).toBe(user1.id)
    expect(org2Customer?.userId).toBe(user1.id)
  })
})

describe('selectCustomerByExternalIdAndOrganizationId', () => {
  let organization: Organization.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
  })

  it('should not return archived customers by default', async () => {
    const externalId = `ext_${core.nanoid()}`

    // Create a customer and then archive it
    const customer = await setupCustomer({
      organizationId: organization.id,
      externalId,
    })

    // Archive the customer
    await adminTransaction(async ({ transaction }) => {
      await updateCustomer(
        { id: customer.id, archived: true },
        transaction
      )
    })

    // Lookup without includeArchived should return null
    const result = await adminTransaction(async ({ transaction }) => {
      return selectCustomerByExternalIdAndOrganizationId(
        {
          externalId,
          organizationId: organization.id,
        },
        transaction
      )
    })

    expect(result).toBeNull()
  })

  it('should return archived customers when includeArchived=true', async () => {
    const externalId = `ext_${core.nanoid()}`

    // Create a customer and then archive it
    const customer = await setupCustomer({
      organizationId: organization.id,
      externalId,
    })

    // Archive the customer
    await adminTransaction(async ({ transaction }) => {
      await updateCustomer(
        { id: customer.id, archived: true },
        transaction
      )
    })

    // Lookup with includeArchived=true should return the archived customer
    const result = await adminTransaction(async ({ transaction }) => {
      return selectCustomerByExternalIdAndOrganizationId(
        {
          externalId,
          organizationId: organization.id,
          includeArchived: true,
        },
        transaction
      )
    })

    expect(result).toMatchObject({
      id: customer.id,
      externalId,
      archived: true,
    })
  })

  it('should return non-archived customers regardless of includeArchived setting', async () => {
    const externalId = `ext_${core.nanoid()}`

    // Create an active (non-archived) customer
    const customer = await setupCustomer({
      organizationId: organization.id,
      externalId,
    })

    // Lookup without includeArchived should return the customer
    const resultDefault = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomerByExternalIdAndOrganizationId(
          {
            externalId,
            organizationId: organization.id,
          },
          transaction
        )
      }
    )

    expect(resultDefault).toMatchObject({
      id: customer.id,
      archived: false,
    })

    // Lookup with includeArchived=true should also return the customer
    const resultIncludeArchived = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomerByExternalIdAndOrganizationId(
          {
            externalId,
            organizationId: organization.id,
            includeArchived: true,
          },
          transaction
        )
      }
    )

    expect(resultIncludeArchived).toMatchObject({
      id: customer.id,
      archived: false,
    })
  })

  it('should return null for non-existent externalId', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return selectCustomerByExternalIdAndOrganizationId(
        {
          externalId: `non_existent_${core.nanoid()}`,
          organizationId: organization.id,
        },
        transaction
      )
    })

    expect(result).toBeNull()
  })

  it('should respect organization isolation when filtering archived customers', async () => {
    const externalId = `ext_${core.nanoid()}`

    // Create customer in org1
    const customer = await setupCustomer({
      organizationId: organization.id,
      externalId,
    })

    // Create a second organization
    const { organization: organization2 } = await setupOrg()

    // Lookup in org2 should return null (customer doesn't exist in org2)
    const result = await adminTransaction(async ({ transaction }) => {
      return selectCustomerByExternalIdAndOrganizationId(
        {
          externalId,
          organizationId: organization2.id,
        },
        transaction
      )
    })

    expect(result).toBeNull()

    // Lookup in org1 should return the customer
    const resultOrg1 = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomerByExternalIdAndOrganizationId(
          {
            externalId,
            organizationId: organization.id,
          },
          transaction
        )
      }
    )

    expect(resultOrg1).toMatchObject({
      id: customer.id,
    })
  })
})

describe('Customer uniqueness constraints', () => {
  let organization1: Organization.Record
  let organization2: Organization.Record
  let pricingModel1Id: string
  let pricingModel2Id: string

  beforeEach(async () => {
    // Set up two organizations for testing cross-org scenarios
    const org1Data = await setupOrg()
    organization1 = org1Data.organization
    pricingModel1Id = org1Data.pricingModel.id

    const org2Data = await setupOrg()
    organization2 = org2Data.organization
    pricingModel2Id = org2Data.pricingModel.id
  })

  describe('externalId partial unique index (archived customer handling)', () => {
    it('allows two customers with same externalId if one is archived', async () => {
      const sharedExternalId = `ext_archived_${core.nanoid()}`

      // Create first customer and archive it
      const customer1 = await setupCustomer({
        organizationId: organization1.id,
        externalId: sharedExternalId,
        email: `customer1_${core.nanoid()}@test.com`,
        livemode: true,
      })

      // Archive the customer
      await adminTransaction(async ({ transaction }) => {
        await updateCustomer(
          { id: customer1.id, archived: true },
          transaction
        )
      })

      // Verify customer1 is archived
      const archivedCustomer = await adminTransaction(
        async ({ transaction }) => {
          return await selectCustomerById(customer1.id, transaction)
        }
      )
      expect(archivedCustomer.archived).toBe(true)

      // Create new customer with same externalId - should succeed
      const customer2 = await setupCustomer({
        organizationId: organization1.id,
        externalId: sharedExternalId,
        email: `customer2_${core.nanoid()}@test.com`,
        livemode: true,
      })

      expect(customer2.externalId).toBe(sharedExternalId)
      expect(customer2.archived).toBe(false)
      expect(customer2.id).not.toBe(customer1.id)
    })

    it('rejects two active (non-archived) customers with same externalId in same pricingModel', async () => {
      const duplicateExternalId = `ext_dup_${core.nanoid()}`

      // Create first active customer
      const customer1 = await setupCustomer({
        organizationId: organization1.id,
        externalId: duplicateExternalId,
        email: `customer1_${core.nanoid()}@test.com`,
        livemode: true,
      })

      expect(customer1.externalId).toBe(duplicateExternalId)
      expect(customer1.archived).toBe(false)

      // Attempt to create second active customer with same externalId - should fail
      await expect(
        adminTransaction(async ({ transaction }) => {
          await insertCustomer(
            {
              organizationId: organization1.id,
              externalId: duplicateExternalId,
              email: `customer2_${core.nanoid()}@test.com`,
              name: 'Duplicate Customer',
              livemode: true,
              pricingModelId: pricingModel1Id,
            },
            transaction
          )
        })
      ).rejects.toThrow()
    })

    it('allows same externalId across different pricingModels regardless of archive status', async () => {
      const sharedExternalId = `ext_cross_pm_${core.nanoid()}`

      // Create customer in pricingModel1
      const customer1 = await setupCustomer({
        organizationId: organization1.id,
        externalId: sharedExternalId,
        email: `customer1_${core.nanoid()}@test.com`,
        livemode: true,
      })

      // Create customer with same externalId in pricingModel2 (different org has different pricing model)
      const customer2 = await setupCustomer({
        organizationId: organization2.id,
        externalId: sharedExternalId,
        email: `customer2_${core.nanoid()}@test.com`,
        livemode: true,
      })

      // Both should be created successfully
      expect(customer1.externalId).toBe(sharedExternalId)
      expect(customer2.externalId).toBe(sharedExternalId)
      expect(customer1.pricingModelId).toBe(pricingModel1Id)
      expect(customer2.pricingModelId).toBe(pricingModel2Id)
    })

    it('allows multiple archived customers with the same externalId', async () => {
      const sharedExternalId = `ext_multi_archived_${core.nanoid()}`

      // Create and archive first customer
      const customer1 = await setupCustomer({
        organizationId: organization1.id,
        externalId: sharedExternalId,
        email: `customer1_${core.nanoid()}@test.com`,
        livemode: true,
      })
      await adminTransaction(async ({ transaction }) => {
        await updateCustomer(
          { id: customer1.id, archived: true },
          transaction
        )
      })

      // Create and archive second customer with same externalId
      const customer2 = await setupCustomer({
        organizationId: organization1.id,
        externalId: sharedExternalId,
        email: `customer2_${core.nanoid()}@test.com`,
        livemode: true,
      })
      await adminTransaction(async ({ transaction }) => {
        await updateCustomer(
          { id: customer2.id, archived: true },
          transaction
        )
      })

      // Verify both are archived with the same externalId
      const [archivedCustomer1, archivedCustomer2] =
        await adminTransaction(async ({ transaction }) => {
          const c1 = await selectCustomerById(
            customer1.id,
            transaction
          )
          const c2 = await selectCustomerById(
            customer2.id,
            transaction
          )
          return [c1, c2]
        })

      expect(archivedCustomer1.externalId).toBe(sharedExternalId)
      expect(archivedCustomer2.externalId).toBe(sharedExternalId)
      expect(archivedCustomer1.archived).toBe(true)
      expect(archivedCustomer2.archived).toBe(true)
    })

    it('prevents unarchiving a customer if it would create a duplicate externalId', async () => {
      const sharedExternalId = `ext_unarchive_${core.nanoid()}`

      // Create and archive first customer
      const customer1 = await setupCustomer({
        organizationId: organization1.id,
        externalId: sharedExternalId,
        email: `customer1_${core.nanoid()}@test.com`,
        livemode: true,
      })
      await adminTransaction(async ({ transaction }) => {
        await updateCustomer(
          { id: customer1.id, archived: true },
          transaction
        )
      })

      // Create second active customer with same externalId
      const customer2 = await setupCustomer({
        organizationId: organization1.id,
        externalId: sharedExternalId,
        email: `customer2_${core.nanoid()}@test.com`,
        livemode: true,
      })

      expect(customer2.archived).toBe(false)

      // Attempt to unarchive customer1 - should fail due to unique constraint
      await expect(
        adminTransaction(async ({ transaction }) => {
          await updateCustomer(
            { id: customer1.id, archived: false },
            transaction
          )
        })
      ).rejects.toThrow()

      // Verify customer1 is still archived
      const stillArchivedCustomer = await adminTransaction(
        async ({ transaction }) => {
          return await selectCustomerById(customer1.id, transaction)
        }
      )
      expect(stillArchivedCustomer.archived).toBe(true)
    })
  })

  describe('organizationId/externalId/livemode uniqueness constraint', () => {
    it('should allow inserting customers with the same externalId in different organizations', async () => {
      const sharedExternalId = `ext_123_${core.nanoid()}`

      // Create customer in organization1
      const customer1 = await setupCustomer({
        organizationId: organization1.id,
        externalId: sharedExternalId,
        email: `customer1_${core.nanoid()}@test.com`,
        livemode: true,
      })

      // Create customer with same externalId in organization2
      const customer2 = await setupCustomer({
        organizationId: organization2.id,
        externalId: sharedExternalId,
        email: `customer2_${core.nanoid()}@test.com`,
        livemode: true,
      })

      // Verify both customers were created successfully
      expect(customer1.externalId).toBe(sharedExternalId)
      expect(customer2.externalId).toBe(sharedExternalId)
      expect(customer1.organizationId).toBe(organization1.id)
      expect(customer2.organizationId).toBe(organization2.id)
    })

    it('should allow inserting customers with the same externalId in the same organization but different livemode values', async () => {
      const sharedExternalId = `ext_456_${core.nanoid()}`

      // Create customer with livemode=true
      const customerLive = await setupCustomer({
        organizationId: organization1.id,
        externalId: sharedExternalId,
        email: `customer_live_${core.nanoid()}@test.com`,
        livemode: true,
      })

      // Create customer with same externalId but livemode=false
      const customerTest = await setupCustomer({
        organizationId: organization1.id,
        externalId: sharedExternalId,
        email: `customer_test_${core.nanoid()}@test.com`,
        livemode: false,
      })

      // Verify both customers were created successfully
      expect(typeof customerLive).toBe('object')
      expect(typeof customerTest).toBe('object')
      expect(customerLive.externalId).toBe(sharedExternalId)
      expect(customerTest.externalId).toBe(sharedExternalId)
      expect(customerLive.organizationId).toBe(organization1.id)
      expect(customerTest.organizationId).toBe(organization1.id)
      expect(customerLive.livemode).toBe(true)
      expect(customerTest.livemode).toBe(false)
    })

    it('should prevent inserting duplicate customers with the same organizationId, externalId, and livemode', async () => {
      const duplicateExternalId = `ext_789_${core.nanoid()}`

      // Create first customer
      const customer1 = await setupCustomer({
        organizationId: organization1.id,
        externalId: duplicateExternalId,
        email: `customer1_${core.nanoid()}@test.com`,
        livemode: true,
      })

      expect(customer1).toMatchObject({})
      expect(customer1.externalId).toBe(duplicateExternalId)

      // Attempt to create duplicate customer
      await expect(
        adminTransaction(async ({ transaction }) => {
          await insertCustomer(
            {
              organizationId: organization1.id,
              externalId: duplicateExternalId,
              email: `customer2_${core.nanoid()}@test.com`,
              name: 'Duplicate Customer',
              livemode: true,
              pricingModelId: pricingModel1Id,
            },
            transaction
          )
        })
      ).rejects.toThrow()
    })

    it('should allow updating a customer externalId if it does not conflict with existing constraints', async () => {
      // Create two customers
      const customer1 = await setupCustomer({
        organizationId: organization1.id,
        externalId: `ext_001_${core.nanoid()}`,
        email: `customer1_${core.nanoid()}@test.com`,
        livemode: true,
      })

      const customer2 = await setupCustomer({
        organizationId: organization1.id,
        externalId: `ext_002_${core.nanoid()}`,
        email: `customer2_${core.nanoid()}@test.com`,
        livemode: true,
      })

      const newExternalId = `ext_003_${core.nanoid()}`

      // Update customer2's externalId
      const updatedCustomer = await adminTransaction(
        async ({ transaction }) => {
          return await updateCustomer(
            {
              id: customer2.id,
              externalId: newExternalId,
            },
            transaction
          )
        }
      )

      // Verify the update succeeded
      expect(updatedCustomer.externalId).toBe(newExternalId)
      expect(updatedCustomer.id).toBe(customer2.id)
    })

    it('should prevent updating a customer externalId to a value that violates the uniqueness constraint', async () => {
      const externalId1 = `ext_001_${core.nanoid()}`
      const externalId2 = `ext_002_${core.nanoid()}`

      // Create two customers
      const customer1 = await setupCustomer({
        organizationId: organization1.id,
        externalId: externalId1,
        email: `customer1_${core.nanoid()}@test.com`,
        livemode: true,
      })

      const customer2 = await setupCustomer({
        organizationId: organization1.id,
        externalId: externalId2,
        email: `customer2_${core.nanoid()}@test.com`,
        livemode: true,
      })

      // Attempt to update customer2's externalId to match customer1's
      await expect(
        adminTransaction(async ({ transaction }) => {
          await updateCustomer(
            {
              id: customer2.id,
              externalId: externalId1, // This should violate the constraint
            },
            transaction
          )
        })
      ).rejects.toThrow()

      // Verify customer2 still has its original externalId
      const unchangedCustomer = await adminTransaction(
        async ({ transaction }) => {
          return await selectCustomerById(customer2.id, transaction)
        }
      )
      expect(unchangedCustomer.externalId).toBe(externalId2)
    })

    it('should allow multiple customers with different externalIds in the same organization and livemode', async () => {
      // Create three customers with different externalIds
      const customer1 = await setupCustomer({
        organizationId: organization1.id,
        externalId: `ext_a_${core.nanoid()}`,
        email: `customer1_${core.nanoid()}@test.com`,
        livemode: true,
      })

      const customer2 = await setupCustomer({
        organizationId: organization1.id,
        externalId: `ext_b_${core.nanoid()}`,
        email: `customer2_${core.nanoid()}@test.com`,
        livemode: true,
      })

      const customer3 = await setupCustomer({
        organizationId: organization1.id,
        externalId: `ext_c_${core.nanoid()}`,
        email: `customer3_${core.nanoid()}@test.com`,
        livemode: true,
      })

      // Verify all customers were created successfully
      expect(customer1).toMatchObject({})
      expect(customer2).toMatchObject({})
      expect(customer3).toMatchObject({})

      // Verify all belong to the same organization with same livemode
      expect(customer1.organizationId).toBe(organization1.id)
      expect(customer2.organizationId).toBe(organization1.id)
      expect(customer3.organizationId).toBe(organization1.id)

      expect(customer1.livemode).toBe(true)
      expect(customer2.livemode).toBe(true)
      expect(customer3.livemode).toBe(true)

      // Verify each has a unique externalId
      expect(customer1.externalId).not.toBe(customer2.externalId)
      expect(customer1.externalId).not.toBe(customer3.externalId)
      expect(customer2.externalId).not.toBe(customer3.externalId)
    })

    it('should enforce uniqueness constraint across different insertion methods', async () => {
      const sharedExternalId = `ext_method_${core.nanoid()}`

      // Create first customer using insertCustomer
      const customer1 = await adminTransaction(
        async ({ transaction }) => {
          return await insertCustomer(
            {
              organizationId: organization1.id,
              externalId: sharedExternalId,
              email: `customer1_${core.nanoid()}@test.com`,
              name: 'Customer 1',
              livemode: true,
              pricingModelId: pricingModel1Id,
            },
            transaction
          )
        }
      )

      expect(customer1).toMatchObject({})
      expect(customer1.externalId).toBe(sharedExternalId)

      // Attempt to create duplicate using raw insert
      await expect(
        adminTransaction(async ({ transaction }) => {
          // @ts-expect-error - intentionally setting null for test
          await transaction.insert(customers).values({
            id: `cust_${core.nanoid()}`,
            organizationId: organization1.id,
            externalId: sharedExternalId,
            email: `customer2_${core.nanoid()}@test.com`,
            name: 'Customer 2',
            livemode: true,
            createdAt: Date.now(),
            updatedAt: new Date(),
          })
        })
      ).rejects.toThrow()
    })

    it('should handle null values in the constraint properly', async () => {
      // Attempt to insert a customer without an externalId should fail
      await expect(
        adminTransaction(async ({ transaction }) => {
          await insertCustomer(
            {
              organizationId: organization1.id,
              // @ts-expect-error - intentionally omitting required field for test
              externalId: undefined,
              email: `customer_${core.nanoid()}@test.com`,
              name: 'Customer without externalId',
              livemode: true,
              pricingModelId: pricingModel1Id,
            },
            transaction
          )
        })
      ).rejects.toThrow()

      // Also test with explicit null - this should fail at the database level
      await expect(
        adminTransaction(async ({ transaction }) => {
          // Attempt raw SQL to bypass TypeScript checks
          // @ts-expect-error - intentionally setting null for test
          await transaction.insert(customers).values({
            id: `cust_${core.nanoid()}`,
            organizationId: organization1.id,
            externalId: null,
            email: `customer_${core.nanoid()}@test.com`,
            name: 'Customer with null externalId',
            livemode: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })
        })
      ).rejects.toThrow()
    })
  })

  describe('organizationId/invoiceNumberBase/livemode uniqueness constraint', () => {
    it('should allow customers with the same invoiceNumberBase in different organizations', async () => {
      const sharedInvoiceBase = `INV${core.nanoid().slice(0, 6)}`

      // Create customer in organization1
      const customer1 = await adminTransaction(
        async ({ transaction }) => {
          return await insertCustomer(
            {
              organizationId: organization1.id,
              externalId: `ext_${core.nanoid()}`,
              email: `customer1_${core.nanoid()}@test.com`,
              name: 'Customer 1',
              invoiceNumberBase: sharedInvoiceBase,
              livemode: true,
              pricingModelId: pricingModel1Id,
            },
            transaction
          )
        }
      )

      // Create customer with same invoiceNumberBase in organization2
      const customer2 = await adminTransaction(
        async ({ transaction }) => {
          return await insertCustomer(
            {
              organizationId: organization2.id,
              externalId: `ext_${core.nanoid()}`,
              email: `customer2_${core.nanoid()}@test.com`,
              name: 'Customer 2',
              invoiceNumberBase: sharedInvoiceBase,
              livemode: true,
              pricingModelId: pricingModel2Id,
            },
            transaction
          )
        }
      )

      // Verify both customers were created successfully
      expect(customer1).toMatchObject({})
      expect(customer2).toMatchObject({})
      expect(customer1.invoiceNumberBase).toBe(sharedInvoiceBase)
      expect(customer2.invoiceNumberBase).toBe(sharedInvoiceBase)
      expect(customer1.organizationId).not.toBe(
        customer2.organizationId
      )
    })

    it('should allow customers with the same invoiceNumberBase in same organization but different livemode', async () => {
      const sharedInvoiceBase = `INV${core.nanoid().slice(0, 6)}`
      // Get testmode pricing model for this test
      const { testmodePricingModel } = await setupOrg()

      // Create customer with livemode=true
      const customerLive = await adminTransaction(
        async ({ transaction }) => {
          return await insertCustomer(
            {
              organizationId: organization1.id,
              externalId: `ext_${core.nanoid()}`,
              email: `customer_live_${core.nanoid()}@test.com`,
              name: 'Customer Live',
              invoiceNumberBase: sharedInvoiceBase,
              livemode: true,
              pricingModelId: pricingModel1Id,
            },
            transaction
          )
        }
      )

      // Create customer with same invoiceNumberBase but livemode=false
      const customerTest = await adminTransaction(
        async ({ transaction }) => {
          return await insertCustomer(
            {
              organizationId: organization1.id,
              externalId: `ext_${core.nanoid()}`,
              email: `customer_test_${core.nanoid()}@test.com`,
              name: 'Customer Test',
              invoiceNumberBase: sharedInvoiceBase,
              livemode: false,
              pricingModelId: testmodePricingModel.id,
            },
            transaction
          )
        }
      )

      // Verify both customers were created successfully
      expect(typeof customerLive).toBe('object')
      expect(typeof customerTest).toBe('object')
      expect(customerLive.invoiceNumberBase).toBe(sharedInvoiceBase)
      expect(customerTest.invoiceNumberBase).toBe(sharedInvoiceBase)
      expect(customerLive.livemode).toBe(true)
      expect(customerTest.livemode).toBe(false)
    })

    it('should prevent duplicate invoiceNumberBase in same organization and livemode', async () => {
      const duplicateInvoiceBase = `INV${core.nanoid().slice(0, 6)}`

      // Create first customer
      const customer1 = await adminTransaction(
        async ({ transaction }) => {
          return await insertCustomer(
            {
              organizationId: organization1.id,
              externalId: `ext_${core.nanoid()}`,
              email: `customer1_${core.nanoid()}@test.com`,
              name: 'Customer 1',
              invoiceNumberBase: duplicateInvoiceBase,
              livemode: true,
              pricingModelId: pricingModel1Id,
            },
            transaction
          )
        }
      )

      expect(customer1).toMatchObject({})
      expect(customer1.invoiceNumberBase).toBe(duplicateInvoiceBase)

      // Attempt to create duplicate customer
      await expect(
        adminTransaction(async ({ transaction }) => {
          await insertCustomer(
            {
              organizationId: organization1.id,
              externalId: `ext_${core.nanoid()}`,
              email: `customer2_${core.nanoid()}@test.com`,
              name: 'Customer 2',
              invoiceNumberBase: duplicateInvoiceBase,
              livemode: true,
              pricingModelId: pricingModel1Id,
            },
            transaction
          )
        })
      ).rejects.toThrow()
    })

    it('should auto-generate unique invoiceNumberBase when not provided', async () => {
      // Create multiple customers without specifying invoiceNumberBase
      const customer1 = await setupCustomer({
        organizationId: organization1.id,
        externalId: `ext_${core.nanoid()}`,
        email: `customer1_${core.nanoid()}@test.com`,
        livemode: true,
      })

      const customer2 = await setupCustomer({
        organizationId: organization1.id,
        externalId: `ext_${core.nanoid()}`,
        email: `customer2_${core.nanoid()}@test.com`,
        livemode: true,
      })

      const customer3 = await setupCustomer({
        organizationId: organization1.id,
        externalId: `ext_${core.nanoid()}`,
        email: `customer3_${core.nanoid()}@test.com`,
        livemode: true,
      })

      // Verify all customers have unique invoiceNumberBase values
      expect(typeof customer1.invoiceNumberBase).toBe('string')
      expect(typeof customer2.invoiceNumberBase).toBe('string')
      expect(typeof customer3.invoiceNumberBase).toBe('string')
      expect(customer1.invoiceNumberBase).not.toBe(
        customer2.invoiceNumberBase
      )
      expect(customer1.invoiceNumberBase).not.toBe(
        customer3.invoiceNumberBase
      )
      expect(customer2.invoiceNumberBase).not.toBe(
        customer3.invoiceNumberBase
      )
    })
  })

  describe('stripeCustomerId uniqueness constraint', () => {
    it('should enforce uniqueness for stripeCustomerId within the same pricingModel', async () => {
      const stripeCustomerId = `cus_${core.nanoid()}`

      // Create customer with stripeCustomerId in organization1
      const customer1 = await adminTransaction(
        async ({ transaction }) => {
          return await insertCustomer(
            {
              organizationId: organization1.id,
              externalId: `ext_${core.nanoid()}`,
              email: `customer1_${core.nanoid()}@test.com`,
              name: 'Customer 1',
              stripeCustomerId: stripeCustomerId,
              livemode: true,
              pricingModelId: pricingModel1Id,
            },
            transaction
          )
        }
      )

      expect(customer1).toMatchObject({})
      expect(customer1.stripeCustomerId).toBe(stripeCustomerId)

      // Attempt to create customer with same stripeCustomerId in SAME pricingModel - should fail
      await expect(
        adminTransaction(async ({ transaction }) => {
          await insertCustomer(
            {
              organizationId: organization1.id,
              externalId: `ext_${core.nanoid()}`,
              email: `customer2_${core.nanoid()}@test.com`,
              name: 'Customer 2',
              stripeCustomerId: stripeCustomerId, // Same Stripe ID
              livemode: true,
              pricingModelId: pricingModel1Id, // Same pricing model - should fail
            },
            transaction
          )
        })
      ).rejects.toThrow()
    })

    it('should allow same stripeCustomerId in different pricingModels', async () => {
      const stripeCustomerId = `cus_${core.nanoid()}`

      // Create customer with stripeCustomerId in pricingModel1
      const customer1 = await adminTransaction(
        async ({ transaction }) => {
          return await insertCustomer(
            {
              organizationId: organization1.id,
              externalId: `ext_${core.nanoid()}`,
              email: `customer1_${core.nanoid()}@test.com`,
              name: 'Customer 1',
              stripeCustomerId: stripeCustomerId,
              livemode: true,
              pricingModelId: pricingModel1Id,
            },
            transaction
          )
        }
      )

      expect(customer1).toMatchObject({})
      expect(customer1.stripeCustomerId).toBe(stripeCustomerId)

      // Create customer with same stripeCustomerId in DIFFERENT pricingModel - should succeed
      // This is the expected behavior: same Stripe customer can exist in multiple pricing models
      const customer2 = await adminTransaction(
        async ({ transaction }) => {
          return await insertCustomer(
            {
              organizationId: organization2.id, // Different organization
              externalId: `ext_${core.nanoid()}`,
              email: `customer2_${core.nanoid()}@test.com`,
              name: 'Customer 2',
              stripeCustomerId: stripeCustomerId, // Same Stripe ID
              livemode: true,
              pricingModelId: pricingModel2Id, // Different pricing model - should succeed
            },
            transaction
          )
        }
      )

      expect(customer2).toMatchObject({
        stripeCustomerId,
        pricingModelId: pricingModel2Id,
      })
      expect(customer2.stripeCustomerId).toBe(stripeCustomerId)
      expect(customer2.pricingModelId).toBe(pricingModel2Id)
    })

    it('should allow multiple customers with different stripeCustomerIds', async () => {
      // Get testmode pricing model for this test
      const { testmodePricingModel } = await setupOrg()
      // Create three customers with different stripeCustomerIds
      const customer1 = await adminTransaction(
        async ({ transaction }) => {
          return await insertCustomer(
            {
              organizationId: organization1.id,
              externalId: `ext_${core.nanoid()}`,
              email: `customer1_${core.nanoid()}@test.com`,
              name: 'Customer 1',
              stripeCustomerId: `cus_${core.nanoid()}`,
              livemode: true,
              pricingModelId: pricingModel1Id,
            },
            transaction
          )
        }
      )

      const customer2 = await adminTransaction(
        async ({ transaction }) => {
          return await insertCustomer(
            {
              organizationId: organization2.id,
              externalId: `ext_${core.nanoid()}`,
              email: `customer2_${core.nanoid()}@test.com`,
              name: 'Customer 2',
              stripeCustomerId: `cus_${core.nanoid()}`,
              livemode: false,
              pricingModelId: testmodePricingModel.id,
            },
            transaction
          )
        }
      )

      const customer3 = await adminTransaction(
        async ({ transaction }) => {
          return await insertCustomer(
            {
              organizationId: organization1.id,
              externalId: `ext_${core.nanoid()}`,
              email: `customer3_${core.nanoid()}@test.com`,
              name: 'Customer 3',
              stripeCustomerId: `cus_${core.nanoid()}`,
              livemode: true,
              pricingModelId: pricingModel1Id,
            },
            transaction
          )
        }
      )

      // Verify all customers were created successfully
      expect(customer1).toMatchObject({})
      expect(customer2).toMatchObject({})
      expect(customer3).toMatchObject({})

      // Verify each has a unique stripeCustomerId
      expect(customer1.stripeCustomerId).not.toBe(
        customer2.stripeCustomerId
      )
      expect(customer1.stripeCustomerId).not.toBe(
        customer3.stripeCustomerId
      )
      expect(customer2.stripeCustomerId).not.toBe(
        customer3.stripeCustomerId
      )
    })

    it('should allow null stripeCustomerId values', async () => {
      // Get testmode pricing model for this test
      const { testmodePricingModel } = await setupOrg()
      // Create multiple customers without stripeCustomerId - use insertCustomer directly
      const customer1 = await adminTransaction(
        async ({ transaction }) => {
          return await insertCustomer(
            {
              organizationId: organization1.id,
              externalId: `ext_${core.nanoid()}`,
              email: `customer1_${core.nanoid()}@test.com`,
              name: 'Customer 1',
              livemode: true,
              pricingModelId: pricingModel1Id,
              // Explicitly not including stripeCustomerId to get null
            },
            transaction
          )
        }
      )

      const customer2 = await adminTransaction(
        async ({ transaction }) => {
          return await insertCustomer(
            {
              organizationId: organization1.id,
              externalId: `ext_${core.nanoid()}`,
              email: `customer2_${core.nanoid()}@test.com`,
              name: 'Customer 2',
              livemode: true,
              pricingModelId: pricingModel1Id,
              // Explicitly not including stripeCustomerId to get null
            },
            transaction
          )
        }
      )

      const customer3 = await adminTransaction(
        async ({ transaction }) => {
          return await insertCustomer(
            {
              organizationId: organization2.id,
              externalId: `ext_${core.nanoid()}`,
              email: `customer3_${core.nanoid()}@test.com`,
              name: 'Customer 3',
              livemode: false,
              pricingModelId: testmodePricingModel.id,
              // Explicitly not including stripeCustomerId to get null
            },
            transaction
          )
        }
      )

      // Verify all customers were created successfully with null stripeCustomerId
      expect(customer1).toMatchObject({})
      expect(customer2).toMatchObject({})
      expect(customer3).toMatchObject({})
      expect(customer1.stripeCustomerId).toBeNull()
      expect(customer2.stripeCustomerId).toBeNull()
      expect(customer3.stripeCustomerId).toBeNull()
    })

    it('should prevent updating to a duplicate stripeCustomerId within the same pricingModel', async () => {
      const stripeId1 = `cus_${core.nanoid()}`
      const stripeId2 = `cus_${core.nanoid()}`

      // Create two customers with different stripeCustomerIds in the SAME pricingModel
      const customer1 = await adminTransaction(
        async ({ transaction }) => {
          return await insertCustomer(
            {
              organizationId: organization1.id,
              externalId: `ext_${core.nanoid()}`,
              email: `customer1_${core.nanoid()}@test.com`,
              name: 'Customer 1',
              stripeCustomerId: stripeId1,
              livemode: true,
              pricingModelId: pricingModel1Id,
            },
            transaction
          )
        }
      )

      const customer2 = await adminTransaction(
        async ({ transaction }) => {
          return await insertCustomer(
            {
              organizationId: organization1.id, // Same organization
              externalId: `ext_${core.nanoid()}`,
              email: `customer2_${core.nanoid()}@test.com`,
              name: 'Customer 2',
              stripeCustomerId: stripeId2,
              livemode: true,
              pricingModelId: pricingModel1Id, // Same pricing model
            },
            transaction
          )
        }
      )

      // Attempt to update customer2 to have customer1's stripeCustomerId (same pricing model)
      await expect(
        adminTransaction(async ({ transaction }) => {
          await updateCustomer(
            {
              id: customer2.id,
              stripeCustomerId: stripeId1, // This should violate the constraint within same pricingModel
            },
            transaction
          )
        })
      ).rejects.toThrow()

      // Verify customer2 still has its original stripeCustomerId
      const unchangedCustomer = await adminTransaction(
        async ({ transaction }) => {
          return await selectCustomerById(customer2.id, transaction)
        }
      )
      expect(unchangedCustomer.stripeCustomerId).toBe(stripeId2)
    })
  })
})

describe('selectCustomersCursorPaginatedWithTableRowData', () => {
  let organization: Organization.Record
  let organization2: Organization.Record
  let pricingModel: { id: string; name: string }
  let customer1: Customer.Record
  let customer2: Customer.Record
  let customer3: Customer.Record
  let customerOtherOrg: Customer.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel

    // Setup customers with different names for search testing
    customer1 = await setupCustomer({
      organizationId: organization.id,
      name: 'Alice Smith',
      email: 'alice@example.com',
      pricingModelId: pricingModel.id,
    })

    customer2 = await setupCustomer({
      organizationId: organization.id,
      name: 'Bob Jones',
      email: 'bob@example.com',
      pricingModelId: pricingModel.id,
    })

    customer3 = await setupCustomer({
      organizationId: organization.id,
      name: 'Charlie Brown',
      email: 'charlie@example.com',
      pricingModelId: pricingModel.id,
    })

    // Setup second organization for isolation tests
    const orgData2 = await setupOrg()
    organization2 = orgData2.organization

    customerOtherOrg = await setupCustomer({
      organizationId: organization2.id,
      name: 'Alice Smith', // Same name as customer1 to test isolation
      email: 'alice-other@example.com',
      pricingModelId: orgData2.pricingModel.id,
    })
  })

  describe('search functionality', () => {
    it('should search by customer ID, email, or name (case-insensitive, trims whitespace)', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Test customer ID search (exact match)
        const resultById =
          await selectCustomersCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              searchQuery: customer1.id,
              filters: { organizationId: organization.id },
            },
            transaction,
          })
        expect(resultById.items.length).toBe(1)
        expect(resultById.items[0].customer.id).toBe(customer1.id)
        expect(resultById.total).toBe(1)

        // Test partial customer name search (case-insensitive)
        const resultByName =
          await selectCustomersCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'alice',
              filters: { organizationId: organization.id },
            },
            transaction,
          })
        expect(resultByName.items.length).toBe(1)
        expect(resultByName.items[0].customer.id).toBe(customer1.id)
        expect(resultByName.items[0].customer.name).toBe(
          'Alice Smith'
        )

        // Test partial email search (case-insensitive)
        const resultByEmail =
          await selectCustomersCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'bob@example',
              filters: { organizationId: organization.id },
            },
            transaction,
          })
        expect(resultByEmail.items.length).toBe(1)
        expect(resultByEmail.items[0].customer.id).toBe(customer2.id)
        expect(resultByEmail.items[0].customer.email).toBe(
          'bob@example.com'
        )

        // Test case-insensitive search
        const resultCaseInsensitive =
          await selectCustomersCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'CHARLIE',
              filters: { organizationId: organization.id },
            },
            transaction,
          })
        expect(resultCaseInsensitive.items.length).toBe(1)
        expect(resultCaseInsensitive.items[0].customer.name).toBe(
          'Charlie Brown'
        )

        // Test that search works (whitespace trimming is handled by buildAdditionalSearchClause for ID search,
        // but searchableColumns ILIKE search doesn't trim - this is expected behavior)
        // Note: The ID search in buildAdditionalSearchClause trims, so searching by ID with whitespace works
        const resultByIdWithWhitespace =
          await selectCustomersCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              searchQuery: `  ${customer1.id}  `,
              filters: { organizationId: organization.id },
            },
            transaction,
          })
        expect(resultByIdWithWhitespace.items.length).toBe(1)
        expect(resultByIdWithWhitespace.items[0].customer.id).toBe(
          customer1.id
        )
      })
    })

    it('should ignore empty or undefined search queries', async () => {
      await adminTransaction(async ({ transaction }) => {
        const resultEmpty =
          await selectCustomersCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              searchQuery: '',
              filters: { organizationId: organization.id },
            },
            transaction,
          })

        const resultUndefined =
          await selectCustomersCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              searchQuery: undefined,
              filters: { organizationId: organization.id },
            },
            transaction,
          })

        // Empty and undefined should return all 3 customers
        // Note: Whitespace-only queries (e.g., '   ') are not currently handled correctly
        // because constructSearchQueryClause doesn't trim the searchQuery before using it.
        // This is a known limitation that should be fixed in buildWhereClauses or constructSearchQueryClause.
        expect(resultEmpty.items.length).toBe(3)
        expect(resultEmpty.total).toBe(3)
        expect(resultUndefined.items.length).toBe(3)
        expect(resultUndefined.total).toBe(3)
      })
    })

    it('should only return customers for the specified organization', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Search for "Alice" - should only return customer1, not customerOtherOrg
        const result =
          await selectCustomersCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'alice',
              filters: { organizationId: organization.id },
            },
            transaction,
          })

        expect(result.items.length).toBe(1)
        expect(result.items[0].customer.id).toBe(customer1.id)
        expect(result.items[0].customer.organizationId).toBe(
          organization.id
        )
        expect(result.total).toBe(1)
      })
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle invalid inputs gracefully and maintain correct total count', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Test null/undefined searchQuery
        const resultUndefined =
          await selectCustomersCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              searchQuery: undefined,
              filters: { organizationId: organization.id },
            },
            transaction,
          })
        expect(resultUndefined.items.length).toBe(3)
        expect(resultUndefined.total).toBe(3)
      })
    })
  })
})

describe('selectCustomerPricingInfoBatch', () => {
  let organization: Organization.Record
  let pricingModel1: { id: string }
  let pricingModel2: { id: string }

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel1 = orgData.pricingModel

    pricingModel2 = await setupPricingModel({
      organizationId: organization.id,
      name: 'Second Pricing Model',
      isDefault: false,
    })
  })

  it('should return only id, pricingModelId, organizationId, livemode, archived fields', async () => {
    // Create 10 customers with different pricingModelIds
    // Track which customers have which pricing model
    const pricingModel1CustomerIds: string[] = []
    const pricingModel2CustomerIds: string[] = []

    for (let i = 0; i < 5; i++) {
      const customer = await setupCustomer({
        organizationId: organization.id,
        pricingModelId: pricingModel1.id,
      })
      pricingModel1CustomerIds.push(customer.id)
    }
    for (let i = 0; i < 5; i++) {
      const customer = await setupCustomer({
        organizationId: organization.id,
        pricingModelId: pricingModel2.id,
      })
      pricingModel2CustomerIds.push(customer.id)
    }

    const customerIds = [
      ...pricingModel1CustomerIds,
      ...pricingModel2CustomerIds,
    ]

    const result = await adminTransaction(async ({ transaction }) => {
      return selectCustomerPricingInfoBatch(customerIds, transaction)
    })

    // Verify all 10 customers returned
    expect(result.size).toBe(10)

    // Verify each customer has exactly 5 fields
    for (const [customerId, customerInfo] of result) {
      expect(Object.keys(customerInfo).sort()).toEqual([
        'archived',
        'id',
        'livemode',
        'organizationId',
        'pricingModelId',
      ])
      expect(customerInfo.id).toBe(customerId)
      expect(customerInfo.organizationId).toBe(organization.id)
      expect(typeof customerInfo.livemode).toBe('boolean')
      expect(typeof customerInfo.archived).toBe('boolean')
    }

    // Verify specific customer-to-pricingModel mapping
    for (const customerId of pricingModel1CustomerIds) {
      expect(result.get(customerId)?.pricingModelId).toBe(
        pricingModel1.id
      )
    }
    for (const customerId of pricingModel2CustomerIds) {
      expect(result.get(customerId)?.pricingModelId).toBe(
        pricingModel2.id
      )
    }
  })

  it('returns an empty result map when no customerIds are provided', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return selectCustomerPricingInfoBatch([], transaction)
    })

    expect(result.size).toBe(0)
    expect(result).toEqual(new Map())
  })

  it('should handle customers with different pricingModelIds', async () => {
    // Note: pricingModelId cannot be null in the database schema (notNullStringForeignKey)
    // setupCustomer automatically assigns default pricing model if undefined
    const customer1 = await setupCustomer({
      organizationId: organization.id,
      pricingModelId: pricingModel1.id,
    })
    const customer2 = await setupCustomer({
      organizationId: organization.id,
      pricingModelId: pricingModel2.id,
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return selectCustomerPricingInfoBatch(
        [customer1.id, customer2.id],
        transaction
      )
    })

    expect(result.size).toBe(2)
    expect(result.get(customer1.id)?.pricingModelId).toBe(
      pricingModel1.id
    )
    expect(result.get(customer2.id)?.pricingModelId).toBe(
      pricingModel2.id
    )
  })

  it('should batch fetch all customers in single query', async () => {
    // Create 100 customers
    const customerIds: string[] = []
    for (let i = 0; i < 100; i++) {
      const customer = await setupCustomer({
        organizationId: organization.id,
        pricingModelId:
          i % 2 === 0 ? pricingModel1.id : pricingModel2.id,
      })
      customerIds.push(customer.id)
    }

    const result = await adminTransaction(async ({ transaction }) => {
      return selectCustomerPricingInfoBatch(customerIds, transaction)
    })

    // Verify all 100 customers returned
    expect(result.size).toBe(100)

    // Verify all customer IDs are present
    for (const customerId of customerIds) {
      expect(result.has(customerId)).toBe(true)
    }
  })

  it('should handle mixed livemode values', async () => {
    // Create customers with different livemode values
    const customerLive = await setupCustomer({
      organizationId: organization.id,
      pricingModelId: pricingModel1.id,
      livemode: true,
    })
    const customerTest = await setupCustomer({
      organizationId: organization.id,
      pricingModelId: pricingModel1.id,
      livemode: false,
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return selectCustomerPricingInfoBatch(
        [customerLive.id, customerTest.id],
        transaction
      )
    })

    expect(result.size).toBe(2)
    expect(result.get(customerLive.id)?.livemode).toBe(true)
    expect(result.get(customerTest.id)?.livemode).toBe(false)
  })
})

describe('assertCustomerNotArchived', () => {
  it('throws ArchivedCustomerError for archived customer with the provided operation description', () => {
    const customer = {
      id: 'cust_test_123',
      archived: true,
    } as Customer.Record

    expect(() =>
      assertCustomerNotArchived(customer, 'create payment method')
    ).toThrow(ArchivedCustomerError)
    expect(() =>
      assertCustomerNotArchived(customer, 'create payment method')
    ).toThrow('Cannot create payment method for archived customer')
  })

  it('throws ArchivedCustomerError with different operation descriptions', () => {
    const customer = {
      id: 'cust_test_456',
      archived: true,
    } as Customer.Record

    expect(() =>
      assertCustomerNotArchived(customer, 'record usage event')
    ).toThrow('Cannot record usage event for archived customer')

    expect(() =>
      assertCustomerNotArchived(customer, 'create subscription')
    ).toThrow('Cannot create subscription for archived customer')
  })

  it('does not throw for non-archived customer (archived: false)', () => {
    const customer = {
      id: 'cust_test_789',
      archived: false,
    } as Customer.Record

    expect(() =>
      assertCustomerNotArchived(customer, 'create payment method')
    ).not.toThrow()
  })
})
