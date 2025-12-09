import { beforeEach, describe, expect, it } from 'vitest'
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
import core from '@/utils/core'
import {
  assignStackAuthHostedBillingUserIdToCustomersWithMatchingEmailButNoStackAuthHostedBillingUserId,
  type CustomersTableFilters,
  insertCustomer,
  selectCustomerById,
  selectCustomers,
  selectCustomersCursorPaginatedWithTableRowData,
  selectDistinctCustomerPricingModelNames,
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

describe('selectDistinctCustomerPricingModelNames', () => {
  let organization: Organization.Record
  let organization2: Organization.Record
  let pricingModel: { id: string; name: string }
  let pricingModel2: { id: string; name: string }
  let pricingModel3: { id: string; name: string }
  let customer: Customer.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel

    customer = await setupCustomer({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
    })

    // Setup second organization for isolation tests
    const orgData2 = await setupOrg()
    organization2 = orgData2.organization
    pricingModel2 = orgData2.pricingModel
  })

  it('should return empty array when organization has no customers', async () => {
    // Create a fresh organization without any customers
    const freshOrgData = await setupOrg()
    await adminTransaction(async ({ transaction }) => {
      const result = await selectDistinctCustomerPricingModelNames(
        freshOrgData.organization.id,
        transaction
      )
      expect(result).toEqual([])
    })
  })

  it('should return deduplicated, case-insensitively ordered pricing model names for the given organization', async () => {
    // Create multiple pricing models with different names (including case variations)
    pricingModel3 = await setupPricingModel({
      organizationId: organization.id,
      name: 'zebra Pricing Model',
      isDefault: false,
    })

    const pricingModel4 = await setupPricingModel({
      organizationId: organization.id,
      name: 'Apple Pricing Model',
      isDefault: false,
    })

    const pricingModel5 = await setupPricingModel({
      organizationId: organization.id,
      name: 'Banana Pricing Model',
      isDefault: false,
    })

    // Create customers with different pricing models - some with same pricing model to test deduplication
    await setupCustomer({
      organizationId: organization.id,
      pricingModelId: pricingModel.id, // Default pricing model
    })

    await setupCustomer({
      organizationId: organization.id,
      pricingModelId: pricingModel3.id,
    })

    await setupCustomer({
      organizationId: organization.id,
      pricingModelId: pricingModel4.id,
    })

    // Add another customer with pricingModel4 to verify deduplication
    await setupCustomer({
      organizationId: organization.id,
      pricingModelId: pricingModel4.id,
    })

    await setupCustomer({
      organizationId: organization.id,
      pricingModelId: pricingModel5.id,
    })

    await adminTransaction(async ({ transaction }) => {
      const result = await selectDistinctCustomerPricingModelNames(
        organization.id,
        transaction
      )
      // Should be deduplicated (Apple appears only once despite 2 customers)
      // Should be case-insensitively sorted (Apple, Banana, Flowglad Test Pricing Model, zebra)
      expect(result.length).toBeGreaterThanOrEqual(4)
      expect(result).toContain('Apple Pricing Model')
      expect(result).toContain('Banana Pricing Model')
      expect(result).toContain('zebra Pricing Model')
      // Verify case-insensitive sorting
      const appleIndex = result.indexOf('Apple Pricing Model')
      const bananaIndex = result.indexOf('Banana Pricing Model')
      const zebraIndex = result.indexOf('zebra Pricing Model')
      expect(appleIndex).toBeLessThan(bananaIndex)
      expect(bananaIndex).toBeLessThan(zebraIndex)
    })
  })

  it('should only return pricing models for the given organization', async () => {
    const pricingModelOrg1 = await setupPricingModel({
      organizationId: organization.id,
      name: 'Org1 Pricing Model',
      isDefault: false,
    })

    const pricingModelOrg2 = await setupPricingModel({
      organizationId: organization2.id,
      name: 'Org2 Pricing Model',
      isDefault: false,
    })

    await setupCustomer({
      organizationId: organization.id,
      pricingModelId: pricingModelOrg1.id,
    })

    await setupCustomer({
      organizationId: organization2.id,
      pricingModelId: pricingModelOrg2.id,
    })

    await adminTransaction(async ({ transaction }) => {
      const result1 = await selectDistinctCustomerPricingModelNames(
        organization.id,
        transaction
      )
      expect(result1).toContain('Org1 Pricing Model')
      expect(result1).not.toContain('Org2 Pricing Model')

      const result2 = await selectDistinctCustomerPricingModelNames(
        organization2.id,
        transaction
      )
      expect(result2).toContain('Org2 Pricing Model')
      expect(result2).not.toContain('Org1 Pricing Model')
    })
  })
})

