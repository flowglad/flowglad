import {
  RevenueChartIntervalUnit,
  UsageMeterAggregationType,
} from '@db-core/enums'
import { customers } from '@db-core/schema/customers'
import { products } from '@db-core/schema/products'
import { usageEvents } from '@db-core/schema/usageEvents'
import { usageMeters } from '@db-core/schema/usageMeters'
import { TRPCError } from '@trpc/server'
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import type { DbTransaction } from '@/db/types'

/**
 * Options for calculating usage volume by interval.
 */
export interface UsageCalculationOptions {
  startDate: Date
  endDate: Date
  granularity: RevenueChartIntervalUnit
  usageMeterId: string
  productId?: string
  livemode: boolean
}

/**
 * A single data point representing usage volume for a time interval.
 */
export interface UsageVolumeDataPoint {
  date: Date
  amount: number
}

/**
 * Information about a usage meter that has production events.
 */
export interface UsageMeterWithEvents {
  id: string
  name: string
  aggregationType: UsageMeterAggregationType
  pricingModelId: string // Included for future UX enhancements
}

/**
 * Maps RevenueChartIntervalUnit to PostgreSQL date_trunc interval string.
 */
function granularityToPostgresSql(
  granularity: RevenueChartIntervalUnit
): string {
  switch (granularity) {
    case RevenueChartIntervalUnit.Year:
      return 'year'
    case RevenueChartIntervalUnit.Month:
      return 'month'
    case RevenueChartIntervalUnit.Week:
      return 'week'
    case RevenueChartIntervalUnit.Day:
      return 'day'
    case RevenueChartIntervalUnit.Hour:
      return 'hour'
    default:
      return 'month'
  }
}

/**
 * Truncates a date to the start of the interval in UTC.
 * Matches PostgreSQL's date_trunc behavior for consistent bucketing.
 */
function dateTruncUTC(
  date: Date,
  granularity: RevenueChartIntervalUnit
): Date {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()
  const hour = date.getUTCHours()

  switch (granularity) {
    case RevenueChartIntervalUnit.Year:
      return new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0))
    case RevenueChartIntervalUnit.Month:
      return new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
    case RevenueChartIntervalUnit.Week: {
      // Get the day of week (0 = Sunday, 1 = Monday, etc.)
      const tempDate = new Date(Date.UTC(year, month, day))
      const dayOfWeek = tempDate.getUTCDay()
      // Adjust to start of week (Monday = 1, so we go back dayOfWeek days, but if Sunday (0), go back 6)
      const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1
      return new Date(
        Date.UTC(year, month, day - daysToSubtract, 0, 0, 0, 0)
      )
    }
    case RevenueChartIntervalUnit.Day:
      return new Date(Date.UTC(year, month, day, 0, 0, 0, 0))
    case RevenueChartIntervalUnit.Hour:
      return new Date(Date.UTC(year, month, day, hour, 0, 0, 0))
    default:
      return new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
  }
}

/**
 * Adds one interval unit to a UTC date.
 * Matches PostgreSQL's interval addition for consistent series generation.
 */
function addIntervalUTC(
  date: Date,
  granularity: RevenueChartIntervalUnit
): Date {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()
  const hour = date.getUTCHours()

  switch (granularity) {
    case RevenueChartIntervalUnit.Year:
      return new Date(Date.UTC(year + 1, month, day, hour, 0, 0, 0))
    case RevenueChartIntervalUnit.Month:
      return new Date(Date.UTC(year, month + 1, day, hour, 0, 0, 0))
    case RevenueChartIntervalUnit.Week:
      return new Date(Date.UTC(year, month, day + 7, hour, 0, 0, 0))
    case RevenueChartIntervalUnit.Day:
      return new Date(Date.UTC(year, month, day + 1, hour, 0, 0, 0))
    case RevenueChartIntervalUnit.Hour:
      return new Date(Date.UTC(year, month, day, hour + 1, 0, 0, 0))
    default:
      return new Date(Date.UTC(year, month + 1, day, hour, 0, 0, 0))
  }
}

/**
 * Fills missing intervals with zero values.
 * Ensures we always return a complete array with zeros for gaps.
 */
function fillMissingIntervals(
  startDate: Date,
  endDate: Date,
  granularity: RevenueChartIntervalUnit,
  results: Map<string, number>
): UsageVolumeDataPoint[] {
  const dataPoints: UsageVolumeDataPoint[] = []
  let currentDate = dateTruncUTC(startDate, granularity)
  const endTruncated = dateTruncUTC(endDate, granularity)

  while (currentDate <= endTruncated) {
    const dateKey = currentDate.toISOString()
    dataPoints.push({
      date: currentDate,
      amount: results.get(dateKey) ?? 0,
    })
    currentDate = addIntervalUTC(currentDate, granularity)
  }

  return dataPoints
}

