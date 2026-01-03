// Tremor LineChart [v0.3.2]

'use client'

import { RiArrowLeftSLine, RiArrowRightSLine } from '@remixicon/react'
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

import {
  AvailableChartColors,
  type AvailableChartColorsKeys,
  constructCategoryColors,
  getColorClassName,
  getYAxisDomain,
  hasOnlyOneValueForKey,
} from '@/utils/chartStyles'

// Function to get the actual CSS color value for Recharts stroke prop
const getCSSColorValue = (
  color: AvailableChartColorsKeys
): string => {
  // For foreground, return the CSS custom property directly
  if (color === 'foreground') {
    return 'hsl(var(--foreground))'
  }

  // For other colors, construct the appropriate CSS color
  const colorMap = {
    blue: '#3b82f6',
    emerald: '#10b981',
    violet: '#8b5cf6',
    amber: '#f59e0b',
    gray: '#6b7280',
    cyan: '#06b6d4',
    pink: '#ec4899',
    lime: '#84cc16',
    fuchsia: '#d946ef',
    primary: 'hsl(var(--primary))',
    stone: '#57534e',
  }

  return colorMap[color as keyof typeof colorMap] || '#6b7280'
}

import { useOnWindowResize } from '@/app/hooks/useOnWindowResize'
import { cn } from '@/lib/utils'

// Add useContainerSize hook
const useContainerSize = () => {
  const [size, setSize] = React.useState({ width: 0, height: 0 })
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setSize({ width, height })
    })

    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  return { containerRef, ...size }
}

//#region Legend

interface LegendItemProps {
  name: string
  color: AvailableChartColorsKeys
  onClick?: (name: string, color: AvailableChartColorsKeys) => void
  activeLegend?: string
}

const LegendItem = ({
  name,
  color,
  onClick,
  activeLegend,
}: LegendItemProps) => {
  const hasOnValueChange = !!onClick
  return (
    <li
      className={cn(
        // base
        'group inline-flex flex-nowrap items-center gap-1.5 whitespace-nowrap rounded px-2 py-1 transition',
        hasOnValueChange
          ? 'cursor-pointer hover:bg-accent'
          : 'cursor-default'
      )}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.(name, color)
      }}
    >
      <span
        className={cn(
          'h-[3px] w-3.5 shrink-0 rounded-full',
          getColorClassName(color, 'bg'),
          activeLegend && activeLegend !== name
            ? 'opacity-40'
            : 'opacity-100'
        )}
        aria-hidden={true}
      />
      <p
        className={cn(
          // base
          'truncate whitespace-nowrap text-xs',
          // text color
          'text-muted-foreground',
          hasOnValueChange && 'group-hover:text-accent-foreground',
          activeLegend && activeLegend !== name
            ? 'opacity-40'
            : 'opacity-100'
        )}
      >
        {name}
      </p>
    </li>
  )
}

interface ScrollButtonProps {
  icon: React.ElementType
  onClick?: () => void
  disabled?: boolean
}

const ScrollButton = ({
  icon,
  onClick,
  disabled,
}: ScrollButtonProps) => {
  const Icon = icon
  const [isPressed, setIsPressed] = React.useState(false)
  const intervalRef = React.useRef<NodeJS.Timeout | null>(null)

  React.useEffect(() => {
    if (isPressed) {
      intervalRef.current = setInterval(() => {
        onClick?.()
      }, 300)
    } else {
      clearInterval(intervalRef.current as NodeJS.Timeout)
    }
    return () => clearInterval(intervalRef.current as NodeJS.Timeout)
  }, [isPressed, onClick])

  React.useEffect(() => {
    if (disabled) {
      clearInterval(intervalRef.current as NodeJS.Timeout)
      setIsPressed(false)
    }
  }, [disabled])

  return (
    <button
      type="button"
      className={cn(
        // base
        'group inline-flex size-5 items-center truncate rounded transition',
        disabled
          ? 'cursor-not-allowed text-muted-foreground opacity-50'
          : 'cursor-pointer text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      )}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      onMouseDown={(e) => {
        e.stopPropagation()
        setIsPressed(true)
      }}
      onMouseUp={(e) => {
        e.stopPropagation()
        setIsPressed(false)
      }}
    >
      <Icon className="size-full" aria-hidden="true" />
    </button>
  )
}

