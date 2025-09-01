import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import {
  assignStackAuthHostedBillingUserIdToCustomersWithMatchingEmailButNoStackAuthHostedBillingUserId,
  updateCustomer,
  selectCustomerAndCustomerTableRows,
  setUserIdForCustomerRecords,
} from './customerMethods'
import { setupOrg, setupCustomer, setupUserAndApiKey } from '@/../seedDatabase'
import { selectCustomers } from './customerMethods'
import core from '@/utils/core'
import { InferredCustomerStatus, Customer } from '@/db/schema/customers'
import { setupPurchase } from '@/../seedDatabase'
import { Organization } from '@/db/schema/organizations'
import { UserRecord } from '@/db/schema/users'

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
  let user1: UserRecord
  let user2: UserRecord

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
    const org1Customer = updatedCustomers.find(c => c.organizationId === organization.id)
    const org2Customer = updatedCustomers.find(c => c.organizationId === organization2.id)
    
    expect(org1Customer?.userId).toBe(user1.id)
    expect(org2Customer?.userId).toBe(user1.id)
  })
})
