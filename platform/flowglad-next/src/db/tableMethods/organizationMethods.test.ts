import { describe, expect, it } from 'bun:test'
import { adminTransaction } from '@/db/adminTransaction'
import core from '@/utils/core'
import { setupOrg } from '../../../seedDatabase'
import {
  selectOrganizationById,
  selectOrganizations,
  updateOrganization,
} from './organizationMethods'

describe('selectOrganizationById', () => {
  it('returns organization when id exists', async () => {
    const { organization } = await setupOrg()

    const selectedOrg = await adminTransaction(async ({ transaction }) => {
      return selectOrganizationById(organization.id, transaction)
    })

    expect(selectedOrg.id).toBe(organization.id)
    expect(selectedOrg.name).toBe(organization.name)
  })
})

describe('selectOrganizations', () => {
  it('returns organizations matching name condition', async () => {
    const { organization } = await setupOrg()

    const orgs = await adminTransaction(async ({ transaction }) => {
      return selectOrganizations({ name: organization.name }, transaction)
    })

    expect(orgs.length).toBeGreaterThanOrEqual(1)
    expect(orgs.some((o) => o.id === organization.id)).toBe(true)
  })

  it('returns empty array when no organizations match', async () => {
    const nonExistentName = `NonExistent_${core.nanoid()}`

    const orgs = await adminTransaction(async ({ transaction }) => {
      return selectOrganizations({ name: nonExistentName }, transaction)
    })

    expect(orgs.length).toBe(0)
  })

  it('returns organizations matching id condition', async () => {
    const { organization } = await setupOrg()

    const orgs = await adminTransaction(async ({ transaction }) => {
      return selectOrganizations({ id: organization.id }, transaction)
    })

    expect(orgs.length).toBe(1)
    expect(orgs[0].id).toBe(organization.id)
  })
})

describe('updateOrganization', () => {
  it('updates organization name field', async () => {
    const { organization } = await setupOrg()
    const newName = `Updated Name ${core.nanoid()}`

    const updatedOrg = await adminTransaction(async ({ transaction }) => {
      return updateOrganization(
        {
          id: organization.id,
          name: newName,
        },
        transaction
      )
    })

    expect(updatedOrg.name).toBe(newName)
    expect(updatedOrg.id).toBe(organization.id)
  })

  it('updates organization logoURL field', async () => {
    const { organization } = await setupOrg()
    const newLogoURL = 'https://example.com/new-logo.png'

    const updatedOrg = await adminTransaction(async ({ transaction }) => {
      return updateOrganization(
        {
          id: organization.id,
          logoURL: newLogoURL,
        },
        transaction
      )
    })

    expect(updatedOrg.logoURL).toBe(newLogoURL)
  })

  it('does not modify other fields when updating single field', async () => {
    const { organization } = await setupOrg()
    const originalName = organization.name
    const newLogoURL = 'https://example.com/another-logo.png'

    const updatedOrg = await adminTransaction(async ({ transaction }) => {
      return updateOrganization(
        {
          id: organization.id,
          logoURL: newLogoURL,
        },
        transaction
      )
    })

    expect(updatedOrg.name).toBe(originalName)
    expect(updatedOrg.logoURL).toBe(newLogoURL)
  })
})

// NOTE: selectOrganizationAndFirstMemberByOrganizationId test is not included
// because it requires a complex join with memberships that depends on how
// setupOrg() creates the membership relationship. The function is tested
// implicitly through other integration tests that use this function.

// NOTE: insertOrganization, insertOrDoNothingOrganizationByExternalId, and
// bulkInsertOrDoNothingOrganizationsByExternalId tests are not included
// because they require complex schema setup with multiple required fields.
// The setupOrg helper from seedDatabase.ts handles this complexity internally
// and is the recommended way to create organizations in tests.

// NOTE: upsertOrganizationByName is not tested because it requires a unique
// index on the 'name' column which does not exist in the schema.

// NOTE: upsertOrganizationByStripeAccountId is not tested because it requires
// Stripe integration setup.
