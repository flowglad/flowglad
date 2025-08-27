import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupOrg,
  setupUserAndApiKey,
  setupPricingModel,
} from '@/../seedDatabase'
import {
  insertPricingModel,
  updatePricingModel,
  selectPricingModelById,
} from '@/db/tableMethods/pricingModelMethods'
import { PricingModel } from '@/db/schema/pricingModels'
import { describe, beforeEach, it, expect } from 'vitest'

describe('Pricing Models RLS - Organization Policy', async () => {
  let org1Data: Awaited<ReturnType<typeof setupOrg>>
  let org1ApiKeyToken: string

  let org2Data: Awaited<ReturnType<typeof setupOrg>>

  let org1DefaultPricingModel: PricingModel.Record // The default pricingModel for org1
  let org1ExtraPricingModel: PricingModel.Record // An additional pricingModel for org1
  let org2DefaultPricingModel: PricingModel.Record // The default pricingModel for org2 created by setupOrg

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

    org1DefaultPricingModel = await setupPricingModel({
      organizationId: org1Data.organization.id,
      name: 'Org1 Default PricingModel',
      isDefault: true,
      livemode: false,
    })

    org1ExtraPricingModel = await setupPricingModel({
      organizationId: org1Data.organization.id,
      name: 'Org1 Extra Pricing Model',
      isDefault: false,
      livemode: false,
    })

    // Setup Org 2 and its pricingModel
    org2Data = await setupOrg()
    org2DefaultPricingModel = org2Data.pricingModel // Pricing Model created by setupOrg for org2 is livemode: true by default
    // We need to ensure org2DefaultPricingModel for this test is also livemode:false if all others are.
    // Or, ensure it is created with the desired livemode. For simplicity, let's update it.
    await adminTransaction(async ({ transaction }) => {
      org2DefaultPricingModel = await updatePricingModel(
        {
          id: org2DefaultPricingModel.id,
          livemode: false,
          name: 'Org2 Default Pricing Model - Test',
        },
        transaction
      )
    })
  })

  // Test cases for creating pricingModels
  describe('createPricingModel - Organization Policy', () => {
    it('should ALLOW a user to create a pricingModel within their own organization', async () => {
      const pricingModelInsert: PricingModel.Insert = {
        name: 'Org1 New Custom PricingModel',
        organizationId: org1Data.organization.id,
        livemode: false,
        isDefault: false,
      }
      let createdPricingModel: PricingModel.ClientRecord | undefined
      await authenticatedTransaction(
        async (params) => {
          createdPricingModel = await insertPricingModel(
            pricingModelInsert,
            params.transaction
          )
        },
        { apiKey: org1ApiKeyToken }
      )
      expect(createdPricingModel).toBeDefined()
      expect(createdPricingModel!.name).toBe(pricingModelInsert.name)
      expect(createdPricingModel!.organizationId).toBe(
        org1Data.organization.id
      )
    })

    it('should DENY a user from creating a pricingModel for another organization', async () => {
      const pricingModelInsert: PricingModel.Insert = {
        name: 'Attempt to Create in Org2',
        organizationId: org2Data.organization.id, // Targeting other org
        livemode: false,
        isDefault: false,
      }
      await expect(
        authenticatedTransaction(
          async (params) => {
            await insertPricingModel(
              pricingModelInsert,
              params.transaction
            )
          },
          { apiKey: org1ApiKeyToken }
        ) // Authenticated as Org1 user
      ).rejects.toThrow() // RLS should prevent this action
    })
  })

  // Test cases for reading pricingModels
  describe('selectPricingModelById - Organization Policy', () => {
    it('should ALLOW a user to read pricingModels within their own organization', async () => {
      let fetchedPricingModel1: PricingModel.ClientRecord | null =
        null
      let fetchedPricingModel2: PricingModel.ClientRecord | null =
        null

      await authenticatedTransaction(
        async (params) => {
          fetchedPricingModel1 = await selectPricingModelById(
            org1DefaultPricingModel.id,
            params.transaction
          )
          fetchedPricingModel2 = await selectPricingModelById(
            org1ExtraPricingModel.id,
            params.transaction
          )
        },
        { apiKey: org1ApiKeyToken }
      )

      expect(fetchedPricingModel1).toBeDefined()
      expect(fetchedPricingModel1!.id).toBe(
        org1DefaultPricingModel.id
      )
      expect(fetchedPricingModel2).toBeDefined()
      expect(fetchedPricingModel2!.id).toBe(org1ExtraPricingModel.id)
    })

    it('should DENY a user from reading pricingModels of another organization', async () => {
      await expect(
        authenticatedTransaction(
          async (params) => {
            // This call is expected to throw due to RLS / not found
            await selectPricingModelById(
              org2DefaultPricingModel.id, // Attempting to read Org2's pricingModel
              params.transaction
            )
          },
          { apiKey: org1ApiKeyToken }
        ) // Authenticated as Org1 user
      ).rejects.toThrow(
        `No pricing models found with id: ${org2DefaultPricingModel.id}`
      )
    })
  })

  // Test cases for updating pricingModels
  describe('updatePricingModel - Organization Policy', () => {
    it('should ALLOW a user to update pricingModels within their own organization', async () => {
      const newName = 'Updated Org1 Default Pricing Model Name'
      let updatedPricingModel: PricingModel.ClientRecord | undefined

      await authenticatedTransaction(
        async (params) => {
          updatedPricingModel = await updatePricingModel(
            { id: org1DefaultPricingModel.id, name: newName },
            params.transaction
          )
        },
        { apiKey: org1ApiKeyToken }
      )

      expect(updatedPricingModel).toBeDefined()
      expect(updatedPricingModel!.name).toBe(newName)
      expect(updatedPricingModel!.organizationId).toBe(
        org1Data.organization.id
      )
    })

    it('should DENY a user from updating pricingModels of another organization', async () => {
      const newName = 'Attempt to Update Org2 Pricing Model Name'
      await expect(
        authenticatedTransaction(
          async (params) => {
            await updatePricingModel(
              { id: org2DefaultPricingModel.id, name: newName }, // Targeting Org2's pricingModel
              params.transaction
            )
          },
          { apiKey: org1ApiKeyToken }
        ) // Authenticated as Org1 user
      ).rejects.toThrow() // RLS should prevent this, update throws if ID not found/matched by RLS
    })
  })
})
