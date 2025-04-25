import { describe, it, expect } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import { createOrganizationTransaction } from '@/utils/organizationHelpers'
import { CreateOrganizationInput } from '@/db/schema/organizations'
import { selectCountries } from '@/db/tableMethods/countryMethods'
import core from './core'
import { selectOrganizations } from '@/db/tableMethods/organizationMethods'
import { selectApiKeys } from '@/db/tableMethods/apiKeyMethods'
import { FlowgladApiKeyType } from '@/types'

describe('createOrganizationTransaction', () => {
  it('should create an organization', async () => {
    const organizationName = core.nanoid()
    await adminTransaction(async ({ transaction }) => {
      const [country] = await selectCountries({}, transaction)
      const input: CreateOrganizationInput = {
        organization: {
          name: organizationName,
          countryId: country.id,
        },
      }
      return createOrganizationTransaction(
        input,
        {
          id: core.nanoid(),
          email: `test+${core.nanoid()}@test.com`,
          fullName: 'Test User',
        },
        transaction
      )
    })
    await adminTransaction(async ({ transaction }) => {
      const [organization] = await selectOrganizations(
        {
          name: organizationName,
        },
        transaction
      )
      expect(organization).toBeDefined()

      const testmodeKeys = await selectApiKeys(
        {
          organizationId: organization.id,
          livemode: false,
        },
        transaction
      )
      /**
       * Assert that no publishable keys are created
       * - we don't support the type right now.
       */
      expect(
        testmodeKeys.some(
          (key) => key.type === FlowgladApiKeyType.Publishable
        )
      ).toBe(false)
      /**
       * Assert that a secret key is created
       */
      expect(
        testmodeKeys.some(
          (key) => key.type === FlowgladApiKeyType.Secret
        )
      ).toBe(true)
      const livemodeKeys = await selectApiKeys(
        {
          organizationId: organization.id,
          livemode: true,
        },
        transaction
      )
      /**
       * Assert that no livemode keys are created -
       * they can only be created once the organization has payouts enabled.
       */
      expect(livemodeKeys.length).toBe(0)
    })
  })
})