/**
 * Calculates SUM(amount) for usage events grouped by date interval.
 */
async function calculateSumUsage(
  options: UsageCalculationOptions & { pricingModelId?: string },
  transaction: DbTransaction
): Promise<Map<string, number>> {
  const {
    startDate,
    endDate,
    granularity,
    usageMeterId,
    pricingModelId,
    livemode,
  } = options
  const intervalSql = granularityToPostgresSql(granularity)

  // Convert Date objects to timestamps (epoch ms) since usageDate stores numbers
  const startTimestamp = startDate.getTime()
  const endTimestamp = endDate.getTime()

  const conditions = [
    eq(usageEvents.usageMeterId, usageMeterId),
    eq(usageEvents.livemode, livemode),
    gte(usageEvents.usageDate, startTimestamp),
    lte(usageEvents.usageDate, endTimestamp),
  ]

  // Filter by pricing model if provided (product filter)
  if (pricingModelId) {
    conditions.push(eq(usageEvents.pricingModelId, pricingModelId))
  }

  // Use double AT TIME ZONE 'UTC' to ensure proper timestamptz return:
  // 1. First AT TIME ZONE 'UTC' converts epoch ms to timestamp at UTC
  // 2. Second AT TIME ZONE 'UTC' converts timestamp back to timestamptz
  // This ensures the Postgres driver correctly interprets the result as UTC
  const results = await transaction
    .select({
      date: sql<Date>`(date_trunc(${sql.raw(`'${intervalSql}'`)}, ${usageEvents.usageDate} AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`.as(
        'date'
      ),
      amount: sql<number>`COALESCE(SUM(${usageEvents.amount}), 0)`.as(
        'amount'
      ),
    })
    .from(usageEvents)
    .where(and(...conditions))
    .groupBy(
      sql`(date_trunc(${sql.raw(`'${intervalSql}'`)}, ${usageEvents.usageDate} AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`
    )
    .orderBy(
      sql`(date_trunc(${sql.raw(`'${intervalSql}'`)}, ${usageEvents.usageDate} AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`
    )

  const resultMap = new Map<string, number>()
  for (const row of results) {
    const dateKey = new Date(row.date).toISOString()
    resultMap.set(dateKey, Number(row.amount))
  }

  return resultMap
}

/**
 * Calculates COUNT(DISTINCT properties::text) for usage events grouped by date interval.
 * This counts distinct property combinations per interval (DAU semantics).
 */
async function calculateCountDistinctUsage(
  options: UsageCalculationOptions & { pricingModelId?: string },
  transaction: DbTransaction
): Promise<Map<string, number>> {
  const {
    startDate,
    endDate,
    granularity,
    usageMeterId,
    pricingModelId,
    livemode,
  } = options
  const intervalSql = granularityToPostgresSql(granularity)

  // Convert Date objects to timestamps (epoch ms) since usageDate stores numbers
  const startTimestamp = startDate.getTime()
  const endTimestamp = endDate.getTime()

  const conditions = [
    eq(usageEvents.usageMeterId, usageMeterId),
    eq(usageEvents.livemode, livemode),
    gte(usageEvents.usageDate, startTimestamp),
    lte(usageEvents.usageDate, endTimestamp),
  ]

  // Filter by pricing model if provided (product filter)
  if (pricingModelId) {
    conditions.push(eq(usageEvents.pricingModelId, pricingModelId))
  }

  // Use double AT TIME ZONE 'UTC' to ensure proper timestamptz return:
  // 1. First AT TIME ZONE 'UTC' converts epoch ms to timestamp at UTC
  // 2. Second AT TIME ZONE 'UTC' converts timestamp back to timestamptz
  // This ensures the Postgres driver correctly interprets the result as UTC
  const results = await transaction
    .select({
      date: sql<Date>`(date_trunc(${sql.raw(`'${intervalSql}'`)}, ${usageEvents.usageDate} AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`.as(
        'date'
      ),
      amount:
        sql<number>`COUNT(DISTINCT ${usageEvents.properties}::text)`.as(
          'amount'
        ),
    })
    .from(usageEvents)
    .where(and(...conditions))
    .groupBy(
      sql`(date_trunc(${sql.raw(`'${intervalSql}'`)}, ${usageEvents.usageDate} AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`
    )
    .orderBy(
      sql`(date_trunc(${sql.raw(`'${intervalSql}'`)}, ${usageEvents.usageDate} AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`
    )

  const resultMap = new Map<string, number>()
  for (const row of results) {
    const dateKey = new Date(row.date).toISOString()
    resultMap.set(dateKey, Number(row.amount))
  }

  return resultMap
}

