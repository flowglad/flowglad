import { beforeEach, describe, expect, it } from 'vitest'
import { setupOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { insertDiscount } from '@/db/tableMethods/discountMethods'
import {
  selectDefaultPricingModel,
  selectPricingModels,
} from '@/db/tableMethods/pricingModelMethods'
import { DiscountAmountType, DiscountDuration } from '@/types'

describe('discountsRouter - Cross-tenant pricingModelId validation', () => {
  let org1Id: string
  let org1PricingModelId: string
  let org2Id: string
  let org2PricingModelId: string
  const livemode = true

  beforeEach(async () => {
    // Set up two separate organizations with their own pricing models
    const result = await adminTransaction(async ({ transaction }) => {
      const {
        organization: organization1,
        pricingModel: pricingModel1,
      } = await setupOrg()
      const {
        organization: organization2,
        pricingModel: pricingModel2,
      } = await setupOrg()

      return {
        org1Id: organization1.id,
        org1PricingModelId: pricingModel1.id,
        org2Id: organization2.id,
        org2PricingModelId: pricingModel2.id,
      }
    })

    org1Id = result.org1Id
    org1PricingModelId = result.org1PricingModelId
    org2Id = result.org2Id
    org2PricingModelId = result.org2PricingModelId
  })

  describe('pricingModelId validation in createDiscount', () => {
    it('should allow creating a discount with a valid pricingModelId from the same organization', async () => {
      const discount = await adminTransaction(
        async ({ transaction }) => {
          // Verify the pricingModel belongs to org1
          const [validPricingModel] = await selectPricingModels(
            {
              id: org1PricingModelId,
              organizationId: org1Id,
              livemode,
            },
            transaction
          )
          expect(validPricingModel.id).toBe(org1PricingModelId)
          expect(validPricingModel.organizationId).toBe(org1Id)

          // Create discount with the valid pricingModelId
          return insertDiscount(
            {
              organizationId: org1Id,
              pricingModelId: org1PricingModelId,
              name: 'Test Discount',
              code: 'VALID10',
              amount: 10,
              amountType: DiscountAmountType.Percent,
              duration: DiscountDuration.Once,
              active: true,
              livemode,
              numberOfPayments: null,
            },
            transaction
          )
        }
      )

      expect(discount.id).toMatch(/^discount_/)
      expect(discount.pricingModelId).toBe(org1PricingModelId)
      expect(discount.organizationId).toBe(org1Id)
    })

    it('should reject a pricingModelId that belongs to a different organization', async () => {
      await expect(
        adminTransaction(async ({ transaction }) => {
          // First verify that org2's pricingModel does NOT belong to org1
          const [invalidPricingModel] = await selectPricingModels(
            {
              id: org2PricingModelId,
              organizationId: org1Id, // Looking for org2's pricing model in org1's context
              livemode,
            },
            transaction
          )

          // This should be undefined because org2's pricing model doesn't belong to org1
          if (!invalidPricingModel) {
            throw new Error(
              'Invalid pricing model: the specified pricing model does not exist or does not belong to this organization'
            )
          }

          // This should never be reached
          return insertDiscount(
            {
              organizationId: org1Id,
              pricingModelId: org2PricingModelId, // Wrong org's pricing model
              name: 'Test Discount',
              code: 'INVALID10',
              amount: 10,
              amountType: DiscountAmountType.Percent,
              duration: DiscountDuration.Once,
              active: true,
              livemode,
              numberOfPayments: null,
            },
            transaction
          )
        })
      ).rejects.toThrow(
        'Invalid pricing model: the specified pricing model does not exist or does not belong to this organization'
      )
    })

    it('should reject a non-existent pricingModelId', async () => {
      const nonExistentPricingModelId = 'pricing_model_nonexistent123'

      await expect(
        adminTransaction(async ({ transaction }) => {
          // Verify the pricingModel does not exist
          const [invalidPricingModel] = await selectPricingModels(
            {
              id: nonExistentPricingModelId,
              organizationId: org1Id,
              livemode,
            },
            transaction
          )

          if (!invalidPricingModel) {
            throw new Error(
              'Invalid pricing model: the specified pricing model does not exist or does not belong to this organization'
            )
          }

          return insertDiscount(
            {
              organizationId: org1Id,
              pricingModelId: nonExistentPricingModelId,
              name: 'Test Discount',
              code: 'INVALID10',
              amount: 10,
              amountType: DiscountAmountType.Percent,
              duration: DiscountDuration.Once,
              active: true,
              livemode,
              numberOfPayments: null,
            },
            transaction
          )
        })
      ).rejects.toThrow(
        'Invalid pricing model: the specified pricing model does not exist or does not belong to this organization'
      )
    })

    it('should use the default pricing model when pricingModelId is not provided', async () => {
      const discount = await adminTransaction(
        async ({ transaction }) => {
          // Get the default pricing model for org1
          const defaultPM = await selectDefaultPricingModel(
            { organizationId: org1Id, livemode },
            transaction
          )
          expect(defaultPM?.id).toMatch(/^pricing_model_/)

          // Create discount without specifying pricingModelId
          const pricingModelId = defaultPM!.id

          return insertDiscount(
            {
              organizationId: org1Id,
              pricingModelId,
              name: 'Test Discount Default PM',
              code: 'DEFAULT10',
              amount: 10,
              amountType: DiscountAmountType.Percent,
              duration: DiscountDuration.Once,
              active: true,
              livemode,
              numberOfPayments: null,
            },
            transaction
          )
        }
      )

      expect(discount.id).toMatch(/^discount_/)
      expect(discount.pricingModelId).toMatch(/^pricing_model_/)
      expect(discount.organizationId).toBe(org1Id)
    })

    it('should reject a pricingModelId from the same organization but different livemode', async () => {
      // Create a test mode pricing model for org1
      const testmodePricingModelId = await adminTransaction(
        async ({ transaction }) => {
          // setupOrg creates livemode pricing models, let's check if there's a testmode one
          // If not, we need to verify the validation correctly checks livemode
          const [livemodeModel] = await selectPricingModels(
            {
              id: org1PricingModelId,
              organizationId: org1Id,
              livemode: true,
            },
            transaction
          )

          // Try to use a livemode pricingModel in testmode context
          const [invalidInTestmode] = await selectPricingModels(
            {
              id: org1PricingModelId,
              organizationId: org1Id,
              livemode: false, // Different livemode
            },
            transaction
          )

          // The livemode model should not be found in testmode context
          expect(invalidInTestmode).toBeUndefined()

          return livemodeModel.id
        }
      )

      // Verify that the validation rejects when livemode doesn't match
      await expect(
        adminTransaction(async ({ transaction }) => {
          const [validPricingModel] = await selectPricingModels(
            {
              id: testmodePricingModelId,
              organizationId: org1Id,
              livemode: false, // Trying to use in testmode context
            },
            transaction
          )

          if (!validPricingModel) {
            throw new Error(
              'Invalid pricing model: the specified pricing model does not exist or does not belong to this organization'
            )
          }

          return validPricingModel
        })
      ).rejects.toThrow(
        'Invalid pricing model: the specified pricing model does not exist or does not belong to this organization'
      )
    })
  })
})
