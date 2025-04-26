import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import { setupOrg } from '../../../seedDatabase'
import { FlowgladApiKeyType } from '@/types'
import { nanoid } from '@/utils/core'
import {
  insertApiKey,
  select7DaysExpiredBillingPortalApiKeys,
  safelyFilterExpiredBillingPortalApiKeys,
} from './apiKeyMethods'
import { ApiKey } from '../schema/apiKeys'

describe('apiKeyMethods.ts', () => {
  let organization: any

  beforeEach(async () => {
    const setup = await setupOrg()
    organization = setup.organization
  })

  describe('select7DaysExpiredBillingPortalApiKeys', () => {
    it('only returns billing portal tokens expired > 7 days ago', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Core input for billing portal token API keys
        const coreBillingPortalTokenApiKeyInput = {
          organizationId: organization.id,
          type: FlowgladApiKeyType.BillingPortalToken,
          livemode: true,
          name: 'billing-portal-token',
          stackAuthHostedBillingUserId:
            'stack-auth-hosted-billing-user-id',
        }

        // Insert various API keys
        const expiredToken1 = `expired-8-days-ago-${nanoid()}`
        await insertApiKey(
          {
            ...coreBillingPortalTokenApiKeyInput,
            expiresAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000), // 8 days ago
            token: expiredToken1,
            unkeyId: `expired-8-days-ago-${nanoid()}`,
            name: 'expired-8-days-ago',
          },
          transaction
        )

        await insertApiKey(
          {
            ...coreBillingPortalTokenApiKeyInput,
            expiresAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
            token: `expired-3-days-ago-${nanoid()}`,
            unkeyId: `expired-3-days-ago-${nanoid()}`,
            name: 'expired-3-days-ago',
          },
          transaction
        )

        await insertApiKey(
          {
            ...coreBillingPortalTokenApiKeyInput,
            expiresAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // 1 day in future
            token: `expires-in-future-${nanoid()}`,
            unkeyId: `expires-in-future-${nanoid()}`,
            name: 'expires-in-future',
          },
          transaction
        )

        // Core input for secret API keys
        const coreSecretApikeyInput = {
          organizationId: organization.id,
          type: FlowgladApiKeyType.Secret,
          livemode: true,
          name: 'secret-key',
          stackAuthHostedBillingUserId:
            'stack-auth-hosted-billing-user-id',
        }

        await insertApiKey(
          {
            ...coreSecretApikeyInput,
            expiresAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
            token: `wrong-type-${nanoid()}`,
            unkeyId: `wrong-type-${nanoid()}`,
            name: 'wrong-type',
          },
          transaction
        )

        const expiredKeys =
          await select7DaysExpiredBillingPortalApiKeys(transaction)
        /**
         * This is one of the few database global tests
         * in our test suite, so we must scope
         * it to per-organization to ensure it checks
         * against this one test case
         */
        const testRunScopedKeys = expiredKeys.filter(
          (key) => key.organizationId === organization.id
        )
        expect(testRunScopedKeys).toHaveLength(1)
        expect(testRunScopedKeys[0].token).toBe(expiredToken1)
        testRunScopedKeys.forEach((key) => {
          expect(key.type).toBe(FlowgladApiKeyType.BillingPortalToken)
        })
      })
    })
  })

  describe('safelyFilterExpiredBillingPortalApiKeys', () => {
    it('only returns billing portal tokens expired > 7 days ago', () => {
      const eightDaysAgo = new Date(
        Date.now() - 8 * 24 * 60 * 60 * 1000
      )
      const threeDaysAgo = new Date(
        Date.now() - 3 * 24 * 60 * 60 * 1000
      )
      const oneDayInFuture = new Date(
        Date.now() + 1 * 24 * 60 * 60 * 1000
      )

      const allKeys = [
        {
          type: FlowgladApiKeyType.BillingPortalToken,
          expiresAt: eightDaysAgo,
        },
        {
          type: FlowgladApiKeyType.BillingPortalToken,
          expiresAt: threeDaysAgo,
        },
        {
          type: FlowgladApiKeyType.BillingPortalToken,
          expiresAt: oneDayInFuture,
        },
        {
          type: FlowgladApiKeyType.Secret,
          expiresAt: eightDaysAgo,
        },
      ] as ApiKey.Record[]

      const filteredKeys =
        safelyFilterExpiredBillingPortalApiKeys(allKeys)

      expect(filteredKeys).toHaveLength(1)
      expect(filteredKeys[0].type).toBe(
        FlowgladApiKeyType.BillingPortalToken
      )
      expect(filteredKeys[0].expiresAt).toBe(eightDaysAgo)
    })
  })
})
