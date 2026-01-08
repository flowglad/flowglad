// Tremor LineChart [v0.3.2]
// Refactored to use modular components from LineChart/ directory

'use client'

import React from 'react'
import { mergeRefs } from 'react-merge-refs'
import {
  Area,
  CartesianGrid,
  Dot,
  Label,
  Line,
  ComposedChart as RechartsComposedChart,
  Legend as RechartsLegend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AxisDomain } from 'recharts/types/util/types'

import { cn } from '@/lib/utils'
import { RevenueChartIntervalUnit } from '@/types'
import {
  AvailableChartColors,
  type AvailableChartColorsKeys,
  constructCategoryColors,
  getColorClassName,
  getYAxisDomain,
  hasOnlyOneValueForKey,
} from '@/utils/chartStyles'

// Import modular components
import { useContainerSize } from './LineChart/hooks/useContainerSize'
import {
  ChartLegend,
  type RechartsLegendPayloadItem,
} from './LineChart/Legend'
import {
  ChartTooltip,
  type ChartTooltipProps,
  type PayloadItem,
  type TooltipProps,
} from './LineChart/Tooltip'
import { getCSSColorValue } from './LineChart/utils/colors'

//#region Types for Recharts callbacks

/**
 * Props provided by Recharts to X-axis tick render functions.
 */
interface RechartsXAxisTickProps {
  x: number
  y: number
  payload: { value: string | number }
  index: number
  fill?: string
  stroke?: string
  textAnchor?: string
  verticalAnchor?: string
}

/**
 * Props provided by Recharts to dot/activeDot render functions.
 */
interface RechartsDotProps {
  cx: number
  cy: number
  r?: number
  stroke?: string
  strokeWidth?: number
  strokeLinecap?: 'butt' | 'round' | 'square'
  strokeLinejoin?: 'miter' | 'round' | 'bevel'
  fill?: string
  dataKey?: string
  index?: number
  payload?: Record<string, unknown>
}

//#region LineChart

interface ActiveDot {
  index?: number
  dataKey?: string
}

type BaseEventProps = {
  eventType: 'dot' | 'category'
  categoryClicked: string
  [key: string]: number | string
}

type LineChartEventProps = BaseEventProps | null | undefined

interface LineChartProps
  extends React.HTMLAttributes<HTMLDivElement> {
  data: Record<string, unknown>[]
  index: string
  categories: string[]
  colors?: AvailableChartColorsKeys[]
  valueFormatter?: (value: number) => string
  yAxisValueFormatter?: (value: number) => string
  startEndOnly?: boolean
  showXAxis?: boolean
  showYAxis?: boolean
  showGridLines?: boolean
  yAxisWidth?: number
  intervalType?: 'preserveStartEnd' | 'equidistantPreserveStart'
  showTooltip?: boolean
  showLegend?: boolean
  autoMinValue?: boolean
  minValue?: number
  maxValue?: number
  allowDecimals?: boolean
  onValueChange?: (value: LineChartEventProps) => void
  enableLegendSlider?: boolean
  tickGap?: number
  connectNulls?: boolean
  xAxisLabel?: string
  yAxisLabel?: string
  legendPosition?: 'left' | 'center' | 'right'
  tooltipCallback?: (tooltipCallbackContent: TooltipProps) => void
  customTooltip?: React.ComponentType<TooltipProps>
  startEndOnlyYAxis?: boolean
  /** Fill style for the area under the line. Defaults to 'none' for backwards compatibility. */
  fill?: 'gradient' | 'solid' | 'none'
  /** The time interval unit of the data. Used for smart grid line sampling when there are many data points. */
  intervalUnit?: RevenueChartIntervalUnit
}

/**
 * Maximum number of grid lines to show before sampling kicks in.
 * This keeps charts readable while still allowing hover on all data points.
 */
const MAX_GRID_LINES = 35

/**
 * Calculates a smart sampling interval that snaps to meaningful time boundaries.
 * Returns 0 if no sampling needed, otherwise the interval step.
 *
 * @param dataLength - Number of data points
 * @param intervalUnit - The time granularity of the data (hour, day, week, month)
 * @returns The interval step (0 = show all, N = show every Nth)
 *
 * @example
 * // 168 hourly points (7 days) → sample every 6 hours = 28 grid lines
 * getSmartTickInterval(168, RevenueChartIntervalUnit.Hour) // returns 6
 *
 * // 52 weekly points (1 year) → sample every 2 weeks = 26 grid lines
 * getSmartTickInterval(52, RevenueChartIntervalUnit.Week) // returns 2
 */
