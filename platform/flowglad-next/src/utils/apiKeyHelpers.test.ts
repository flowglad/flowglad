import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupCustomer,
  setupMemberships,
  setupOrg,
} from '../../seedDatabase'
import {
  createSecretApiKeyTransaction,
  createBillingPortalApiKeyTransaction,
  verifyBillingPortalApiKeyTransaction,
} from './apiKeyHelpers'
import { FlowgladApiKeyType } from '@/types'
import { CreateApiKeyInput } from '@/db/schema/apiKeys'
import { Organization } from '@/db/schema/organizations'
import { updateCustomer } from '@/db/tableMethods/customerMethods'
import { updateOrganization } from '@/db/tableMethods/organizationMethods'
import { updateMembership } from '@/db/tableMethods/membershipMethods'
import { nanoid } from './core'
import { User } from '@/db/schema/users'

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

  describe('createSecretApiKeyTransaction', () => {
    it('should successfully create an API key', async () => {
      const input: CreateApiKeyInput = {
        apiKey: {
          name: 'Test API Key',
          type: FlowgladApiKeyType.Secret,
        },
      }

      const result = await adminTransaction(
        async ({ transaction }) => {
          return createSecretApiKeyTransaction(input, {
            transaction,
            userId,
            livemode: false,
            organizationId: organization.id,
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
          return createSecretApiKeyTransaction(input, {
            transaction,
            userId,
            livemode: false,
            organizationId: organization.id,
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
          return createSecretApiKeyTransaction(input, {
            transaction,
            userId,
            livemode: true,
            organizationId: organization.id,
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
          return createSecretApiKeyTransaction(input, {
            transaction,
            userId,
            livemode: false,
            organizationId: organization.id,
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
          // @ts-expect-error - we know that publishable keys are not supported
          type: FlowgladApiKeyType.Publishable,
        },
      }

      await expect(
        adminTransaction(async ({ transaction }) => {
          return createSecretApiKeyTransaction(input, {
            transaction,
            userId,
            livemode: true,
            organizationId: organization.id,
          })
        })
      ).rejects.toThrow(
        'createSecretApiKeyTransaction: Only secret keys are supported. Received type: publishable'
      )
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
      const newId = nanoid()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const params = {
        organizationId: organization.id,
        livemode: customer.livemode,
        user: { id: newId } as Pick<User.Record, 'id'>,
      }
      const result = await adminTransaction(
        async ({ transaction }) => {
          await updateCustomer(
            {
              id: customer.id,
              stackAuthHostedBillingUserId: newId,
            },
            transaction
          )
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