interface LegendProps
  extends React.OlHTMLAttributes<HTMLOListElement> {
  categories: string[]
  colors?: AvailableChartColorsKeys[]
  onClickLegendItem?: (category: string, color: string) => void
  activeLegend?: string
  enableLegendSlider?: boolean
}

type HasScrollProps = {
  left: boolean
  right: boolean
}

const Legend = React.forwardRef<HTMLOListElement, LegendProps>(
  (props, ref) => {
    const {
      categories,
      colors = AvailableChartColors,
      className,
      onClickLegendItem,
      activeLegend,
      enableLegendSlider = false,
      ...other
    } = props
    const scrollableRef = React.useRef<HTMLInputElement>(null)
    const scrollButtonsRef = React.useRef<HTMLDivElement>(null)
    const [hasScroll, setHasScroll] =
      React.useState<HasScrollProps | null>(null)
    const [isKeyDowned, setIsKeyDowned] = React.useState<
      string | null
    >(null)
    const intervalRef = React.useRef<NodeJS.Timeout | null>(null)

    const checkScroll = React.useCallback(() => {
      const scrollable = scrollableRef?.current
      if (!scrollable) return

      const hasLeftScroll = scrollable.scrollLeft > 0
      const hasRightScroll =
        scrollable.scrollWidth - scrollable.clientWidth >
        scrollable.scrollLeft

      setHasScroll({ left: hasLeftScroll, right: hasRightScroll })
    }, [setHasScroll])

    const scrollToTest = React.useCallback(
      (direction: 'left' | 'right') => {
        const element = scrollableRef?.current
        const scrollButtons = scrollButtonsRef?.current
        const scrollButtonsWith = scrollButtons?.clientWidth ?? 0
        const width = element?.clientWidth ?? 0

        if (element && enableLegendSlider) {
          element.scrollTo({
            left:
              direction === 'left'
                ? element.scrollLeft - width + scrollButtonsWith
                : element.scrollLeft + width - scrollButtonsWith,
            behavior: 'smooth',
          })
          setTimeout(() => {
            checkScroll()
          }, 400)
        }
      },
      [enableLegendSlider, checkScroll]
    )

    React.useEffect(() => {
      const keyDownHandler = (key: string) => {
        if (key === 'ArrowLeft') {
          scrollToTest('left')
        } else if (key === 'ArrowRight') {
          scrollToTest('right')
        }
      }
      if (isKeyDowned) {
        keyDownHandler(isKeyDowned)
        intervalRef.current = setInterval(() => {
          keyDownHandler(isKeyDowned)
        }, 300)
      } else {
        clearInterval(intervalRef.current as NodeJS.Timeout)
      }
      return () =>
        clearInterval(intervalRef.current as NodeJS.Timeout)
    }, [isKeyDowned, scrollToTest])

    const keyDown = (e: KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        setIsKeyDowned(e.key)
      }
    }
    const keyUp = (e: KeyboardEvent) => {
      e.stopPropagation()
      setIsKeyDowned(null)
    }

    React.useEffect(() => {
      const scrollable = scrollableRef?.current
      if (enableLegendSlider) {
        checkScroll()
        scrollable?.addEventListener('keydown', keyDown)
        scrollable?.addEventListener('keyup', keyUp)
      }

      return () => {
        scrollable?.removeEventListener('keydown', keyDown)
        scrollable?.removeEventListener('keyup', keyUp)
      }
    }, [checkScroll, enableLegendSlider])

    return (
      <ol
        ref={ref}
        className={cn('relative overflow-hidden', className)}
        {...other}
      >
        <div
          ref={scrollableRef}
          tabIndex={0}
          className={cn(
            'flex h-full',
            enableLegendSlider
              ? hasScroll?.right || hasScroll?.left
                ? 'snap-mandatory items-center overflow-auto pl-4 pr-12 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
                : ''
              : 'flex-wrap'
          )}
        >
          {categories.map((category, index) => (
            <LegendItem
              key={`item-${index}`}
              name={category}
              color={colors[index] as AvailableChartColorsKeys}
              onClick={onClickLegendItem}
              activeLegend={activeLegend}
            />
          ))}
        </div>
        {enableLegendSlider &&
        (hasScroll?.right || hasScroll?.left) ? (
          <>
            <div
              className={cn(
                // base
                'absolute bottom-0 right-0 top-0 flex h-full items-center justify-center pr-1',
                // background color
                'bg-background'
              )}
            >
              <ScrollButton
                icon={RiArrowLeftSLine}
                onClick={() => {
                  setIsKeyDowned(null)
                  scrollToTest('left')
                }}
                disabled={!hasScroll?.left}
              />
              <ScrollButton
                icon={RiArrowRightSLine}
                onClick={() => {
                  setIsKeyDowned(null)
                  scrollToTest('right')
                }}
                disabled={!hasScroll?.right}
              />
            </div>
          </>
        ) : null}
      </ol>
    )
  }
)

