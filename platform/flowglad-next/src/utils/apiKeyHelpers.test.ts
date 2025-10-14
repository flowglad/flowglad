import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupCustomer,
  setupMemberships,
  setupOrg,
} from '@/../seedDatabase'
import {
  createSecretApiKeyTransaction,
  getApiKeyHeader,
} from './apiKeyHelpers'
import { FlowgladApiKeyType } from '@/types'
import { CreateApiKeyInput } from '@/db/schema/apiKeys'
import { Organization } from '@/db/schema/organizations'
import { updateOrganization } from '@/db/tableMethods/organizationMethods'
import { updateMembership } from '@/db/tableMethods/membershipMethods'

describe('apiKeyHelpers', () => {
  let organization: Organization.Record
  let userId: string
  let membershipId: string

  beforeEach(async () => {
    // Setup test data
    const orgSetup = await setupOrg()
    organization = orgSetup.organization

    // Create a test customer
    const customer = await setupCustomer({
      organizationId: organization.id,
    })

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

describe('getApiKeyHeader', () => {
  it('returns the key when header is "Bearer <key>"', () => {
    const authorizationHeader = 'Bearer 1234567890'
    const apiKey = getApiKeyHeader(authorizationHeader)
    expect(apiKey).toBe('1234567890')
  })

  it('accepts a raw key when there is no space', () => {
    const authorizationHeader = '1234567890'
    const apiKey = getApiKeyHeader(authorizationHeader)
    expect(apiKey).toBe('1234567890')
  })

  it('trims surrounding whitespace before processing', () => {
    expect(getApiKeyHeader('   1234567890   ')).toBe('1234567890')
    expect(getApiKeyHeader('   Bearer 1234567890   ')).toBe(
      '1234567890'
    )
  })

  it('rejects non-Bearer authorization schemes that contain spaces', () => {
    expect(getApiKeyHeader('Basic abcdef')).toBeNull()
    expect(getApiKeyHeader('Token 123')).toBeNull()
    expect(getApiKeyHeader('ApiKey 123')).toBeNull()
  })

  it('rejects multi-word headers that do not start with "Bearer "', () => {
    expect(getApiKeyHeader('Foo Bar Baz')).toBeNull()
    expect(getApiKeyHeader('Bearer: 123')).toBeNull()
  })

  it('returns "Bearer" when header is exactly "Bearer" (no space)', () => {
    expect(getApiKeyHeader('Bearer')).toBe('Bearer')
  })

  it('returns the entire string when there is no space and not Bearer prefix', () => {
    expect(getApiKeyHeader('Bearer123')).toBe('Bearer123')
  })

  it('does not trim the extracted key beyond the single Bearer space', () => {
    // Current logic slices right after 'Bearer ' and does not trim the remainder
    expect(getApiKeyHeader('Bearer    123')).toBe('   123')
  })
})
