import { describe, it, expect, beforeEach } from 'vitest'
import { customerBillingPortalRouter } from './customerBillingPortalRouter'
import { setupOrg, setupCustomer } from '@/../seedDatabase'
import core from '@/utils/core'

describe('Customer Management Procedures', () => {
  let organizationId: string
  let customer1Id: string
  let customer2Id: string
  let customer3Id: string
  const testEmail = 'test@example.com'
  const otherEmail = 'other@example.com'
  const livemode = false

  beforeEach(async () => {
    // Set up organization using the helper function from seedDatabase.ts
    const orgSetup = await setupOrg()
    organizationId = orgSetup.organization.id

    // Create multiple customer profiles for the same email using setupCustomer from seedDatabase.ts
    // Use unique stripe customer IDs to avoid constraint violations
    const customer1 = await setupCustomer({
      email: testEmail,
      organizationId,
      stripeCustomerId: `cus_test_${core.nanoid()}`,
      livemode,
    })
    customer1Id = customer1.id

    const customer2 = await setupCustomer({
      email: testEmail,
      organizationId,
      stripeCustomerId: `cus_test_${core.nanoid()}`,
      livemode,
    })
    customer2Id = customer2.id

    // Create customer with different email using setupCustomer from seedDatabase.ts
    const customer3 = await setupCustomer({
      email: otherEmail,
      organizationId,
      stripeCustomerId: `cus_test_${core.nanoid()}`,
      livemode,
    })
    customer3Id = customer3.id
  })

  describe('getCustomersByEmail', () => {
    it('returns all customer profiles for email', async () => {
      // Create mock context with authenticated customer
      const mockCtx = {
        customer: { id: customer1Id, organizationId },
        organizationId,
        apiKey: 'test-api-key',
      }

      // Create a mock caller with the procedure
      const caller = customerBillingPortalRouter.createCaller(
        mockCtx as any
      )

      const result = await caller.getCustomersByEmail({
        email: testEmail,
        organizationId,
      })

      expect(result).toHaveLength(2)
      expect(result.map((c) => c.email)).toEqual([
        testEmail,
        testEmail,
      ])
      expect(result.map((c) => c.id).sort()).toEqual(
        [customer1Id, customer2Id].sort()
      )
    })

    it('filters by organizationId correctly', async () => {
      // Create another organization with same email customer using setupOrg and setupCustomer from seedDatabase.ts
      const otherOrgSetup = await setupOrg()
      const otherOrgId = otherOrgSetup.organization.id

      await setupCustomer({
        email: testEmail,
        organizationId: otherOrgId,
        stripeCustomerId: `cus_test_${core.nanoid()}`,
        livemode,
      })

      const mockCtx = {
        customer: { id: customer1Id, organizationId },
        organizationId,
        apiKey: 'test-api-key',
      }

      const caller = customerBillingPortalRouter.createCaller(
        mockCtx as any
      )

      const result = await caller.getCustomersByEmail({
        email: testEmail,
        organizationId,
      })

      // Should only return customers from the specified organization
      expect(result).toHaveLength(2)
      expect(
        result.every((c) => c.organizationId === organizationId)
      ).toBe(true)
    })

    it('returns empty array for non-existent email', async () => {
      const mockCtx = {
        customer: { id: customer1Id, organizationId },
        organizationId,
        apiKey: 'test-api-key',
      }

      const caller = customerBillingPortalRouter.createCaller(
        mockCtx as any
      )

      const result = await caller.getCustomersByEmail({
        email: 'nonexistent@example.com',
        organizationId,
      })

      expect(result).toHaveLength(0)
    })
  })

  describe('validateCustomerAccess', () => {
    it('returns customer for valid access', async () => {
      const mockCtx = {
        customer: {
          id: customer1Id,
          organizationId,
          email: testEmail,
          name: 'Test Customer 1',
        },
        organizationId,
        apiKey: 'test-api-key',
      }

      const caller = customerBillingPortalRouter.createCaller(
        mockCtx as any
      )

      const result = await caller.validateCustomerAccess({
        customerId: customer1Id,
        organizationId,
      })

      expect(result.id).toBe(customer1Id)
      expect(result.organizationId).toBe(organizationId)
    })

    it('throws error for wrong user', async () => {
      const mockCtx = {
        customer: {
          id: customer1Id,
          organizationId,
          email: testEmail,
          name: 'Test Customer 1',
        },
        organizationId,
        apiKey: 'test-api-key',
      }

      const caller = customerBillingPortalRouter.createCaller(
        mockCtx as any
      )

      await expect(
        caller.validateCustomerAccess({
          customerId: customer2Id, // Different customer ID
          organizationId,
        })
      ).rejects.toThrow('You do not have access to this customer')
    })

    it('throws error for wrong organization', async () => {
      const mockCtx = {
        customer: {
          id: customer1Id,
          organizationId,
          email: testEmail,
          name: 'Test Customer 1',
        },
        organizationId,
        apiKey: 'test-api-key',
      }

      const caller = customerBillingPortalRouter.createCaller(
        mockCtx as any
      )

      await expect(
        caller.validateCustomerAccess({
          customerId: customer1Id,
          organizationId: 'wrong-org-id',
        })
      ).rejects.toThrow(
        'Customer does not belong to this organization'
      )
    })

    it('throws error for non-existent customer', async () => {
      const mockCtx = {
        customer: {
          id: 'non-existent-id',
          organizationId,
          email: 'fake@example.com',
          name: 'Fake Customer',
        },
        organizationId,
        apiKey: 'test-api-key',
      }

      const caller = customerBillingPortalRouter.createCaller(
        mockCtx as any
      )

      await expect(
        caller.validateCustomerAccess({
          customerId: 'non-existent-id',
          organizationId,
        })
      ).rejects.toThrow()
    })
  })
})