Legend.displayName = 'Legend'

const ChartLegend = (
  { payload }: any,
  categoryColors: Map<string, AvailableChartColorsKeys>,
  setLegendHeight: React.Dispatch<React.SetStateAction<number>>,
  activeLegend: string | undefined,
  onClick?: (category: string, color: string) => void,
  enableLegendSlider?: boolean,
  legendPosition?: 'left' | 'center' | 'right',
  yAxisWidth?: number
) => {
  const legendRef = React.useRef<HTMLDivElement>(null)

  useOnWindowResize(() => {
    const calculateHeight = (height: number | undefined) =>
      height ? Number(height) + 15 : 60
    setLegendHeight(calculateHeight(legendRef.current?.clientHeight))
  })

  const legendPayload = payload.filter(
    (item: any) => item.type !== 'none'
  )

  const paddingLeft =
    legendPosition === 'left' && yAxisWidth ? yAxisWidth - 8 : 0

  return (
    <div
      ref={legendRef}
      style={{ paddingLeft: paddingLeft }}
      className={cn(
        'flex items-center',
        { 'justify-center': legendPosition === 'center' },
        { 'justify-start': legendPosition === 'left' },
        { 'justify-end': legendPosition === 'right' }
      )}
    >
      <Legend
        categories={legendPayload.map((entry: any) => entry.value)}
        colors={legendPayload.map((entry: any) =>
          categoryColors.get(entry.value)
        )}
        onClickLegendItem={onClick}
        activeLegend={activeLegend}
        enableLegendSlider={enableLegendSlider}
      />
    </div>
  )
}

//#region Tooltip

type TooltipProps = Pick<
  ChartTooltipProps,
  'active' | 'payload' | 'label'
>

type PayloadItem = {
  category: string
  value: number
  index: string
  color: AvailableChartColorsKeys
  type?: string
  payload: any
}

interface ChartTooltipProps {
  active: boolean | undefined
  payload: PayloadItem[]
  label: string
  valueFormatter: (value: number) => string
}

/**
 * Default chart tooltip for LineChart.
 * Shows a vertical layout: value on top, date below.
 * Matches the Figma design system tooltip styling.
 */
