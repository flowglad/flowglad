import { trpc } from '@/app/_trpc/client'
import type {
  ChartDataParams,
  ChartDataPoint,
  MetricType,
} from '@/lib/metrics/types'
import { formatDateUTC } from '@/utils/chart/dateFormatting'
import { createChartTooltipMetadata } from '@/utils/chart/types'

/**
 * Return type for the useMetricData hook.
 */
export interface UseMetricDataResult {
  /** Transformed chart data points ready for LineChart */
  data: ChartDataPoint[]
  /** Raw numeric values for computing display value */
  rawValues: number[]
  /** Whether the query is loading */
  isLoading: boolean
  /** Max value for Y-axis scaling */
  maxValue: number
}

/**
 * Hook for fetching and transforming metric data.
 * Uses tRPC's `enabled` option to only fetch data for the active metric,
 * preventing unnecessary API calls when switching between metrics.
 *
 * @param metric - The currently selected metric type
 * @param params - Chart data parameters (date range, interval, org ID)
 * @returns Transformed chart data and loading state
 *
 * @example
 * const { data, isLoading, maxValue } = useMetricData('revenue', {
 *   fromDate,
 *   toDate,
 *   interval,
 *   organizationId: organization?.id ?? '',
 * })
 */
export function useMetricData(
  metric: MetricType,
  params: ChartDataParams
): UseMetricDataResult {
  const { fromDate, toDate, interval, organizationId, productId } =
    params

  // Revenue query - only enabled when metric === 'revenue'
  const revenueQuery = trpc.organizations.getRevenue.useQuery(
    {
      organizationId,
      revenueChartIntervalUnit: interval,
      fromDate,
      toDate,
      productId: productId ?? undefined, // Revenue already supports productId
    },
    { enabled: metric === 'revenue' && !!organizationId }
  )

  // MRR query - only enabled when metric === 'mrr'
  const mrrQuery = trpc.organizations.getMRR.useQuery(
    {
      startDate: fromDate,
      endDate: toDate,
      granularity: interval,
      productId: productId ?? undefined,
    },
    { enabled: metric === 'mrr' && !!organizationId }
  )

  // Subscribers query - only enabled when metric === 'subscribers'
  const subscribersQuery =
    trpc.organizations.getActiveSubscribers.useQuery(
      {
        startDate: fromDate,
        endDate: toDate,
        granularity: interval,
        productId: productId ?? undefined,
      },
      { enabled: metric === 'subscribers' && !!organizationId }
    )

  // ─────────────────────────────────────────────────────────────────
  // Query Registry: Maps metrics to their queries for unified access
  // Adding a new metric? Just add it here and TypeScript will guide you.
  // ─────────────────────────────────────────────────────────────────
  const queryRegistry = {
    revenue: revenueQuery,
    mrr: mrrQuery,
    subscribers: subscribersQuery,
  } as const

  // Type safety: This will cause a TypeScript error if MetricType is extended but registry is not updated
  const _registryTypeCheck: Record<
    MetricType,
    (typeof queryRegistry)[keyof typeof queryRegistry]
  > = queryRegistry

  // ─────────────────────────────────────────────────────────────────
  // UNIFIED Loading State: Defined ONCE, works for ALL metrics
  //
  // We show loading state when:
  // 1. isPending: Query has never successfully returned data
  // 2. !data: Observer doesn't have data available yet
  //
  // This handles the critical edge case where:
  // - Query succeeded before (isPending=false) from another chart instance
  // - Cache has fresh data so no fetch is needed (isFetching=false)
  // - But observer hasn't synced with cache yet (data=undefined)
  //
  // The previous fix `isPending || (isFetching && !data)` missed this
  // because the AND condition doesn't trigger when isFetching is false.
  // ─────────────────────────────────────────────────────────────────
  const activeQuery = queryRegistry[metric]
  const isLoading = activeQuery.isPending || !activeQuery.data

  // Transform revenue data to chart format
  const transformRevenueData = (): {
    data: ChartDataPoint[]
    rawValues: number[]
  } => {
    if (!revenueQuery.data) return { data: [], rawValues: [] }
    const rawValues: number[] = []
    const data = revenueQuery.data.map((item, index) => {
      const dateObj = new Date(item.date)
      const value = Math.round(Number(item.revenue) * 100) / 100
      rawValues.push(value)
      return {
        date: formatDateUTC(dateObj, interval),
        value,
        ...createChartTooltipMetadata({
          date: dateObj,
          intervalUnit: interval,
          rangeStart: fromDate,
          rangeEnd: toDate,
          index,
          totalPoints: revenueQuery.data.length,
        }),
      }
    })
    return { data, rawValues }
  }

  // Transform MRR data to chart format
  const transformMrrData = (): {
    data: ChartDataPoint[]
    rawValues: number[]
  } => {
    if (!mrrQuery.data) return { data: [], rawValues: [] }
    const rawValues: number[] = []
    const data = mrrQuery.data.map((item, index) => {
      const dateObj = new Date(item.month)
      const value = Number(item.amount)
      rawValues.push(value)
      return {
        date: formatDateUTC(dateObj, interval),
        value,
        ...createChartTooltipMetadata({
          date: dateObj,
          intervalUnit: interval,
          rangeStart: fromDate,
          rangeEnd: toDate,
          index,
          totalPoints: mrrQuery.data.length,
        }),
      }
    })
    return { data, rawValues }
  }

  // Transform subscribers data to chart format
  const transformSubscribersData = (): {
    data: ChartDataPoint[]
    rawValues: number[]
  } => {
    if (!subscribersQuery.data) return { data: [], rawValues: [] }
    const rawValues: number[] = []
    const data = subscribersQuery.data.map((item, index) => {
      const dateObj = new Date(item.month)
      const value = item.count
      rawValues.push(value)
      return {
        date: formatDateUTC(dateObj, interval),
        value,
        ...createChartTooltipMetadata({
          date: dateObj,
          intervalUnit: interval,
          rangeStart: fromDate,
          rangeEnd: toDate,
          index,
          totalPoints: subscribersQuery.data.length,
        }),
      }
    })
    return { data, rawValues }
  }

  // ─────────────────────────────────────────────────────────────────
  // Data Selection: Get transformed data for current metric
  // Note: isLoading is NOT computed here - it's unified above
  // ─────────────────────────────────────────────────────────────────
  const getTransformedData = (): {
    data: ChartDataPoint[]
    rawValues: number[]
  } => {
    switch (metric) {
      case 'revenue':
        return transformRevenueData()
      case 'mrr':
        return transformMrrData()
      case 'subscribers':
        return transformSubscribersData()
    }
  }

  const result = getTransformedData()

  // Calculate max value for Y-axis scaling
  const maxValue =
    result.rawValues.length > 0 ? Math.max(...result.rawValues) : 0

  return {
    data: result.data,
    rawValues: result.rawValues,
    isLoading, // ← From unified logic above, NOT per-case
    maxValue,
  }
}
