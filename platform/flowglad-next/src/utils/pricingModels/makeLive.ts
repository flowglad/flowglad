import type { PricingModel } from '@db-core/schema/pricingModels'
import { Result } from 'better-result'
import {
  selectPricingModelById,
  selectPricingModels,
} from '@/db/tableMethods/pricingModelMethods'
import type { TransactionEffectsContext } from '@/db/types'
import { NotFoundError, ValidationError } from '@/errors'
import { getPricingModelSetupData } from './setupHelpers'
import type { SetupPricingModelInput } from './setupSchemas'
import { setupPricingModelTransaction } from './setupTransaction'
import { updatePricingModelTransaction } from './updateTransaction'

export type MakeLiveResult = {
  pricingModel: PricingModel.Record
}

/**
 * Makes a test pricing model live by applying its configuration to the
 * organization's livemode pricing model (or creating one if none exists).
 *
 * - If the source PM is already livemode, returns a no-op success.
 * - If a live PM exists, updates it with the test PM's structure (preserving
 *   existing usage meters not present in the test PM, and the live PM's name).
 * - If no live PM exists, creates one from the test PM's structure.
 */
export const makeLivePricingModelTransaction = async (
  input: { testPricingModelId: string; organizationId: string },
  ctx: TransactionEffectsContext
): Promise<
  Result<MakeLiveResult, NotFoundError | ValidationError>
> => {
  return Result.gen(async function* () {
    const { transaction } = ctx

    // Step 1: Fetch and validate the test PM
    const testPm = (
      await selectPricingModelById(
        input.testPricingModelId,
        transaction
      )
    ).unwrap()

    if (testPm.organizationId !== input.organizationId) {
      return yield* Result.err(
        new NotFoundError('PricingModel', input.testPricingModelId)
      )
    }

    // Step 2: If already livemode, no-op
    if (testPm.livemode) {
      return Result.ok({ pricingModel: testPm })
    }

    // Step 3: Fetch test PM structure
    const testPmSetup = yield* await getPricingModelSetupData(
      input.testPricingModelId,
      transaction
    )

    // Step 4: Find org's live PM
    const [livePm] = await selectPricingModels(
      { organizationId: input.organizationId, livemode: true },
      transaction
    )

    if (livePm) {
      // Step 5: Live PM exists — update it with test PM's structure
      const livePmSetup = yield* await getPricingModelSetupData(
        livePm.id,
        transaction
      )

      // Merge usage meters: keep live meters not in test PM
      const testMeterSlugs = new Set(
        testPmSetup.usageMeters.map((m) => m.usageMeter.slug)
      )
      const liveOnlyMeters = livePmSetup.usageMeters.filter(
        (m) => !testMeterSlugs.has(m.usageMeter.slug)
      )
      const mergedUsageMeters = [
        ...testPmSetup.usageMeters,
        ...liveOnlyMeters,
      ]

      // Build proposed input with test PM's structure but live PM's name
      const proposedInput: SetupPricingModelInput = {
        name: livePmSetup.name,
        isDefault: livePmSetup.isDefault,
        features: testPmSetup.features,
        products: testPmSetup.products,
        usageMeters: mergedUsageMeters,
        resources: testPmSetup.resources ?? [],
      }

      const updateResult = yield* Result.await(
        updatePricingModelTransaction(
          { pricingModelId: livePm.id, proposedInput },
          ctx
        )
      )

      return Result.ok({ pricingModel: updateResult.pricingModel })
    }

    // Step 6: No live PM — create one from test PM structure
    const setupResult = yield* Result.await(
      setupPricingModelTransaction(
        {
          input: {
            name: testPmSetup.name,
            isDefault: true,
            features: testPmSetup.features,
            products: testPmSetup.products,
            usageMeters: testPmSetup.usageMeters,
            resources: testPmSetup.resources ?? [],
          },
          organizationId: input.organizationId,
          livemode: true,
        },
        ctx
      )
    )

    return Result.ok({ pricingModel: setupResult.pricingModel })
  })
}
