import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import {
  assignStackAuthHostedBillingUserIdToCustomersWithMatchingEmailButNoStackAuthHostedBillingUserId,
  updateCustomer,
  selectCustomerAndCustomerTableRows,
  setUserIdForCustomerRecords,
  selectCustomerById,
  insertCustomer,
} from './customerMethods'
import {
  setupOrg,
  setupCustomer,
  setupUserAndApiKey,
} from '@/../seedDatabase'
import { selectCustomers } from './customerMethods'
import core from '@/utils/core'
import {
  InferredCustomerStatus,
  Customer,
  customers,
} from '@/db/schema/customers'
import { setupPurchase } from '@/../seedDatabase'
import { Organization } from '@/db/schema/organizations'
import { User } from '@/db/schema/users'

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

describe('Customer uniqueness constraints', () => {
  let organization1: Organization.Record
  let organization2: Organization.Record

  beforeEach(async () => {
    // Set up two organizations for testing cross-org scenarios
    const org1Data = await setupOrg()
    organization1 = org1Data.organization

    const org2Data = await setupOrg()
    organization2 = org2Data.organization
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
      expect(customer1).toBeDefined()
      expect(customer2).toBeDefined()
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
      expect(customerLive).toBeDefined()
      expect(customerTest).toBeDefined()
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

      expect(customer1).toBeDefined()
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
      expect(customer1).toBeDefined()
      expect(customer2).toBeDefined()
      expect(customer3).toBeDefined()

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
            },
            transaction
          )
        }
      )

      expect(customer1).toBeDefined()
      expect(customer1.externalId).toBe(sharedExternalId)

      // Attempt to create duplicate using raw insert
      await expect(
        adminTransaction(async ({ transaction }) => {
          await transaction.insert(customers).values({
            id: `cust_${core.nanoid()}`,
            organizationId: organization1.id,
            externalId: sharedExternalId,
            email: `customer2_${core.nanoid()}@test.com`,
            name: 'Customer 2',
            livemode: true,
            createdAt: new Date(),
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
            createdAt: new Date(),
            updatedAt: new Date(),
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
            },
            transaction
          )
        }
      )

      // Verify both customers were created successfully
      expect(customer1).toBeDefined()
      expect(customer2).toBeDefined()
      expect(customer1.invoiceNumberBase).toBe(sharedInvoiceBase)
      expect(customer2.invoiceNumberBase).toBe(sharedInvoiceBase)
      expect(customer1.organizationId).not.toBe(
        customer2.organizationId
      )
    })

    it('should allow customers with the same invoiceNumberBase in same organization but different livemode', async () => {
      const sharedInvoiceBase = `INV${core.nanoid().slice(0, 6)}`

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
            },
            transaction
          )
        }
      )

      // Verify both customers were created successfully
      expect(customerLive).toBeDefined()
      expect(customerTest).toBeDefined()
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
            },
            transaction
          )
        }
      )

      expect(customer1).toBeDefined()
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
      expect(customer1.invoiceNumberBase).toBeDefined()
      expect(customer2.invoiceNumberBase).toBeDefined()
      expect(customer3.invoiceNumberBase).toBeDefined()
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
    it('should enforce global uniqueness for stripeCustomerId across all organizations', async () => {
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
            },
            transaction
          )
        }
      )

      expect(customer1).toBeDefined()
      expect(customer1.stripeCustomerId).toBe(stripeCustomerId)

      // Attempt to create customer with same stripeCustomerId in different organization
      await expect(
        adminTransaction(async ({ transaction }) => {
          await insertCustomer(
            {
              organizationId: organization2.id, // Different organization
              externalId: `ext_${core.nanoid()}`,
              email: `customer2_${core.nanoid()}@test.com`,
              name: 'Customer 2',
              stripeCustomerId: stripeCustomerId, // Same Stripe ID
              livemode: true,
            },
            transaction
          )
        })
      ).rejects.toThrow()
    })

    it('should enforce global uniqueness for stripeCustomerId across livemode values', async () => {
      const stripeCustomerId = `cus_${core.nanoid()}`

      // Create customer with stripeCustomerId with livemode=true
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
            },
            transaction
          )
        }
      )

      expect(customer1).toBeDefined()
      expect(customer1.stripeCustomerId).toBe(stripeCustomerId)

      // Attempt to create customer with same stripeCustomerId with livemode=false
      await expect(
        adminTransaction(async ({ transaction }) => {
          await insertCustomer(
            {
              organizationId: organization1.id,
              externalId: `ext_${core.nanoid()}`,
              email: `customer2_${core.nanoid()}@test.com`,
              name: 'Customer 2',
              stripeCustomerId: stripeCustomerId, // Same Stripe ID
              livemode: false, // Different livemode
            },
            transaction
          )
        })
      ).rejects.toThrow()
    })

    it('should allow multiple customers with different stripeCustomerIds', async () => {
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
            },
            transaction
          )
        }
      )

      // Verify all customers were created successfully
      expect(customer1).toBeDefined()
      expect(customer2).toBeDefined()
      expect(customer3).toBeDefined()

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
              // Explicitly not including stripeCustomerId to get null
            },
            transaction
          )
        }
      )

      // Verify all customers were created successfully with null stripeCustomerId
      expect(customer1).toBeDefined()
      expect(customer2).toBeDefined()
      expect(customer3).toBeDefined()
      expect(customer1.stripeCustomerId).toBeNull()
      expect(customer2.stripeCustomerId).toBeNull()
      expect(customer3.stripeCustomerId).toBeNull()
    })

    it('should prevent updating to a duplicate stripeCustomerId', async () => {
      const stripeId1 = `cus_${core.nanoid()}`
      const stripeId2 = `cus_${core.nanoid()}`

      // Create two customers with different stripeCustomerIds
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
              stripeCustomerId: stripeId2,
              livemode: true,
            },
            transaction
          )
        }
      )

      // Attempt to update customer2 to have customer1's stripeCustomerId
      await expect(
        adminTransaction(async ({ transaction }) => {
          await updateCustomer(
            {
              id: customer2.id,
              stripeCustomerId: stripeId1, // This should violate the constraint
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
