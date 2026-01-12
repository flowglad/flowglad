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
  const { fromDate, toDate, interval, organizationId } = params

  // Revenue query - only enabled when metric === 'revenue'
  const revenueQuery = trpc.organizations.getRevenue.useQuery(
    {
      organizationId,
      revenueChartIntervalUnit: interval,
      fromDate,
      toDate,
    },
    { enabled: metric === 'revenue' && !!organizationId }
  )

  // MRR query - only enabled when metric === 'mrr'
  const mrrQuery = trpc.organizations.getMRR.useQuery(
    {
      startDate: fromDate,
      endDate: toDate,
      granularity: interval,
    },
    { enabled: metric === 'mrr' }
  )

  // Subscribers query - only enabled when metric === 'subscribers'
  const subscribersQuery =
    trpc.organizations.getActiveSubscribers.useQuery(
      {
        startDate: fromDate,
        endDate: toDate,
        granularity: interval,
      },
      { enabled: metric === 'subscribers' }
    )

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

  // Get data and loading state based on selected metric
  const getMetricResult = (): {
    data: ChartDataPoint[]
    rawValues: number[]
    isLoading: boolean
  } => {
    switch (metric) {
      case 'revenue':
        return {
          ...transformRevenueData(),
          isLoading: revenueQuery.isLoading,
        }
      case 'mrr':
        return {
          ...transformMrrData(),
          isLoading: mrrQuery.isLoading,
        }
      case 'subscribers':
        return {
          ...transformSubscribersData(),
          isLoading: subscribersQuery.isLoading,
        }
    }
  }

  const result = getMetricResult()

  // Calculate max value for Y-axis scaling
  const maxValue =
    result.rawValues.length > 0 ? Math.max(...result.rawValues) : 0

  return {
    data: result.data,
    rawValues: result.rawValues,
    isLoading: result.isLoading,
    maxValue,
  }
}
