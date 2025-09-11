import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import { PricingModel } from '@/db/schema/pricingModels'
import { Organization } from '@/db/schema/organizations'
import { setupPricingModel, setupOrg } from '@/../seedDatabase'
import {
  safelyUpdatePricingModel,
  selectPricingModelById,
  safelyInsertPricingModel,
} from './pricingModelMethods'

describe('safelyUpdatePricingModel', () => {
  let organization: Organization.Record
  let pricingModelA: PricingModel.Record // default
  let pricingModelB: PricingModel.Record // not default

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModelA = orgData.pricingModel

    pricingModelB = await setupPricingModel({
      organizationId: organization.id,
      name: 'Non-Default PricingModel',
      isDefault: false,
    })
  })

  it('should make a non-default pricingModel the new default, and unset the old default', async () => {
    await adminTransaction(async ({ transaction }) => {
      await safelyUpdatePricingModel(
        { id: pricingModelB.id, isDefault: true },
        transaction
      )
    })

    const updatedPricingModelA = await adminTransaction(
      async ({ transaction }) =>
        selectPricingModelById(pricingModelA.id, transaction)
    )
    const updatedPricingModelB = await adminTransaction(
      async ({ transaction }) =>
        selectPricingModelById(pricingModelB.id, transaction)
    )

    expect(updatedPricingModelB.isDefault).toBe(true)
    expect(updatedPricingModelA.isDefault).toBe(false)
  })

  it("should update a non-default pricingModel's properties without affecting the default status of other pricingModels", async () => {
    const newName = 'New PricingModel Name'
    const updatedPricingModelB = await adminTransaction(
      async ({ transaction }) => {
        return await safelyUpdatePricingModel(
          { id: pricingModelB.id, name: newName },
          transaction
        )
      }
    )

    const updatedPricingModelA = await adminTransaction(
      async ({ transaction }) =>
        selectPricingModelById(pricingModelA.id, transaction)
    )

    expect(updatedPricingModelB.name).toBe(newName)
    expect(updatedPricingModelB.isDefault).toBe(false)
    expect(updatedPricingModelA.isDefault).toBe(true)
  })

  it('should allow unsetting a default pricingModel, leaving the organization with no default', async () => {
    const updatedPricingModelA = await adminTransaction(
      async ({ transaction }) => {
        return await safelyUpdatePricingModel(
          { id: pricingModelA.id, isDefault: false },
          transaction
        )
      }
    )

    expect(updatedPricingModelA.isDefault).toBe(false)
  })

  it('should update a property on a default pricingModel without changing its default status', async () => {
    const newName = 'New Name For Default PricingModel'
    const updatedPricingModelA = await adminTransaction(
      async ({ transaction }) => {
        return await safelyUpdatePricingModel(
          { id: pricingModelA.id, name: newName },
          transaction
        )
      }
    )

    expect(updatedPricingModelA.name).toBe(newName)
    expect(updatedPricingModelA.isDefault).toBe(true)
  })

  it('should not affect the default pricingModel of another organization', async () => {
    // The beforeEach creates our primary organization and its pricingModels.
    // Now, set up a completely separate organization with its own default pricingModel.
    const otherOrgData = await setupOrg()
    const otherOrgDefaultPricingModel = otherOrgData.pricingModel

    // Action: Make pricingModelB the new default for the FIRST organization.
    await adminTransaction(async ({ transaction }) => {
      await safelyUpdatePricingModel(
        { id: pricingModelB.id, isDefault: true },
        transaction
      )
    })

    // Expect: The default pricingModel for the second organization remains unchanged.
    const refreshedOtherOrgPricingModel = await adminTransaction(
      async ({ transaction }) =>
        selectPricingModelById(
          otherOrgDefaultPricingModel.id,
          transaction
        )
    )
    expect(refreshedOtherOrgPricingModel.isDefault).toBe(true)

    // Sanity check: The old default for the first organization should now be false.
    const refreshedPricingModelA = await adminTransaction(
      async ({ transaction }) =>
        selectPricingModelById(pricingModelA.id, transaction)
    )
    expect(refreshedPricingModelA.isDefault).toBe(false)
  })

  it('should not affect default pricingModels across livemode boundaries when updating', async () => {
    // Create a test mode (livemode: false) default pricing model for the same organization
    const testModePricingModel = await setupPricingModel({
      organizationId: organization.id,
      name: 'Test Mode Default PricingModel',
      isDefault: true,
      livemode: false,
    })

    // Verify we have two default pricing models - one for each livemode
    expect(pricingModelA.isDefault).toBe(true)
    expect(pricingModelA.livemode).toBe(true)
    expect(testModePricingModel.isDefault).toBe(true)
    expect(testModePricingModel.livemode).toBe(false)

    // Make pricingModelB (livemode: true) the new default
    await adminTransaction(async ({ transaction }) => {
      await safelyUpdatePricingModel(
        { id: pricingModelB.id, isDefault: true },
        transaction
      )
    })

    // Check that only the livemode: true default was affected
    const refreshedPricingModelA = await adminTransaction(
      async ({ transaction }) =>
        selectPricingModelById(pricingModelA.id, transaction)
    )
    const refreshedPricingModelB = await adminTransaction(
      async ({ transaction }) =>
        selectPricingModelById(pricingModelB.id, transaction)
    )
    const refreshedTestModePricingModel = await adminTransaction(
      async ({ transaction }) =>
        selectPricingModelById(testModePricingModel.id, transaction)
    )

    // pricingModelB should now be the default for livemode: true
    expect(refreshedPricingModelB.isDefault).toBe(true)
    expect(refreshedPricingModelB.livemode).toBe(true)

    // pricingModelA should no longer be default
    expect(refreshedPricingModelA.isDefault).toBe(false)
    expect(refreshedPricingModelA.livemode).toBe(true)

    // Test mode default should remain unchanged
    expect(refreshedTestModePricingModel.isDefault).toBe(true)
    expect(refreshedTestModePricingModel.livemode).toBe(false)
  })
})

