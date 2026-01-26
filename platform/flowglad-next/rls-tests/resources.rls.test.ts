import { beforeEach, describe, expect, it } from 'bun:test'
import { setupOrg, setupUserAndApiKey } from '@/../seedDatabase'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import type { ApiKey } from '@/db/schema/apiKeys'
import type { Organization } from '@/db/schema/organizations'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Resource } from '@/db/schema/resources'
import {
  insertResource,
  selectResourceById,
  selectResources,
} from '@/db/tableMethods/resourceMethods'

/**
 * These tests verify that the merchant role has proper permissions to insert
 * resources. The `position` column uses a bigserial sequence,
 * and the merchant role needs USAGE and UPDATE permissions on these sequences.
 *
 * If these tests fail with "permission denied for sequence resources_position_seq",
 * it means the database migration to grant sequence permissions has not been applied.
 *
 * Fix: Run the migration that grants:
 *   GRANT USAGE, UPDATE ON SEQUENCE public.resources_position_seq TO merchant;
 */
describe('resources RLS - merchant role sequence permissions', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let apiKey: ApiKey.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel

    const userApiKey = await setupUserAndApiKey({
      organizationId: organization.id,
      livemode: true,
    })
    apiKey = userApiKey.apiKey
  })

  describe('insertResource via authenticatedTransaction (merchant role)', () => {
    it('inserts a resource when merchant role has sequence permissions', async () => {
      const resourceInsert: Resource.Insert = {
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        slug: 'test-seats',
        name: 'Test Seats',
        livemode: true,
        active: true,
      }

      const inserted = await authenticatedTransaction(
        async ({ transaction }) => {
          return insertResource(resourceInsert, transaction)
        },
        { apiKey: apiKey.token }
      )

      expect(inserted.id).toMatch(/^resource_/)
      expect(inserted.slug).toBe('test-seats')
      expect(inserted.name).toBe('Test Seats')
      expect(inserted.organizationId).toBe(organization.id)
      expect(inserted.pricingModelId).toBe(pricingModel.id)
      expect(inserted.active).toBe(true)
      expect(inserted.livemode).toBe(true)
      // The position column should be auto-populated by the sequence
      expect(typeof inserted.position).toBe('number')
    })

    it('selects resources via authenticatedTransaction after insertion', async () => {
      // First insert a resource
      const resourceInsert: Resource.Insert = {
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        slug: 'select-test-resource',
        name: 'Select Test Resource',
        livemode: true,
        active: true,
      }

      const inserted = await authenticatedTransaction(
        async ({ transaction }) => {
          return insertResource(resourceInsert, transaction)
        },
        { apiKey: apiKey.token }
      )

      // Then select it back
      const selected = await authenticatedTransaction(
        async ({ transaction }) => {
          return selectResourceById(inserted.id, transaction)
        },
        { apiKey: apiKey.token }
      )

      expect(selected.id).toBe(inserted.id)
      expect(selected.slug).toBe('select-test-resource')
    })

    it('lists resources for the organization via authenticatedTransaction', async () => {
      // Insert two resources
      await authenticatedTransaction(
        async ({ transaction }) => {
          await insertResource(
            {
              organizationId: organization.id,
              pricingModelId: pricingModel.id,
              slug: 'resource-1',
              name: 'Resource 1',
              livemode: true,
              active: true,
            },
            transaction
          )
          await insertResource(
            {
              organizationId: organization.id,
              pricingModelId: pricingModel.id,
              slug: 'resource-2',
              name: 'Resource 2',
              livemode: true,
              active: true,
            },
            transaction
          )
        },
        { apiKey: apiKey.token }
      )

      // Select all resources for the pricing model
      const resources = await authenticatedTransaction(
        async ({ transaction }) => {
          return selectResources(
            { pricingModelId: pricingModel.id },
            transaction
          )
        },
        { apiKey: apiKey.token }
      )

      expect(resources.length).toBe(2)
      const slugs = resources.map((r) => r.slug)
      expect(slugs).toContain('resource-1')
      expect(slugs).toContain('resource-2')
    })
  })

  describe('cross-organization RLS isolation', () => {
    it('cannot access resources from another organization', async () => {
      // Create a second organization
      const org2Data = await setupOrg()
      const org2ApiKey = await setupUserAndApiKey({
        organizationId: org2Data.organization.id,
        livemode: true,
      })

      // Insert a resource in org1
      await authenticatedTransaction(
        async ({ transaction }) => {
          return insertResource(
            {
              organizationId: organization.id,
              pricingModelId: pricingModel.id,
              slug: 'org1-resource',
              name: 'Org1 Resource',
              livemode: true,
              active: true,
            },
            transaction
          )
        },
        { apiKey: apiKey.token }
      )

      // Try to select org1's resource using org2's API key - should return empty
      const resources = await authenticatedTransaction(
        async ({ transaction }) => {
          return selectResources(
            { organizationId: organization.id },
            transaction
          )
        },
        { apiKey: org2ApiKey.apiKey.token }
      )

      expect(resources).toHaveLength(0)
    })
  })
})