const ChartTooltip = ({
  active,
  payload,
  label,
  valueFormatter,
}: ChartTooltipProps) => {
  if (active && payload && payload.length) {
    const legendPayload = payload.filter(
      (item: any) => item.type !== 'none'
    )
    // For single category charts, show simplified tooltip
    if (legendPayload.length === 1) {
      const { value } = legendPayload[0]
      return (
        <div
          className={cn(
            'bg-popover flex flex-col gap-2 p-2 rounded border border-border',
            'shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]'
          )}
        >
          <p className="text-base font-medium text-foreground tracking-tight leading-none">
            {valueFormatter(value)}
          </p>
          <p className="text-sm text-muted-foreground tracking-tight leading-5">
            {label}
          </p>
        </div>
      )
    }
    // For multi-category charts, show category breakdown
    return (
      <div
        className={cn(
          'bg-popover rounded border border-border',
          'shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]'
        )}
      >
        <div className={cn('border-b border-inherit px-3 py-2')}>
          <p className="text-sm font-medium text-foreground">
            {label}
          </p>
        </div>
        <div className={cn('space-y-1 px-3 py-2')}>
          {legendPayload.map(({ value, category, color }, index) => (
            <div
              key={`id-${index}`}
              className="flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    'h-[3px] w-3.5 shrink-0 rounded-full',
                    getColorClassName(color, 'bg')
                  )}
                />
                <p className="text-sm whitespace-nowrap text-muted-foreground">
                  {category}
                </p>
              </div>
              <p className="text-sm whitespace-nowrap font-medium tabular-nums text-foreground">
                {valueFormatter(value)}
              </p>
            </div>
          ))}
        </div>
      </div>
    )
  }
  return null
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
  data: Record<string, any>[]
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
}

/**
 * Warning! This file is fully copied from Tremor's AreaChart component.
 * It's not a good idea to edit it. It will probably break.
 */

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

    // When startEndOnly is true, we want grid lines at actual data positions
    // but only show labels for start/end. Calculate a sensible interval
    // to avoid too many grid lines (target ~8 lines for readability).
    const xAxisInterval = React.useMemo(() => {
      if (!startEndOnly) return intervalType
      if (data.length <= 8) return 0 // Show all if few data points
      return Math.max(1, Math.floor(data.length / 8))
    }, [startEndOnly, data.length, intervalType])

    const hasOnValueChange = !!onValueChange
    const prevActiveRef = React.useRef<boolean | undefined>(undefined)
    const prevLabelRef = React.useRef<string | undefined>(undefined)

    function onDotClick(itemData: any, event: React.MouseEvent) {
      event.stopPropagation()

      if (!hasOnValueChange) return
      if (
        (itemData.index === activeDot?.index &&
          itemData.dataKey === activeDot?.dataKey) ||
        (hasOnlyOneValueForKey(data, itemData.dataKey) &&
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
          categoryClicked: itemData.dataKey,
          ...itemData.payload,
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
                  ? (props: any) => {
                      const {
                        x,
                        y,
                        payload,
                        index: tickIndex,
                      } = props
                      const isFirst = tickIndex === 0
                      const isLast =
                        tickIndex >=
                        data.length - 1 - (xAxisInterval as number)

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
                  ? payload.map((item: any) => ({
                      category: item.dataKey,
                      value: item.value,
                      index: item.payload[index],
                      color: categoryColors.get(
                        item.dataKey
                      ) as AvailableChartColorsKeys,
                      type: item.type,
                      payload: item.payload,
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
                    { payload },
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
                activeDot={(props: any) => {
                  const {
                    cx: cxCoord,
                    cy: cyCoord,
                    strokeLinecap,
                    strokeLinejoin,
                  } = props
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
                      onClick={(_, event) => onDotClick(props, event)}
                    />
                  )
                }}
                dot={(props: any) => {
                  const {
                    stroke,
                    strokeLinecap,
                    strokeLinejoin,
                    strokeWidth,
                    cx: cxCoord,
                    cy: cyCoord,
                    dataKey,
                    index,
                  } = props

                  if (
                    (hasOnlyOneValueForKey(data, category) &&
                      !(
                        activeDot ||
                        (activeLegend && activeLegend !== category)
                      )) ||
                    (activeDot?.index === index &&
                      activeDot?.dataKey === category)
                  ) {
                    return (
                      <Dot
                        key={index}
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
                  return <React.Fragment key={index}></React.Fragment>
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
                    onClick={(props: any, event) => {
                      event.stopPropagation()
                      const { name } = props
                      onCategoryClick(name)
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

export { LineChart, type LineChartEventProps, type TooltipProps }