describe('selectCustomersCursorPaginatedWithTableRowData', () => {
  let organization: Organization.Record
  let organization2: Organization.Record
  let pricingModel: { id: string; name: string }
  let pricingModel2: { id: string; name: string }
  let pricingModel3: { id: string; name: string }
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

    // Setup additional pricing models for filter testing
    pricingModel2 = await setupPricingModel({
      organizationId: organization.id,
      name: 'Premium Plan',
      isDefault: false,
    })

    pricingModel3 = await setupPricingModel({
      organizationId: organization.id,
      name: 'Basic Plan',
      isDefault: false,
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

  describe('pricingModelName filter functionality', () => {
    it('should filter by pricing model name (exact match, trims whitespace)', async () => {
      // Create customers with different pricing models
      const customerPremium = await setupCustomer({
        organizationId: organization.id,
        name: 'Premium Customer',
        email: 'premium@example.com',
        pricingModelId: pricingModel2.id, // Premium Plan
      })

      const customerBasic = await setupCustomer({
        organizationId: organization.id,
        name: 'Basic Customer',
        email: 'basic@example.com',
        pricingModelId: pricingModel3.id, // Basic Plan
      })

      await adminTransaction(async ({ transaction }) => {
        // Test Premium Plan filter
        const resultPremium =
          await selectCustomersCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              filters: {
                organizationId: organization.id,
                pricingModelName: 'Premium Plan',
              } as CustomersTableFilters,
            },
            transaction,
          })

        expect(resultPremium.items.length).toBe(1)
        expect(resultPremium.items[0].customer.id).toBe(
          customerPremium.id
        )
        expect(resultPremium.total).toBe(1)

        // Test Basic Plan filter
        const resultBasic =
          await selectCustomersCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              filters: {
                organizationId: organization.id,
                pricingModelName: 'Basic Plan',
              } as CustomersTableFilters,
            },
            transaction,
          })

        expect(resultBasic.items.length).toBe(1)
        expect(resultBasic.items[0].customer.id).toBe(
          customerBasic.id
        )
        expect(resultBasic.total).toBe(1)

        // Test whitespace trimming
        const resultTrimmed =
          await selectCustomersCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              filters: {
                organizationId: organization.id,
                pricingModelName: '  Premium Plan  ',
              } as CustomersTableFilters,
            },
            transaction,
          })

        expect(resultTrimmed.items.length).toBe(1)
        expect(resultTrimmed.total).toBe(1)
      })
    })

    it('should ignore empty or whitespace-only pricing model name filters', async () => {
      await adminTransaction(async ({ transaction }) => {
        const resultEmpty =
          await selectCustomersCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              filters: {
                organizationId: organization.id,
                pricingModelName: '',
              } as CustomersTableFilters,
            },
            transaction,
          })

        const resultWhitespace =
          await selectCustomersCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              filters: {
                organizationId: organization.id,
                pricingModelName: '   ',
              } as CustomersTableFilters,
            },
            transaction,
          })

        const resultNoFilter =
          await selectCustomersCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              filters: {
                organizationId: organization.id,
              },
            },
            transaction,
          })

        // All should return all customers
        expect(resultEmpty.items.length).toBe(3)
        expect(resultEmpty.total).toBe(3)
        expect(resultWhitespace.items.length).toBe(3)
        expect(resultWhitespace.total).toBe(3)
        expect(resultNoFilter.items.length).toBe(3)
        expect(resultNoFilter.total).toBe(3)
      })
    })

    it('should only return customers for the specified organization when filtering by pricing model name', async () => {
      // Create pricing model in organization2 with same name
      const pricingModelOrg2 = await setupPricingModel({
        organizationId: organization2.id,
        name: 'Premium Plan', // Same name as pricingModel2
        isDefault: false,
      })

      const customerOrg2Premium = await setupCustomer({
        organizationId: organization2.id,
        name: 'Org2 Premium Customer',
        email: 'org2premium@example.com',
        pricingModelId: pricingModelOrg2.id,
      })

      const customerOrg1Premium = await setupCustomer({
        organizationId: organization.id,
        name: 'Org1 Premium Customer',
        email: 'org1premium@example.com',
        pricingModelId: pricingModel2.id,
      })

      await adminTransaction(async ({ transaction }) => {
        // Filter by "Premium Plan" - should only return customers from organization, not organization2
        const result =
          await selectCustomersCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              filters: {
                organizationId: organization.id,
                pricingModelName: 'Premium Plan',
              } as CustomersTableFilters,
            },
            transaction,
          })

        expect(result.items.length).toBe(1)
        result.items.forEach((item) => {
          expect(item.customer.organizationId).toBe(organization.id)
        })
        expect(result.items[0].customer.id).toBe(
          customerOrg1Premium.id
        )
        expect(result.total).toBe(1)
      })
    })
  })

  describe('combined search and filter functionality', () => {
    it('should combine search query and pricing model name filter with AND semantics', async () => {
      // Create customers with different pricing models and names
      const customerPremiumAlice = await setupCustomer({
        organizationId: organization.id,
        name: 'Alice Premium',
        email: 'alice.premium@example.com',
        pricingModelId: pricingModel2.id, // Premium Plan
      })

      const customerPremiumBob = await setupCustomer({
        organizationId: organization.id,
        name: 'Bob Premium',
        email: 'bob.premium@example.com',
        pricingModelId: pricingModel2.id, // Premium Plan
      })

      const customerBasicAlice = await setupCustomer({
        organizationId: organization.id,
        name: 'Alice Basic',
        email: 'alice.basic@example.com',
        pricingModelId: pricingModel3.id, // Basic Plan
      })

      await adminTransaction(async ({ transaction }) => {
        // Test search + filter combination - should only return Alice Premium
        const result =
          await selectCustomersCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'alice',
              filters: {
                organizationId: organization.id,
                pricingModelName: 'Premium Plan',
              } as CustomersTableFilters,
            },
            transaction,
          })

        expect(result.items.length).toBe(1)
        expect(result.items[0].customer.id).toBe(
          customerPremiumAlice.id
        )
        expect(result.items[0].customer.name).toBe('Alice Premium')
        expect(result.total).toBe(1)

        // Test pagination with search + filter
        const page1 =
          await selectCustomersCursorPaginatedWithTableRowData({
            input: {
              pageSize: 1,
              searchQuery: 'bob',
              filters: {
                organizationId: organization.id,
                pricingModelName: 'Premium Plan',
              } as CustomersTableFilters,
            },
            transaction,
          })

        expect(page1.items.length).toBe(1)
        expect(page1.total).toBe(1) // Only customerPremiumBob matches
        expect(page1.hasNextPage).toBe(false)
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

        // Test non-string pricingModelName
        const resultInvalidPricingModel =
          await selectCustomersCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              filters: {
                organizationId: organization.id,
                // @ts-expect-error - Testing invalid input: pricingModelName should be string, not number
                pricingModelName: 123, // Non-string value
              },
            },
            transaction,
          })
        // Should ignore the invalid pricingModelName and return all customers
        expect(resultInvalidPricingModel.items.length).toBe(3)
        expect(resultInvalidPricingModel.total).toBe(3)

        // Test total count accuracy with search + filter
        const customerPremium = await setupCustomer({
          organizationId: organization.id,
          name: 'Premium Alice',
          email: 'premium.alice@example.com',
          pricingModelId: pricingModel2.id,
        })

        const resultWithFilters =
          await selectCustomersCursorPaginatedWithTableRowData({
            input: {
              pageSize: 1, // Small page size
              searchQuery: 'alice',
              filters: {
                organizationId: organization.id,
                pricingModelName: 'Premium Plan',
              } as CustomersTableFilters,
            },
            transaction,
          })

        // Should return 1 item but total should be 1 (not items.length)
        expect(resultWithFilters.items.length).toBe(1)
        expect(resultWithFilters.total).toBe(1)
        expect(resultWithFilters.hasNextPage).toBe(false)
      })
    })
  })
})
