import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupOrg,
  setupUserAndApiKey,
  setupCatalog,
} from '@/../seedDatabase'
import {
  insertCatalog,
  updateCatalog,
  selectCatalogById,
} from '@/db/tableMethods/catalogMethods'
import { Catalog } from '@/db/schema/catalogs'
import core from '@/utils/core'
import { describe, beforeEach, it, expect } from 'vitest'

describe('Catalogs RLS - Organization Policy', async () => {
  let org1Data: Awaited<ReturnType<typeof setupOrg>>
  let org1ApiKeyToken: string

  let org2Data: Awaited<ReturnType<typeof setupOrg>>

  let org1DefaultCatalog: Catalog.Record // The default catalog for org1
  let org1ExtraCatalog: Catalog.Record // An additional catalog for org1
  let org2DefaultCatalog: Catalog.Record // The default catalog for org2 created by setupOrg

  beforeEach(async () => {
    // Setup Org 1 and its API key
    org1Data = await setupOrg()
    const userApiKeyOrg1 = await setupUserAndApiKey({
      organizationId: org1Data.organization.id,
      livemode: false,
    })
    if (!userApiKeyOrg1.apiKey.token) {
      throw new Error('API key token not found after setup for org1')
    }
    org1ApiKeyToken = userApiKeyOrg1.apiKey.token

    org1DefaultCatalog = await setupCatalog({
      organizationId: org1Data.organization.id,
      name: 'Org1 Default Catalog',
      isDefault: true,
      livemode: false,
    })

    org1ExtraCatalog = await setupCatalog({
      organizationId: org1Data.organization.id,
      name: 'Org1 Extra Catalog',
      isDefault: false,
      livemode: false,
    })

    // Setup Org 2 and its catalog
    org2Data = await setupOrg()
    org2DefaultCatalog = org2Data.catalog // Catalog created by setupOrg for org2 is livemode: true by default
    // We need to ensure org2DefaultCatalog for this test is also livemode:false if all others are.
    // Or, ensure it is created with the desired livemode. For simplicity, let's update it.
    await adminTransaction(async ({ transaction }) => {
      org2DefaultCatalog = await updateCatalog(
        {
          id: org2DefaultCatalog.id,
          livemode: false,
          name: 'Org2 Default Catalog - Test',
        },
        transaction
      )
    })
  })

  // Test cases for creating catalogs
  describe('createCatalog - Organization Policy', () => {
    it('should ALLOW a user to create a catalog within their own organization', async () => {
      const catalogInsert: Catalog.Insert = {
        name: 'Org1 New Custom Catalog',
        organizationId: org1Data.organization.id,
        livemode: false,
        isDefault: false,
      }
      let createdCatalog: Catalog.Record | undefined
      await authenticatedTransaction(
        async (params) => {
          createdCatalog = await insertCatalog(
            catalogInsert,
            params.transaction
          )
        },
        { apiKey: org1ApiKeyToken }
      )
      expect(createdCatalog).toBeDefined()
      expect(createdCatalog!.name).toBe(catalogInsert.name)
      expect(createdCatalog!.organizationId).toBe(
        org1Data.organization.id
      )
    })

    it('should DENY a user from creating a catalog for another organization', async () => {
      const catalogInsert: Catalog.Insert = {
        name: 'Attempt to Create in Org2',
        organizationId: org2Data.organization.id, // Targeting other org
        livemode: false,
        isDefault: false,
      }
      await expect(
        authenticatedTransaction(
          async (params) => {
            await insertCatalog(catalogInsert, params.transaction)
          },
          { apiKey: org1ApiKeyToken }
        ) // Authenticated as Org1 user
      ).rejects.toThrow() // RLS should prevent this action
    })
  })

  // Test cases for reading catalogs
  describe('selectCatalogById - Organization Policy', () => {
    it('should ALLOW a user to read catalogs within their own organization', async () => {
      let fetchedCatalog1: Catalog.Record | null = null
      let fetchedCatalog2: Catalog.Record | null = null

      await authenticatedTransaction(
        async (params) => {
          fetchedCatalog1 = await selectCatalogById(
            org1DefaultCatalog.id,
            params.transaction
          )
          fetchedCatalog2 = await selectCatalogById(
            org1ExtraCatalog.id,
            params.transaction
          )
        },
        { apiKey: org1ApiKeyToken }
      )

      expect(fetchedCatalog1).toBeDefined()
      expect(fetchedCatalog1!.id).toBe(org1DefaultCatalog.id)
      expect(fetchedCatalog2).toBeDefined()
      expect(fetchedCatalog2!.id).toBe(org1ExtraCatalog.id)
    })

    it('should DENY a user from reading catalogs of another organization', async () => {
      await expect(
        authenticatedTransaction(
          async (params) => {
            // This call is expected to throw due to RLS / not found
            await selectCatalogById(
              org2DefaultCatalog.id, // Attempting to read Org2's catalog
              params.transaction
            )
          },
          { apiKey: org1ApiKeyToken }
        ) // Authenticated as Org1 user
      ).rejects.toThrow(
        `No catalogs found with id: ${org2DefaultCatalog.id}`
      )
    })
  })

  // Test cases for updating catalogs
  describe('updateCatalog - Organization Policy', () => {
    it('should ALLOW a user to update catalogs within their own organization', async () => {
      const newName = 'Updated Org1 Default Catalog Name'
      let updatedCatalog: Catalog.Record | undefined

      await authenticatedTransaction(
        async (params) => {
          updatedCatalog = await updateCatalog(
            { id: org1DefaultCatalog.id, name: newName },
            params.transaction
          )
        },
        { apiKey: org1ApiKeyToken }
      )

      expect(updatedCatalog).toBeDefined()
      expect(updatedCatalog!.name).toBe(newName)
      expect(updatedCatalog!.organizationId).toBe(
        org1Data.organization.id
      )
    })

    it('should DENY a user from updating catalogs of another organization', async () => {
      const newName = 'Attempt to Update Org2 Catalog Name'
      await expect(
        authenticatedTransaction(
          async (params) => {
            await updateCatalog(
              { id: org2DefaultCatalog.id, name: newName }, // Targeting Org2's catalog
              params.transaction
            )
          },
          { apiKey: org1ApiKeyToken }
        ) // Authenticated as Org1 user
      ).rejects.toThrow() // RLS should prevent this, update throws if ID not found/matched by RLS
    })
  })
})
