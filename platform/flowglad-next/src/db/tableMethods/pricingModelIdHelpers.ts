import { Result } from 'better-result'
import { NotFoundError } from '@/errors'

/**
 * Parameters for deriving pricingModelId from a pre-fetched map.
 * Used by bulk insert operations where pricingModelIds have been batch-fetched.
 */
export interface DerivePricingModelIdFromMapParams {
  /**
   * The ID of the entity to look up (e.g., subscriptionId, usageMeterId, priceId)
   */
  entityId: string
  /**
   * The type of entity being looked up (for error messages)
   */
  entityType:
    | 'subscription'
    | 'usageMeter'
    | 'price'
    | 'billingPeriod'
    | 'subscriptionItem'
  /**
   * The pre-fetched map of entity IDs to pricing model IDs
   */
  pricingModelIdMap: Map<string, string>
}

/**
 * Derives pricingModelId from a pre-fetched map, returning a Result.
 *
 * Use this helper in bulk insert operations where pricingModelIds have been
 * batch-fetched using functions like `pricingModelIdsForSubscriptions`,
 * `pricingModelIdsForUsageMeters`, etc.
 *
 * @example
 * ```typescript
 * const pricingModelIdMap = await pricingModelIdsForSubscriptions(subscriptionIds, transaction)
 * for (const insert of inserts) {
 *   const result = derivePricingModelIdFromMap({
 *     entityId: insert.subscriptionId,
 *     entityType: 'subscription',
 *     pricingModelIdMap,
 *   })
 *   if (result.isErr()) {
 *     return Result.err(result.error)
 *   }
 *   // use result.value
 * }
 * ```
 */
export const derivePricingModelIdFromMap = (
  params: DerivePricingModelIdFromMapParams
): Result<string, NotFoundError> => {
  const { entityId, entityType, pricingModelIdMap } = params
  const pricingModelId = pricingModelIdMap.get(entityId)

  if (!pricingModelId) {
    return Result.err(
      new NotFoundError(`pricingModelId for ${entityType}`, entityId)
    )
  }

  return Result.ok(pricingModelId)
}

/**
 * Source configuration for COALESCE-style derivation.
 * Each source specifies the entity ID and type, along with a pre-fetched map.
 */
export interface PricingModelIdSource {
  /**
   * The ID of the entity to look up (may be null/undefined)
   */
  entityId: string | null | undefined
  /**
   * The type of entity being looked up (for error messages)
   */
  entityType:
    | 'subscription'
    | 'usageMeter'
    | 'price'
    | 'billingPeriod'
    | 'subscriptionItem'
    | 'customer'
  /**
   * The pre-fetched map of entity IDs to pricing model IDs
   */
  pricingModelIdMap: Map<string, string>
}

/**
 * Derives pricingModelId using COALESCE logic from multiple sources.
 *
 * Tries each source in order and returns the first valid pricingModelId found.
 * If no valid pricingModelId is found from any source, returns a NotFoundError.
 *
 * @example
 * ```typescript
 * // For ledger entries: priority is subscription > usageMeter
 * const result = derivePricingModelIdCoalesce([
 *   { entityId: insert.subscriptionId, entityType: 'subscription', pricingModelIdMap: subscriptionMap },
 *   { entityId: insert.usageMeterId, entityType: 'usageMeter', pricingModelIdMap: usageMeterMap },
 * ])
 * ```
 */
export const derivePricingModelIdCoalesce = (
  sources: PricingModelIdSource[]
): Result<string, NotFoundError> => {
  for (const source of sources) {
    // Skip sources with null/undefined entity IDs
    if (!source.entityId) {
      continue
    }

    const pricingModelId = source.pricingModelIdMap.get(
      source.entityId
    )
    if (pricingModelId) {
      return Result.ok(pricingModelId)
    }
  }

  // Build a descriptive error message showing which sources were tried
  const triedSources = sources
    .filter((s) => s.entityId)
    .map((s) => `${s.entityType}:${s.entityId}`)
    .join(', ')

  const errorId = triedSources || 'no sources provided'

  return Result.err(new NotFoundError('pricingModelId', errorId))
}

/**
 * Parameters for deriving pricingModelId for a ledger entry.
 * Supports COALESCE logic: subscription > usageMeter
 */
export interface DerivePricingModelIdForLedgerEntryParams {
  subscriptionId: string | null | undefined
  usageMeterId: string | null | undefined
  subscriptionPricingModelIdMap: Map<string, string>
  usageMeterPricingModelIdMap: Map<string, string>
}

/**
 * Derives pricingModelId for a ledger entry using COALESCE logic.
 * Priority: subscription > usageMeter
 *
 * @example
 * ```typescript
 * const result = derivePricingModelIdForLedgerEntryFromMaps({
 *   subscriptionId: insert.subscriptionId,
 *   usageMeterId: insert.usageMeterId,
 *   subscriptionPricingModelIdMap,
 *   usageMeterPricingModelIdMap,
 * })
 * ```
 */
export const derivePricingModelIdForLedgerEntryFromMaps = (
  params: DerivePricingModelIdForLedgerEntryParams
): Result<string, NotFoundError> => {
  const {
    subscriptionId,
    usageMeterId,
    subscriptionPricingModelIdMap,
    usageMeterPricingModelIdMap,
  } = params

  return derivePricingModelIdCoalesce([
    {
      entityId: subscriptionId,
      entityType: 'subscription',
      pricingModelIdMap: subscriptionPricingModelIdMap,
    },
    {
      entityId: usageMeterId,
      entityType: 'usageMeter',
      pricingModelIdMap: usageMeterPricingModelIdMap,
    },
  ])
}
