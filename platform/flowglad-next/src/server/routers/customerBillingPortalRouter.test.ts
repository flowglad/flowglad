import { describe, it, expect, beforeEach, vi } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import { TRPCError } from '@trpc/server'
import { customerBillingPortalRouter } from './customerBillingPortalRouter'
import { insertCustomer } from '@/db/tableMethods/customerMethods'
import { insertOrganization } from '@/db/tableMethods/organizationMethods'
import {
  CurrencyCode,
  BusinessOnboardingStatus,
  StripeConnectContractType,
  CountryCode,
} from '@/types'
import core from '@/utils/core'
import { selectCountries } from '@/db/tableMethods/countryMethods'
import { countries } from '@/db/schema/countries'
import db from '@/db/client'

describe('Customer Management Procedures', () => {
  let organizationId: string
  let customer1Id: string
  let customer2Id: string
  let customer3Id: string
  const testEmail = 'test@example.com'
  const otherEmail = 'other@example.com'
  const livemode = false

  beforeEach(async () => {
    // Insert country if it doesn't exist
    await db
      .insert(countries)
      .values([
        {
          id: core.nanoid(),
          name: 'United States',
          code: CountryCode.US,
        },
      ])
      .onConflictDoNothing()

    // Set up test data
    await adminTransaction(async ({ transaction }) => {
      // Get country
      const [country] = await selectCountries({}, transaction)

      // Create organization with all required fields
      const organization = await insertOrganization(
        {
          name: 'Test Organization',
          countryId: country.id,
          defaultCurrency: CurrencyCode.USD,
          onboardingStatus: BusinessOnboardingStatus.FullyOnboarded,
          stripeConnectContractType:
            StripeConnectContractType.Platform,
          featureFlags: {},
        },
        transaction
      )
      organizationId = organization.id

      // Create multiple customer profiles for the same email
      const customer1 = await insertCustomer(
        {
          email: testEmail,
          name: 'Test Customer 1',
          organizationId,
          externalId: 'cust_1',
          stripeCustomerId: 'stripe_cust_1',
          livemode,
        },
        transaction
      )
      customer1Id = customer1.id

      const customer2 = await insertCustomer(
        {
          email: testEmail,
          name: 'Test Customer 2',
          organizationId,
          externalId: 'cust_2',
          stripeCustomerId: 'stripe_cust_2',
          livemode,
        },
        transaction
      )
      customer2Id = customer2.id

      // Create customer with different email
      const customer3 = await insertCustomer(
        {
          email: otherEmail,
          name: 'Other Customer',
          organizationId,
          externalId: 'cust_3',
          stripeCustomerId: 'stripe_cust_3',
          livemode,
        },
        transaction
      )
      customer3Id = customer3.id
    })
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
      const caller = {
        getCustomersByEmail: customerBillingPortalRouter.createCaller(
          mockCtx as any
        ).getCustomersByEmail,
      }

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
      // Create another organization with same email customer
      const otherOrgId = await adminTransaction(
        async ({ transaction }) => {
          const [country] = await selectCountries({}, transaction)
          const otherOrg = await insertOrganization(
            {
              name: 'Other Organization',
              countryId: country.id,
              defaultCurrency: CurrencyCode.USD,
              onboardingStatus:
                BusinessOnboardingStatus.FullyOnboarded,
              stripeConnectContractType:
                StripeConnectContractType.Platform,
              featureFlags: {},
            },
            transaction
          )

          await insertCustomer(
            {
              email: testEmail,
              name: 'Customer in Other Org',
              organizationId: otherOrg.id,
              externalId: 'cust_other',
              stripeCustomerId: 'stripe_cust_other',
              livemode,
            },
            transaction
          )

          return otherOrg.id
        }
      )

      const mockCtx = {
        customer: { id: customer1Id, organizationId },
        organizationId,
        apiKey: 'test-api-key',
      }

      const caller = {
        getCustomersByEmail: customerBillingPortalRouter.createCaller(
          mockCtx as any
        ).getCustomersByEmail,
      }

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

      const caller = {
        getCustomersByEmail: customerBillingPortalRouter.createCaller(
          mockCtx as any
        ).getCustomersByEmail,
      }

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

      const caller = {
        validateCustomerAccess:
          customerBillingPortalRouter.createCaller(mockCtx as any)
            .validateCustomerAccess,
      }

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

      const caller = {
        validateCustomerAccess:
          customerBillingPortalRouter.createCaller(mockCtx as any)
            .validateCustomerAccess,
      }

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

      const caller = {
        validateCustomerAccess:
          customerBillingPortalRouter.createCaller(mockCtx as any)
            .validateCustomerAccess,
      }

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

      const caller = {
        validateCustomerAccess:
          customerBillingPortalRouter.createCaller(mockCtx as any)
            .validateCustomerAccess,
      }

      await expect(
        caller.validateCustomerAccess({
          customerId: 'non-existent-id',
          organizationId,
        })
      ).rejects.toThrow()
    })
  })
})
