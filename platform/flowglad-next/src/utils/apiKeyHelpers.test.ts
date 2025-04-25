import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupCustomer,
  setupMemberships,
  setupOrg,
} from '../../seedDatabase'
import {
  createApiKeyTransaction,
  createBillingPortalApiKeyTransaction,
  verifyBillingPortalApiKeyTransaction,
} from './apiKeyHelpers'
import { FlowgladApiKeyType } from '@/types'
import { CreateApiKeyInput } from '@/db/schema/apiKeys'
import { Organization } from '@/db/schema/organizations'
import { User } from '@stackframe/stack'
import { insertCustomer } from '@/db/tableMethods/customerMethods'
import { insertApiKey } from '@/db/tableMethods/apiKeyMethods'
import {
  insertOrganization,
  updateOrganization,
} from '@/db/tableMethods/organizationMethods'
import {
  insertMembership,
  updateMembership,
} from '@/db/tableMethods/membershipMethods'

describe('apiKeyHelpers', () => {
  let organization: Organization.Record
  let userId: string
  let customerId: string
  let membershipId: string

  beforeEach(async () => {
    // Setup test data
    const orgSetup = await setupOrg()
    organization = orgSetup.organization

    // Create a test customer
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    customerId = customer.id

    // Create a test membership
    const membership = await setupMemberships({
      organizationId: organization.id,
    })
    membershipId = membership.id
    userId = membership.userId
  })

  describe('createApiKeyTransaction', () => {
    it('should successfully create an API key', async () => {
      const input: CreateApiKeyInput = {
        apiKey: {
          name: 'Test API Key',
          type: FlowgladApiKeyType.Secret,
        },
      }

      const result = await adminTransaction(
        async ({ transaction }) => {
          return createApiKeyTransaction(input, {
            transaction,
            userId,
            livemode: false,
          })
        }
      )

      expect(result).toBeDefined()
      expect(result.apiKey).toBeDefined()
      expect(result.apiKey.name).toBe('Test API Key')
      expect(result.apiKey.type).toBe(FlowgladApiKeyType.Secret)
      expect(result.shownOnlyOnceKey).toBeDefined()
    })

    it('should throw an error if no focused membership is found', async () => {
      // Delete the focused membership
      await adminTransaction(async ({ transaction }) => {
        // Update the membership to not be focused
        await updateMembership(
          {
            id: membershipId,
            focused: false,
          },
          transaction
        )
      })

      const input: CreateApiKeyInput = {
        apiKey: {
          name: 'Test API Key',
          type: FlowgladApiKeyType.Secret,
        },
      }

      await expect(
        adminTransaction(async ({ transaction }) => {
          return createApiKeyTransaction(input, {
            transaction,
            userId,
            livemode: false,
          })
        })
      ).rejects.toThrow('No focused membership found')
    })

    it('should throw an error when creating a livemode secret key for an organization without payouts enabled', async () => {
      // Update organization to have payouts disabled
      await adminTransaction(async ({ transaction }) => {
        await updateOrganization(
          {
            id: organization.id,
            payoutsEnabled: false,
          },
          transaction
        )
      })

      const input: CreateApiKeyInput = {
        apiKey: {
          name: 'Test API Key',
          type: FlowgladApiKeyType.Secret,
        },
      }

      await expect(
        adminTransaction(async ({ transaction }) => {
          return createApiKeyTransaction(input, {
            transaction,
            userId,
            livemode: true,
          })
        })
      ).rejects.toThrow(
        'createApiKey: Cannot create livemode secret key'
      )
    })

    it('should allow creating a test mode secret key even if payouts are not enabled', async () => {
      // Update organization to have payouts disabled
      await adminTransaction(async ({ transaction }) => {
        await updateOrganization(
          {
            id: organization.id,
            payoutsEnabled: false,
          },
          transaction
        )
      })

      const input: CreateApiKeyInput = {
        apiKey: {
          name: 'Test API Key',
          type: FlowgladApiKeyType.Secret,
        },
      }

      const result = await adminTransaction(
        async ({ transaction }) => {
          return createApiKeyTransaction(input, {
            transaction,
            userId,
            livemode: false,
          })
        }
      )

      expect(result).toBeDefined()
      expect(result.apiKey).toBeDefined()
      expect(result.apiKey.name).toBe('Test API Key')
    })

    it('should throw an error when trying to create a publishable key since they are not supported', async () => {
      // Update organization to have payouts disabled
      await adminTransaction(async ({ transaction }) => {
        await updateOrganization(
          {
            id: organization.id,
            payoutsEnabled: false,
          },
          transaction
        )
      })

      const input: CreateApiKeyInput = {
        apiKey: {
          name: 'Test API Key',
          type: FlowgladApiKeyType.Publishable,
        },
      }

      await expect(
        adminTransaction(async ({ transaction }) => {
          return createApiKeyTransaction(input, {
            transaction,
            userId,
            livemode: true,
          })
        })
      ).rejects.toThrow('Publishable keys are not supported')
    })
  })

  describe('createBillingPortalApiKeyTransaction', () => {
    it('should successfully create a billing portal API key', async () => {
      const params = {
        organization,
        stackAuthHostedBillingUserId: userId,
        livemode: false,
        name: 'Billing Portal Key',
      }

      const result = await adminTransaction(
        async ({ transaction }) => {
          return createBillingPortalApiKeyTransaction(
            params,
            transaction
          )
        }
      )

      expect(result).toBeDefined()
      expect(result.apiKey).toBeDefined()
      expect(result.apiKey.name).toBe('Billing Portal Key')
      expect(result.shownOnlyOnceKey).toBeDefined()
    })
  })

  describe('verifyBillingPortalApiKeyTransaction', () => {
    it('should successfully verify and create a billing portal API key', async () => {
      const params = {
        organizationId: organization.id,
        livemode: false,
        user: { id: userId } as Pick<User, 'id'>,
      }

      const result = await adminTransaction(
        async ({ transaction }) => {
          return verifyBillingPortalApiKeyTransaction(
            params,
            transaction
          )
        }
      )

      expect(result).toBeDefined()
      expect(result?.apiKey).toBeDefined()
      expect(result?.apiKey.name).toContain('Billing Portal Key')
      expect(result?.shownOnlyOnceKey).toBeDefined()
    })

    // it('should return null if no customer is found', async () => {
    //   // Delete the customer
    //   await adminTransaction(async ({ transaction }) => {
    //     await deleteCustomer(
    //       {
    //         id: customerId,
    //       },
    //       transaction
    //     )
    //   })

    //   const params = {
    //     organizationId: organization.id,
    //     livemode: false,
    //     user: { id: userId } as Pick<User, 'id'>,
    //   }

    //   const result = await adminTransaction(
    //     async ({ transaction }) => {
    //       return verifyBillingPortalApiKeyTransaction(
    //         params,
    //         transaction
    //       )
    //     }
    //   )

    //   expect(result).toBeNull()
    // })
  })
})