/**
 * Calculates usage volume by interval for a given usage meter.
 * Delegates to the appropriate calculation method based on the meter's aggregation type.
 *
 * @param organizationId - The organization ID (for security validation)
 * @param options - Calculation options including date range, granularity, and meter ID
 * @param transaction - Database transaction
 * @returns Array of data points with date and amount for each interval
 * @throws TRPCError NOT_FOUND if meter doesn't belong to the organization
 */
export async function calculateUsageVolumeByInterval(
  organizationId: string,
  options: UsageCalculationOptions,
  transaction: DbTransaction
): Promise<UsageVolumeDataPoint[]> {
  const { startDate, endDate, granularity, usageMeterId, productId } =
    options

  // Fetch the usage meter and validate ownership
  const [meter] = await transaction
    .select({
      id: usageMeters.id,
      aggregationType: usageMeters.aggregationType,
      organizationId: usageMeters.organizationId,
    })
    .from(usageMeters)
    .where(eq(usageMeters.id, usageMeterId))
    .limit(1)

  if (!meter) {
    // biome-ignore lint/plugin: Domain error for boundary contexts to catch and handle
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Usage meter not found',
    })
  }

  // Security: Validate meter belongs to the organization
  if (meter.organizationId !== organizationId) {
    // biome-ignore lint/plugin: Domain error for boundary contexts to catch and handle
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Usage meter not found',
    })
  }

  // If product filter is provided, get its pricing model ID
  let pricingModelId: string | undefined
  if (productId) {
    const [product] = await transaction
      .select({
        pricingModelId: products.pricingModelId,
      })
      .from(products)
      .where(
        and(
          eq(products.id, productId),
          eq(products.organizationId, organizationId)
        )
      )
      .limit(1)

    // If product not found (or doesn't belong to org) or has no pricing model, return zeros
    if (!product || !product.pricingModelId) {
      return fillMissingIntervals(
        startDate,
        endDate,
        granularity,
        new Map()
      )
    }

    pricingModelId = product.pricingModelId
  }

  // Calculate based on aggregation type
  const calculationOptions = {
    ...options,
    pricingModelId,
  }

  let results: Map<string, number>
  if (
    meter.aggregationType ===
    UsageMeterAggregationType.CountDistinctProperties
  ) {
    results = await calculateCountDistinctUsage(
      calculationOptions,
      transaction
    )
  } else {
    // Default to Sum aggregation
    results = await calculateSumUsage(calculationOptions, transaction)
  }

  // Fill missing intervals with zeros
  return fillMissingIntervals(
    startDate,
    endDate,
    granularity,
    results
  )
}

/**
 * Gets usage meters that have at least one event matching the given livemode.
 * Returns ALL meters with events (decoupled from product filter).
 *
 * NOTE: No productId parameter - this function always returns ALL meters with
 * events matching the livemode, regardless of product. The product filter only affects
 * the DATA displayed (via getUsageVolume), not the meter list.
 *
 * @param organizationId - The organization ID
 * @param livemode - Whether to filter for livemode (production) or testmode events
 * @param transaction - Database transaction
 * @returns Array of meters with events (id, name, aggregationType, pricingModelId)
 */
export async function getUsageMetersWithEvents(
  organizationId: string,
  livemode: boolean,
  transaction: DbTransaction
): Promise<UsageMeterWithEvents[]> {
  // Get customer IDs for this organization (for joining to usage events)
  const customerIds = await transaction
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.organizationId, organizationId))

  if (customerIds.length === 0) {
    return []
  }

  const customerIdList = customerIds.map((c) => c.id)

  // Build conditions for usage events - filter by livemode for org's customers
  const eventConditions = [
    eq(usageEvents.livemode, livemode),
    inArray(usageEvents.customerId, customerIdList),
  ]

  // Get distinct meter IDs that have events matching the livemode
  const metersWithEvents = await transaction
    .selectDistinct({
      usageMeterId: usageEvents.usageMeterId,
    })
    .from(usageEvents)
    .where(and(...eventConditions))

  if (metersWithEvents.length === 0) {
    return []
  }

  const meterIds = metersWithEvents.map((m) => m.usageMeterId)

  // Fetch meter details, filtered by organization
  const meters = await transaction
    .select({
      id: usageMeters.id,
      name: usageMeters.name,
      aggregationType: usageMeters.aggregationType,
      pricingModelId: usageMeters.pricingModelId,
    })
    .from(usageMeters)
    .where(
      and(
        inArray(usageMeters.id, meterIds),
        eq(usageMeters.organizationId, organizationId)
      )
    )
    .orderBy(usageMeters.name)

  return meters.map((m) => ({
    id: m.id,
    name: m.name,
    aggregationType: m.aggregationType as UsageMeterAggregationType,
    pricingModelId: m.pricingModelId,
  }))
}
