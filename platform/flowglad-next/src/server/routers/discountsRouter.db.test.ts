import { beforeEach, describe, expect, it } from 'bun:test'
import { DiscountAmountType, DiscountDuration } from '@db-core/enums'
import { TRPCError } from '@trpc/server'
import { Result } from 'better-result'
import { setupOrg } from '@/../seedDatabase'
import {
  adminTransaction,
  adminTransactionWithResult,
} from '@/db/adminTransaction'
import { insertDiscount } from '@/db/tableMethods/discountMethods'
import { selectDefaultPricingModel } from '@/db/tableMethods/pricingModelMethods'
import { validateAndResolvePricingModelId } from '@/utils/discountValidation'

describe('validateAndResolvePricingModelId', () => {
  let org1Id: string
  let org1PricingModelId: string
  let org2Id: string
  let org2PricingModelId: string
  const livemode = true

  beforeEach(async () => {
    // Set up two separate organizations with their own pricing models
    const result = (
      await adminTransactionWithResult(async ({ transaction }) => {
        const {
          organization: organization1,
          pricingModel: pricingModel1,
        } = await setupOrg()
        const {
          organization: organization2,
          pricingModel: pricingModel2,
        } = await setupOrg()

        return Result.ok(
          await {
            org1Id: organization1.id,
            org1PricingModelId: pricingModel1.id,
            org2Id: organization2.id,
            org2PricingModelId: pricingModel2.id,
          }
        )
      })
    ).unwrap()

    org1Id = result.org1Id
    org1PricingModelId = result.org1PricingModelId
    org2Id = result.org2Id
    org2PricingModelId = result.org2PricingModelId
  })

  it('returns the provided pricingModelId when it belongs to the same organization', async () => {
    const result = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await validateAndResolvePricingModelId({
            pricingModelId: org1PricingModelId,
            organizationId: org1Id,
            livemode,
            transaction,
          })
        )
      })
    ).unwrap()

    expect(result).toBe(org1PricingModelId)
  })

  it('throws TRPCError with BAD_REQUEST when pricingModelId belongs to a different organization', async () => {
    await expect(
      adminTransaction(async ({ transaction }) => {
        await validateAndResolvePricingModelId({
          pricingModelId: org2PricingModelId, // org2's pricing model
          organizationId: org1Id, // but trying to use in org1's context
          livemode,
          transaction,
        })
      })
    ).rejects.toThrow(TRPCError)

    // Verify the error details
    try {
      await adminTransaction(async ({ transaction }) => {
        await validateAndResolvePricingModelId({
          pricingModelId: org2PricingModelId,
          organizationId: org1Id,
          livemode,
          transaction,
        })
      })
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError)
      expect((error as TRPCError).code).toBe('BAD_REQUEST')
      expect((error as TRPCError).message).toBe(
        'Invalid pricing model: the specified pricing model does not exist or does not belong to this organization'
      )
    }
  })

  it('throws TRPCError with BAD_REQUEST when pricingModelId does not exist', async () => {
    const nonExistentPricingModelId = 'pricing_model_nonexistent123'

    await expect(
      adminTransaction(async ({ transaction }) => {
        await validateAndResolvePricingModelId({
          pricingModelId: nonExistentPricingModelId,
          organizationId: org1Id,
          livemode,
          transaction,
        })
      })
    ).rejects.toThrow(TRPCError)

    // Verify the error details
    try {
      await adminTransaction(async ({ transaction }) => {
        await validateAndResolvePricingModelId({
          pricingModelId: nonExistentPricingModelId,
          organizationId: org1Id,
          livemode,
          transaction,
        })
      })
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError)
      expect((error as TRPCError).code).toBe('BAD_REQUEST')
      expect((error as TRPCError).message).toBe(
        'Invalid pricing model: the specified pricing model does not exist or does not belong to this organization'
      )
    }
  })

  it('returns the default pricing model ID when pricingModelId is not provided', async () => {
    const result = (
      await adminTransactionWithResult(async ({ transaction }) => {
        const defaultPM = await selectDefaultPricingModel(
          { organizationId: org1Id, livemode },
          transaction
        )

        const resolvedId = await validateAndResolvePricingModelId({
          pricingModelId: undefined,
          organizationId: org1Id,
          livemode,
          transaction,
        })

        return Result.ok(
          await { resolvedId, defaultPMId: defaultPM?.id }
        )
      })
    ).unwrap()

    expect(result.resolvedId).toBe(result.defaultPMId!)
    expect(result.resolvedId).toMatch(/^pricing_model_/)
  })

  it('returns the default pricing model ID when pricingModelId is null', async () => {
    const result = (
      await adminTransactionWithResult(async ({ transaction }) => {
        const defaultPM = await selectDefaultPricingModel(
          { organizationId: org1Id, livemode },
          transaction
        )

        const resolvedId = await validateAndResolvePricingModelId({
          pricingModelId: null,
          organizationId: org1Id,
          livemode,
          transaction,
        })

        return Result.ok(
          await { resolvedId, defaultPMId: defaultPM?.id }
        )
      })
    ).unwrap()

    expect(result.resolvedId).toBe(result.defaultPMId!)
    expect(result.resolvedId).toMatch(/^pricing_model_/)
  })

  it('throws TRPCError when pricingModelId has wrong livemode', async () => {
    // org1PricingModelId is a livemode pricing model (livemode: true)
    // Attempting to use it in testmode (livemode: false) should fail

    await expect(
      adminTransaction(async ({ transaction }) => {
        await validateAndResolvePricingModelId({
          pricingModelId: org1PricingModelId,
          organizationId: org1Id,
          livemode: false, // testmode context
          transaction,
        })
      })
    ).rejects.toThrow(TRPCError)

    // Verify the error details
    try {
      await adminTransaction(async ({ transaction }) => {
        await validateAndResolvePricingModelId({
          pricingModelId: org1PricingModelId,
          organizationId: org1Id,
          livemode: false,
          transaction,
        })
      })
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError)
      expect((error as TRPCError).code).toBe('BAD_REQUEST')
    }
  })

  describe('integration with insertDiscount', () => {
    it('creates a discount successfully after validation passes', async () => {
      const discount = (
        await adminTransactionWithResult(async ({ transaction }) => {
          // First validate and resolve the pricingModelId
          const resolvedPricingModelId =
            await validateAndResolvePricingModelId({
              pricingModelId: org1PricingModelId,
              organizationId: org1Id,
              livemode,
              transaction,
            })

          // Then create the discount
          return Result.ok(
            await insertDiscount(
              {
                organizationId: org1Id,
                pricingModelId: resolvedPricingModelId,
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
          )
        })
      ).unwrap()

      expect(discount.id).toMatch(/^discount_/)
      expect(discount.pricingModelId).toBe(org1PricingModelId)
      expect(discount.organizationId).toBe(org1Id)
    })

    it('prevents discount creation with cross-tenant pricingModelId through validation', async () => {
      await expect(
        adminTransaction(async ({ transaction }) => {
          // Validation will throw before we can create the discount
          const resolvedPricingModelId =
            await validateAndResolvePricingModelId({
              pricingModelId: org2PricingModelId, // wrong org
              organizationId: org1Id,
              livemode,
              transaction,
            })

          // This line should never be reached
          await insertDiscount(
            {
              organizationId: org1Id,
              pricingModelId: resolvedPricingModelId,
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
      ).rejects.toThrow(TRPCError)
    })
  })
})