function getSmartTickInterval(
  dataLength: number,
  intervalUnit?: RevenueChartIntervalUnit
): number {
  if (dataLength <= MAX_GRID_LINES) return 0 // Show all ticks

  const baseInterval = Math.ceil(dataLength / MAX_GRID_LINES)

  // Snap to meaningful time boundaries based on the data's granularity
  switch (intervalUnit) {
    case RevenueChartIntervalUnit.Hour:
      // Snap to clock-friendly intervals: 2, 3, 4, 6, 12 hours
      const hourOptions = [2, 3, 4, 6, 12]
      return hourOptions.find((h) => h >= baseInterval) || 12

    case RevenueChartIntervalUnit.Day:
      // Snap to 7 days (weekly boundaries) when needed
      return baseInterval >= 4 ? 7 : baseInterval

    case RevenueChartIntervalUnit.Week:
      // Snap to 2 or 4 weeks (bi-weekly or monthly rhythm)
      const weekOptions = [2, 4]
      return weekOptions.find((w) => w >= baseInterval) || 4

    case RevenueChartIntervalUnit.Month:
      // Snap to quarterly (3 months) if needed
      return baseInterval >= 2 ? 3 : baseInterval

    default:
      return baseInterval
  }
}

const LineChart = React.forwardRef<HTMLDivElement, LineChartProps>(
  (props, ref) => {
    const {
      data = [],
      categories = [],
      index,
      colors = AvailableChartColors,
      valueFormatter = (value: number) => value.toString(),
      yAxisValueFormatter = valueFormatter,
      startEndOnly = false,
      showXAxis = true,
      showYAxis = true,
      showGridLines = true,
      yAxisWidth = 56,
      intervalType = 'equidistantPreserveStart',
      showTooltip = true,
      showLegend = false,
      autoMinValue = false,
      minValue,
      maxValue,
      allowDecimals = true,
      connectNulls = false,
      className,
      onValueChange,
      enableLegendSlider = false,
      tickGap = 5,
      xAxisLabel,
      yAxisLabel,
      legendPosition = 'right',
      tooltipCallback,
      customTooltip,
      startEndOnlyYAxis = false,
      fill = 'none',
      intervalUnit,
      ...other
    } = props
    const { containerRef, width, height } = useContainerSize()
    const CustomTooltip = customTooltip
    const paddingValue =
      (!showXAxis && !showYAxis) || (startEndOnly && !showYAxis)
        ? 0
        : 20
    const [legendHeight, setLegendHeight] = React.useState(60)
    const [activeDot, setActiveDot] = React.useState<
      ActiveDot | undefined
    >(undefined)
    const [activeLegend, setActiveLegend] = React.useState<
      string | undefined
    >(undefined)
    const categoryColors = constructCategoryColors(categories, colors)
    const areaId = React.useId()

    /**
     * Returns the SVG gradient stop content based on fill type.
     * Uses the actual CSS color value to avoid currentColor inheritance issues in SVG defs.
     */
    const getFillContent = (category: string) => {
      const stopOpacity =
        activeDot || (activeLegend && activeLegend !== category)
          ? 0.01
          : 0.1

      const colorValue = getCSSColorValue(
        categoryColors.get(category) as AvailableChartColorsKeys
      )

      switch (fill) {
        case 'none':
          return <stop stopColor={colorValue} stopOpacity={0} />
        case 'gradient':
          return (
            <>
              <stop
                offset="5%"
                stopColor={colorValue}
                stopOpacity={stopOpacity}
              />
              <stop
                offset="95%"
                stopColor={colorValue}
                stopOpacity={0}
              />
            </>
          )
        case 'solid':
        default:
          return (
            <stop stopColor={colorValue} stopOpacity={stopOpacity} />
          )
      }
    }

    const dataWithUniqueIds = React.useMemo(
      () =>
        data.map((item, index) => ({ ...item, __uniqueId: index })),
      [data]
    )

    const yAxisDomain = getYAxisDomain(
      autoMinValue,
      minValue,
      maxValue,
      0.2 // 20% padding above max value for visual breathing room
    )

    // Smart grid line sampling: show one tick per data point up to MAX_GRID_LINES,
    // then sample at meaningful time boundaries to prevent visual overload.
    // Labels are only rendered for first/last points when startEndOnly is true.
    const xAxisInterval = React.useMemo(() => {
      if (!startEndOnly) return intervalType

      // Use smart sampling when we have many data points
      const smartInterval = getSmartTickInterval(
        data.length,
        intervalUnit
      )
      return smartInterval
    }, [startEndOnly, intervalType, data.length, intervalUnit])

    const hasOnValueChange = !!onValueChange
    const prevActiveRef = React.useRef<boolean | undefined>(undefined)
    const prevLabelRef = React.useRef<string | undefined>(undefined)

    function onDotClick(
      itemData: RechartsDotProps,
      event: React.MouseEvent
    ) {
      event.stopPropagation()

      if (!hasOnValueChange) return
      if (
        (itemData.index === activeDot?.index &&
          itemData.dataKey === activeDot?.dataKey) ||
        (itemData.dataKey &&
          hasOnlyOneValueForKey(data, itemData.dataKey) &&
          activeLegend &&
          activeLegend === itemData.dataKey)
      ) {
        setActiveLegend(undefined)
        setActiveDot(undefined)
        onValueChange?.(null)
      } else {
        setActiveLegend(itemData.dataKey)
        setActiveDot({
          index: itemData.index,
          dataKey: itemData.dataKey,
        })
        onValueChange?.({
          eventType: 'dot',
          categoryClicked: itemData.dataKey ?? '',
          ...(itemData.payload as Record<string, string | number>),
        })
      }
    }

    function onCategoryClick(dataKey: string) {
      if (!hasOnValueChange) return
      if (
        (dataKey === activeLegend && !activeDot) ||
        (hasOnlyOneValueForKey(data, dataKey) &&
          activeDot &&
          activeDot.dataKey === dataKey)
      ) {
        setActiveLegend(undefined)
        onValueChange?.(null)
      } else {
        setActiveLegend(dataKey)
        onValueChange?.({
          eventType: 'category',
          categoryClicked: dataKey,
        })
      }
      setActiveDot(undefined)
    }

    return (
      <div
        ref={mergeRefs([ref, containerRef])}
        className={cn('h-80 w-full', className)}
        tremor-id="tremor-raw"
        {...other}
      >
        {/*
         * Chart Sizing Mechanism:
         * 1. The outer div is set to h-80 (20rem) and w-full by default, making it fill its parent's width
         * 2. ResponsiveContainer wraps the chart and is set to 100% width and height, so it fills the outer div
         * 3. useContainerSize hook uses ResizeObserver to track the actual pixel dimensions of the outer div
         * 4. These dimensions (width & height) are passed to RechartsLineChart, which uses them for internal calculations
         * 5. When the container resizes:
         *    - ResizeObserver detects the change and updates width/height state
         *    - These new dimensions flow to RechartsLineChart
         *    - ResponsiveContainer ensures smooth transitions and maintains aspect ratio
         */}
        <ResponsiveContainer width={'100%'} height={'100%'}>
          <RechartsComposedChart
            data={dataWithUniqueIds}
            width={width || 800}
            height={height || 300}
            onClick={
              hasOnValueChange && (activeLegend || activeDot)
                ? () => {
                    setActiveDot(undefined)
                    setActiveLegend(undefined)
                    onValueChange?.(null)
                  }
                : undefined
            }
            margin={{
              bottom: xAxisLabel ? 30 : undefined,
              left: 16,
              right: 16,
              top: 5,
            }}
          >
            {showGridLines ? (
              <CartesianGrid
                className="stroke-border stroke-1"
                horizontal={false}
                vertical={true}
              />
            ) : null}
            <XAxis
              padding={{ left: paddingValue, right: paddingValue }}
              hide={!showXAxis}
              dataKey={index}
              interval={xAxisInterval}
              tick={
                startEndOnly
                  ? (props: RechartsXAxisTickProps) => {
                      const {
                        x,
                        y,
                        payload,
                        index: tickIndex,
                      } = props
                      const isFirst = tickIndex === 0

                      // Calculate the last visible tick index accounting for sampling interval
                      // When interval > 0, ticks appear at 0, interval, 2*interval, etc.
                      const interval =
                        typeof xAxisInterval === 'number' &&
                        xAxisInterval > 0
                          ? xAxisInterval
                          : 1
                      const lastVisibleTickIndex =
                        Math.floor((data.length - 1) / interval) *
                        interval
                      const isLast =
                        tickIndex === lastVisibleTickIndex

                      // Only render first and last labels
                      if (!isFirst && !isLast) return <g />

                      // Adjust text anchor to prevent clipping at edges
                      const textAnchor = isFirst ? 'start' : 'end'

                      return (
                        <text
                          x={x}
                          y={y + 12}
                          textAnchor={textAnchor}
                          className="text-sm fill-muted-foreground"
                        >
                          {payload.value}
                        </text>
                      )
                    }
                  : { transform: 'translate(0, 6)' }
              }
              fill=""
              stroke=""
              className={cn(
                // base
                'text-sm',
                // text fill
                'fill-muted-foreground'
              )}
              tickLine={
                startEndOnly
                  ? false
                  : { stroke: 'hsl(var(--border))' }
              }
              axisLine={{ stroke: 'hsl(var(--border))' }}
              minTickGap={tickGap}
            >
              {xAxisLabel && (
                <Label
                  position="insideBottom"
                  offset={-20}
                  className="fill-foreground text-sm font-medium"
                >
                  {xAxisLabel}
                </Label>
              )}
            </XAxis>
            {/* Y-Axis Configuration:
             * - Shows only a single tick when minValue equals maxValue to avoid redundant labels
             * - This improves readability when all data points have the same value
             * - Otherwise uses default ticks or [0, maxValue] when startEndOnlyYAxis is true
             */}
            <YAxis
              width={yAxisWidth}
              hide={!showYAxis}
              axisLine={false}
              tickLine={false}
              type="number"
              domain={yAxisDomain as AxisDomain}
              fill=""
              stroke=""
              className={cn(
                // base
                'text-xs',
                // text fill
                'fill-muted-foreground'
              )}
              ticks={
                minValue !== undefined &&
                maxValue !== undefined &&
                minValue === maxValue
                  ? [minValue]
                  : startEndOnlyYAxis
                    ? maxValue === 0
                      ? [0]
                      : [0, maxValue || 0]
                    : undefined
              }
              allowDecimals={allowDecimals}
              tickFormatter={yAxisValueFormatter}
            >
              {yAxisLabel && (
                <Label
                  position="insideLeft"
                  style={{ textAnchor: 'middle' }}
                  angle={-90}
                  offset={-15}
                  className="fill-foreground text-sm font-medium"
                >
                  {yAxisLabel}
                </Label>
              )}
            </YAxis>
            <Tooltip
              wrapperStyle={{ outline: 'none' }}
              isAnimationActive={true}
              animationDuration={100}
              cursor={{
                stroke: 'hsl(var(--muted-foreground))',
                strokeWidth: 1,
              }}
              offset={8}
              position={{ y: 16 }}
              content={({ active, payload, label }) => {
                const cleanPayload: TooltipProps['payload'] = payload
                  ? payload.map((item) => ({
                      category: String(item.dataKey ?? ''),
                      value: Number(item.value ?? 0),
                      index: String(
                        (item.payload as Record<string, unknown>)?.[
                          index
                        ] ?? ''
                      ),
                      color: categoryColors.get(
                        String(item.dataKey ?? '')
                      ) as AvailableChartColorsKeys,
                      type: item.type,
                      payload:
                        (item.payload as Record<string, unknown>) ??
                        {},
                    }))
                  : []

                if (
                  tooltipCallback &&
                  (active !== prevActiveRef.current ||
                    label !== prevLabelRef.current)
                ) {
                  tooltipCallback({
                    active,
                    payload: cleanPayload,
                    label,
                  })
                  prevActiveRef.current = active
                  prevLabelRef.current = label
                }

                return showTooltip && active ? (
                  CustomTooltip ? (
                    <CustomTooltip
                      active={active}
                      payload={cleanPayload}
                      label={label}
                    />
                  ) : (
                    <ChartTooltip
                      active={active}
                      payload={cleanPayload}
                      label={label}
                      valueFormatter={valueFormatter}
                    />
                  )
                ) : null
              }}
            />

            {showLegend ? (
              <RechartsLegend
                verticalAlign="top"
                height={legendHeight}
                content={({ payload }) =>
                  ChartLegend(
                    {
                      payload: (payload ??
                        []) as RechartsLegendPayloadItem[],
                    },
                    categoryColors,
                    setLegendHeight,
                    activeLegend,
                    hasOnValueChange
                      ? (clickedLegendItem: string) =>
                          onCategoryClick(clickedLegendItem)
                      : undefined,
                    enableLegendSlider,
                    legendPosition,
                    yAxisWidth
                  )
                }
              />
            ) : null}
            {/* Gradient definitions for area fills */}
            {fill !== 'none' && (
              <defs>
                {categories.map((category, index) => {
                  const categoryId = `${areaId}-${index}-${category.replace(/[^a-zA-Z0-9]/g, '')}`
                  return (
                    <linearGradient
                      key={categoryId}
                      id={categoryId}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      {getFillContent(category)}
                    </linearGradient>
                  )
                })}
              </defs>
            )}
            {/* Gradient fill areas - rendered behind the lines */}
            {fill !== 'none' &&
              categories.map((category, index) => {
                const categoryId = `${areaId}-${index}-${category.replace(/[^a-zA-Z0-9]/g, '')}`
                return (
                  <Area
                    key={`area-${category}`}
                    type="linear"
                    dataKey={category}
                    name={`${category}-area`}
                    stroke="transparent"
                    strokeWidth={0}
                    fill={`url(#${categoryId})`}
                    fillOpacity={1}
                    isAnimationActive={false}
                    connectNulls={connectNulls}
                    activeDot={false}
                    dot={false}
                    legendType="none"
                    tooltipType="none"
                  />
                )
              })}
            {categories.map((category) => (
              <Line
                className={cn(
                  getColorClassName(
                    categoryColors.get(
                      category
                    ) as AvailableChartColorsKeys,
                    'stroke'
                  )
                )}
                stroke={getCSSColorValue(
                  categoryColors.get(
                    category
                  ) as AvailableChartColorsKeys
                )}
                strokeOpacity={
                  activeDot ||
                  (activeLegend && activeLegend !== category)
                    ? 0.3
                    : 1
                }
                activeDot={(props: unknown) => {
                  const dotProps = props as RechartsDotProps
                  const {
                    cx: cxCoord,
                    cy: cyCoord,
                    strokeLinecap,
                    strokeLinejoin,
                  } = dotProps
                  return (
                    <Dot
                      className={cn(
                        onValueChange ? 'cursor-pointer' : ''
                      )}
                      cx={cxCoord}
                      cy={cyCoord}
                      r={5}
                      fill="hsl(var(--background))"
                      stroke="hsl(var(--foreground))"
                      strokeLinecap={strokeLinecap}
                      strokeLinejoin={strokeLinejoin}
                      strokeWidth={2}
                      onClick={(_, event) =>
                        onDotClick(dotProps, event)
                      }
                    />
                  )
                }}
                dot={(props: unknown) => {
                  const dotProps = props as RechartsDotProps
                  const {
                    stroke,
                    strokeLinecap,
                    strokeLinejoin,
                    strokeWidth,
                    cx: cxCoord,
                    cy: cyCoord,
                    index: dotIndex,
                  } = dotProps

                  if (
                    (hasOnlyOneValueForKey(data, category) &&
                      !(
                        activeDot ||
                        (activeLegend && activeLegend !== category)
                      )) ||
                    (activeDot?.index === dotIndex &&
                      activeDot?.dataKey === category)
                  ) {
                    return (
                      <Dot
                        key={dotIndex}
                        cx={cxCoord}
                        cy={cyCoord}
                        r={5}
                        stroke={stroke}
                        fill=""
                        strokeLinecap={strokeLinecap}
                        strokeLinejoin={strokeLinejoin}
                        strokeWidth={strokeWidth}
                        className={cn(
                          'stroke-foreground fill-foreground',
                          onValueChange ? 'cursor-pointer' : ''
                        )}
                      />
                    )
                  }
                  return (
                    <React.Fragment key={dotIndex}></React.Fragment>
                  )
                }}
                key={category}
                name={category}
                type="linear"
                dataKey={category}
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                isAnimationActive={false}
                connectNulls={connectNulls}
              />
            ))}
            {/* hidden lines to increase clickable target area */}
            {onValueChange
              ? categories.map((category) => (
                  <Line
                    className={cn('cursor-pointer')}
                    strokeOpacity={0}
                    key={category}
                    name={category}
                    type="linear"
                    dataKey={category}
                    stroke="transparent"
                    fill="transparent"
                    legendType="none"
                    tooltipType="none"
                    strokeWidth={12}
                    connectNulls={connectNulls}
                    onClick={(props, event) => {
                      event.stopPropagation()
                      const lineProps = props as { name?: string }
                      onCategoryClick(lineProps.name ?? category)
                    }}
                  />
                ))
              : null}
          </RechartsComposedChart>
        </ResponsiveContainer>
      </div>
    )
  }
)

LineChart.displayName = 'LineChart'

// Re-export types from modular components for backward compatibility
export type { ChartTooltipProps, PayloadItem, TooltipProps }

export { LineChart, type LineChartEventProps }