describe('safelyInsertPricingModel', () => {
  let organization: Organization.Record
  let existingDefaultPricingModel: PricingModel.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    existingDefaultPricingModel = orgData.pricingModel // This is the default pricingModel
  })

  it('should make the new pricingModel the default and unset the old default', async () => {
    const newPricingModel = await adminTransaction(
      async ({ transaction }) => {
        return safelyInsertPricingModel(
          {
            name: 'New Default PricingModel',
            organizationId: organization.id,
            isDefault: true,
            livemode: true,
          },
          transaction
        )
      }
    )

    const refreshedOldDefault = await adminTransaction(
      async ({ transaction }) =>
        selectPricingModelById(
          existingDefaultPricingModel.id,
          transaction
        )
    )

    expect(newPricingModel.isDefault).toBe(true)
    expect(refreshedOldDefault.isDefault).toBe(false)
  })

  it('should insert a non-default pricingModel without affecting the existing default', async () => {
    const newPricingModel = await adminTransaction(
      async ({ transaction }) => {
        return safelyInsertPricingModel(
          {
            name: 'New Non-Default PricingModel',
            organizationId: organization.id,
            isDefault: false,
            livemode: true,
          },
          transaction
        )
      }
    )

    const refreshedOldDefault = await adminTransaction(
      async ({ transaction }) =>
        selectPricingModelById(
          existingDefaultPricingModel.id,
          transaction
        )
    )

    expect(newPricingModel.isDefault).toBe(false)
    expect(refreshedOldDefault.isDefault).toBe(true)
  })

  it('should not affect the default pricingModel of another organization when inserting a new default', async () => {
    // Setup a second organization with its own default pricingModel
    const otherOrgData = await setupOrg()
    const otherOrgDefaultPricingModel = otherOrgData.pricingModel

    // Insert a new default pricingModel for the FIRST organization
    await adminTransaction(async ({ transaction }) => {
      return safelyInsertPricingModel(
        {
          name: 'New Default PricingModel for Org 1',
          organizationId: organization.id,
          isDefault: true,
          livemode: true,
        },
        transaction
      )
    })

    // Check that the second org's default pricingModel is untouched
    const refreshedOtherOrgPricingModel = await adminTransaction(
      async ({ transaction }) =>
        selectPricingModelById(
          otherOrgDefaultPricingModel.id,
          transaction
        )
    )
    expect(refreshedOtherOrgPricingModel.isDefault).toBe(true)
  })

  it('should not affect default pricingModels across livemode boundaries when inserting', async () => {
    // Create a test mode (livemode: false) default pricing model for the same organization
    const testModeDefaultPricingModel = await adminTransaction(
      async ({ transaction }) => {
        return safelyInsertPricingModel(
          {
            name: 'Test Mode Default PricingModel',
            organizationId: organization.id,
            isDefault: true,
            livemode: false,
          },
          transaction
        )
      }
    )

    // Verify we have two default pricing models - one for each livemode
    expect(existingDefaultPricingModel.isDefault).toBe(true)
    expect(existingDefaultPricingModel.livemode).toBe(true)
    expect(testModeDefaultPricingModel.isDefault).toBe(true)
    expect(testModeDefaultPricingModel.livemode).toBe(false)

    // Insert a new default for livemode: true
    const newLivemodeDefault = await adminTransaction(
      async ({ transaction }) => {
        return safelyInsertPricingModel(
          {
            name: 'New Live Mode Default PricingModel',
            organizationId: organization.id,
            isDefault: true,
            livemode: true,
          },
          transaction
        )
      }
    )

    // Check that only the livemode: true default was affected
    const refreshedOldLivemodeDefault = await adminTransaction(
      async ({ transaction }) =>
        selectPricingModelById(
          existingDefaultPricingModel.id,
          transaction
        )
    )
    const refreshedTestModeDefault = await adminTransaction(
      async ({ transaction }) =>
        selectPricingModelById(
          testModeDefaultPricingModel.id,
          transaction
        )
    )

    // New livemode pricing model should be default
    expect(newLivemodeDefault.isDefault).toBe(true)
    expect(newLivemodeDefault.livemode).toBe(true)

    // Old livemode default should no longer be default
    expect(refreshedOldLivemodeDefault.isDefault).toBe(false)
    expect(refreshedOldLivemodeDefault.livemode).toBe(true)

    // Test mode default should remain unchanged
    expect(refreshedTestModeDefault.isDefault).toBe(true)
    expect(refreshedTestModeDefault.livemode).toBe(false)
  })
})
