import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '@/../mocks/server'
import {
  setupCustomer,
  setupMemberships,
  setupOrg,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { ApiKey, CreateApiKeyInput } from '@/db/schema/apiKeys'
import type { Organization } from '@/db/schema/organizations'
import {
  insertApiKey,
  selectApiKeyById,
} from '@/db/tableMethods/apiKeyMethods'
import { updateMembership } from '@/db/tableMethods/membershipMethods'
import { updateOrganization } from '@/db/tableMethods/organizationMethods'
import { withAdminCacheContext } from '@/test-utils/transactionCallbacks'
import { FlowgladApiKeyType } from '@/types'
import core from '@/utils/core'
import {
  createSecretApiKeyTransaction,
  deleteSecretApiKeyTransaction,
  getApiKeyHeader,
} from './apiKeyHelpers'

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
          return createSecretApiKeyTransaction(
            input,
            withAdminCacheContext({
              transaction,
              userId,
              livemode: false,
              organizationId: organization.id,
            })
          )
        }
      )

      expect(result).toMatchObject({})
      expect(result.apiKey).toMatchObject({})
      expect(result.apiKey.name).toBe('Test API Key')
      expect(result.apiKey.type).toBe(FlowgladApiKeyType.Secret)
      expect(result.shownOnlyOnceKey).toMatchObject({})
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
          return createSecretApiKeyTransaction(
            input,
            withAdminCacheContext({
              transaction,
              userId,
              livemode: false,
              organizationId: organization.id,
            })
          )
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
          return createSecretApiKeyTransaction(
            input,
            withAdminCacheContext({
              transaction,
              userId,
              livemode: true,
              organizationId: organization.id,
            })
          )
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
          return createSecretApiKeyTransaction(
            input,
            withAdminCacheContext({
              transaction,
              userId,
              livemode: false,
              organizationId: organization.id,
            })
          )
        }
      )

      expect(result).toMatchObject({})
      expect(result.apiKey).toMatchObject({})
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
          return createSecretApiKeyTransaction(
            input,
            withAdminCacheContext({
              transaction,
              userId,
              livemode: true,
              organizationId: organization.id,
            })
          )
        })
      ).rejects.toThrow(
        'createSecretApiKeyTransaction: Only secret keys are supported. Received type: publishable'
      )
    })
  })

  describe('deleteSecretApiKeyTransaction', () => {
    /**
     * Tests for deleting secret API keys in livemode.
     */
    let secretApiKey: ApiKey.Record

    beforeEach(async () => {
      // Create a livemode secret API key for testing deletion
      secretApiKey = await adminTransaction(
        async ({ transaction }) => {
          return insertApiKey(
            {
              organizationId: organization.id,
              name: 'Test Secret API Key for Deletion',
              token: `live_sk_${core.nanoid()}`,
              type: FlowgladApiKeyType.Secret,
              active: true,
              livemode: true,
              hashText: `hash_${core.nanoid()}`,
            },
            transaction
          )
        }
      )
    })

    it('should successfully delete a secret API key', async () => {
      // Verify the key exists before deletion
      const keyBeforeDelete = await adminTransaction(
        async ({ transaction }) => {
          return selectApiKeyById(secretApiKey.id, transaction)
        }
      )
      expect(keyBeforeDelete.id).toBe(secretApiKey.id)

      // Delete the livemode API key
      await adminTransaction(async ({ transaction }) => {
        await deleteSecretApiKeyTransaction(
          { id: secretApiKey.id },
          withAdminCacheContext({
            transaction,
            userId,
            livemode: true,
            organizationId: organization.id,
          })
        )
      })

      // Verify the key no longer exists
      await expect(
        adminTransaction(async ({ transaction }) => {
          return selectApiKeyById(secretApiKey.id, transaction)
        })
      ).rejects.toThrow()
    })

    it('should throw an error if the API key does not exist', async () => {
      const nonExistentId = `apikey_${core.nanoid()}`

      await expect(
        adminTransaction(async ({ transaction }) => {
          await deleteSecretApiKeyTransaction(
            { id: nonExistentId },
            withAdminCacheContext({
              transaction,
              userId,
              livemode: true,
              organizationId: organization.id,
            })
          )
        })
      ).rejects.toThrow()
    })

    it('should throw an error if the API key is not a secret key', async () => {
      // Create a livemode publishable API key
      const publishableApiKey = await adminTransaction(
        async ({ transaction }) => {
          return insertApiKey(
            {
              organizationId: organization.id,
              name: 'Test Publishable API Key',
              token: `live_pk_${core.nanoid()}`,
              type: FlowgladApiKeyType.Publishable,
              active: true,
              livemode: true,
            },
            transaction
          )
        }
      )

      await expect(
        adminTransaction(async ({ transaction }) => {
          await deleteSecretApiKeyTransaction(
            { id: publishableApiKey.id },
            withAdminCacheContext({
              transaction,
              userId,
              livemode: true,
              organizationId: organization.id,
            })
          )
        })
      ).rejects.toThrow(
        'deleteSecretApiKeyTransaction: Only secret keys can be deleted. Received type: publishable'
      )
    })

    it('should successfully delete a secret API key without unkeyId', async () => {
      // Create a livemode legacy API key without unkeyId
      const legacyApiKey = await adminTransaction(
        async ({ transaction }) => {
          return insertApiKey(
            {
              organizationId: organization.id,
              name: 'Secret API Key without Unkey ID',
              token: `live_sk_${core.nanoid()}`,
              type: FlowgladApiKeyType.Secret,
              active: true,
              livemode: true,
              // No unkeyId - legacy key
              hashText: `hash_${core.nanoid()}`,
            },
            transaction
          )
        }
      )

      // Delete should succeed without calling Unkey
      await adminTransaction(async ({ transaction }) => {
        await deleteSecretApiKeyTransaction(
          { id: legacyApiKey.id },
          withAdminCacheContext({
            transaction,
            userId,
            livemode: true,
            organizationId: organization.id,
          })
        )
      })

      // Verify the key no longer exists
      await expect(
        adminTransaction(async ({ transaction }) => {
          return selectApiKeyById(legacyApiKey.id, transaction)
        })
      ).rejects.toThrow()
    })

    it('should successfully delete a secret API key without hashText', async () => {
      // Create a livemode API key without hashText
      const apiKeyNoHash = await adminTransaction(
        async ({ transaction }) => {
          return insertApiKey(
            {
              organizationId: organization.id,
              name: 'API Key Without Hash',
              token: `live_sk_nohash_${core.nanoid()}`,
              type: FlowgladApiKeyType.Secret,
              active: true,
              livemode: true,
              // No hashText
            },
            transaction
          )
        }
      )

      // Delete should succeed without Redis cache invalidation
      await adminTransaction(async ({ transaction }) => {
        await deleteSecretApiKeyTransaction(
          { id: apiKeyNoHash.id },
          withAdminCacheContext({
            transaction,
            userId,
            livemode: true,
            organizationId: organization.id,
          })
        )
      })

      // Verify the key no longer exists
      await expect(
        adminTransaction(async ({ transaction }) => {
          return selectApiKeyById(apiKeyNoHash.id, transaction)
        })
      ).rejects.toThrow()
    })

    it('should NOT delete the database record if Unkey deletion fails', async () => {
      // Configure MSW to return an error for deleteKey requests
      server.use(
        http.post('https://api.unkey.com/v2/keys.deleteKey', () => {
          return HttpResponse.json(
            {
              meta: { requestId: 'req_error_test' },
              error: {
                detail: 'Key not found',
                status: 404,
                title: 'Not Found',
                type: 'NOT_FOUND',
              },
            },
            { status: 404 }
          )
        })
      )

      // Create a livemode API key WITH a fake unkeyId
      const apiKeyWithUnkeyId = await adminTransaction(
        async ({ transaction }) => {
          return insertApiKey(
            {
              organizationId: organization.id,
              name: 'API Key With Fake Unkey ID',
              token: `live_sk_unkey_${core.nanoid()}`,
              type: FlowgladApiKeyType.Secret,
              active: true,
              livemode: true,
              unkeyId: `fake_unkey_id_${core.nanoid()}`, // Fake Unkey ID that will fail
              hashText: `hash_${core.nanoid()}`,
            },
            transaction
          )
        }
      )

      // Attempt to delete should fail because Unkey deletion will fail
      await expect(
        adminTransaction(async ({ transaction }) => {
          await deleteSecretApiKeyTransaction(
            { id: apiKeyWithUnkeyId.id },
            withAdminCacheContext({
              transaction,
              userId,
              livemode: true,
              organizationId: organization.id,
            })
          )
        })
      ).rejects.toThrow('Failed to delete API key from Unkey')

      // Verify the key STILL EXISTS in the database (deletion was aborted)
      const keyAfterFailedDelete = await adminTransaction(
        async ({ transaction }) => {
          return selectApiKeyById(apiKeyWithUnkeyId.id, transaction)
        }
      )
      expect(keyAfterFailedDelete.id).toBe(apiKeyWithUnkeyId.id)
      expect(keyAfterFailedDelete.name).toBe(
        'API Key With Fake Unkey ID'
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
