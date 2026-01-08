/**
 * ⚠️ WARNING - WORK IN PROGRESS (March 22, 2025)
 * This component is currently under development and has known issues:
 * 1. Sizing behavior is inconsistent and may not properly fill container
 * 2. Y-axis rendering has visual glitches
 * 3. Responsiveness needs improvement
 *
 * DO NOT USE IN PRODUCTION until these issues are resolved.
 * For production charts, use LineChart.tsx instead which is stable.
 */

'use client'

import { RiArrowLeftSLine, RiArrowRightSLine } from '@remixicon/react'
import React from 'react'
import { mergeRefs } from 'react-merge-refs'
import {
  Area,
  Dot,
  Label,
  Line,
  AreaChart as RechartsAreaChart,
  Legend as RechartsLegend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AxisDomain } from 'recharts/types/util/types'
import { useOnWindowResize } from '@/app/hooks/useOnWindowResize'
import { cn } from '@/lib/utils'
import {
  AvailableChartColors,
  type AvailableChartColorsKeys,
  constructCategoryColors,
  getColorClassName,
  getYAxisDomain,
  hasOnlyOneValueForKey,
} from '@/utils/chartStyles'

//#region Types for Recharts callbacks

/**
 * Props provided by Recharts to legend content render functions.
 */
interface RechartsLegendPayloadItem {
  value: string
  type: string
  id?: string
  color?: string
  dataKey?: string
}

interface RechartsLegendContentProps {
  payload: RechartsLegendPayloadItem[]
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
          'text-gray-700 dark:text-gray-300',
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
          ? 'cursor-not-allowed text-gray-400 dark:text-gray-600'
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
                'bg-white dark:bg-gray-950'
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
  { payload }: RechartsLegendContentProps,
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
    (item: RechartsLegendPayloadItem) => item.type !== 'none'
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
        categories={legendPayload.map(
          (entry: RechartsLegendPayloadItem) => entry.value
        )}
        colors={legendPayload
          .map((entry: RechartsLegendPayloadItem) =>
            categoryColors.get(entry.value)
          )
          .filter(
            (color): color is AvailableChartColorsKeys =>
              color !== undefined
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

export type PayloadItem = {
  category: string
  value: number
  index: string
  color: AvailableChartColorsKeys
  type?: string
  payload: Record<string, unknown>
}

interface ChartTooltipProps {
  active: boolean | undefined
  payload: PayloadItem[]
  label: string
  valueFormatter: (value: number) => string
}

/**
 * Default chart tooltip for AreaChart.
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
    // For single category charts, show simplified tooltip
    if (payload.length === 1) {
      const { value } = payload[0]
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
          {payload.map(({ value, category, color }, index) => (
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

//#region AreaChart

interface ActiveDot {
  index?: number
  dataKey?: string
}

type BaseEventProps = {
  eventType: 'dot' | 'category'
  categoryClicked: string
  [key: string]: number | string
}

type AreaChartEventProps = BaseEventProps | null | undefined

export type TooltipCallbackProps = TooltipProps
export type TooltipCallback = (
  tooltipCallbackContent: TooltipCallbackProps
) => void

interface AreaChartProps
  extends React.HTMLAttributes<HTMLDivElement> {
  data: Record<string, any>[]
  index: string
  categories: string[]
  colors?: AvailableChartColorsKeys[]
  valueFormatter?: (value: number) => string
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
  onValueChange?: (value: AreaChartEventProps) => void
  enableLegendSlider?: boolean
  tickGap?: number
  connectNulls?: boolean
  xAxisLabel?: string
  yAxisLabel?: string
  type?: 'default' | 'stacked' | 'percent'
  legendPosition?: 'left' | 'center' | 'right'
  fill?: 'gradient' | 'solid' | 'none'
  tooltipCallback?: TooltipCallback
  customTooltip?: React.ComponentType<TooltipProps>
}
/**
 * Warning! This file is fully copied from Tremor's AreaChart component.
 * It's not a good idea to edit it. It will probably break.
 */
const AreaChart = React.forwardRef<HTMLDivElement, AreaChartProps>(
  (props, ref) => {
    const {
      data = [],
      categories = [],
      index,
      colors = AvailableChartColors,
      valueFormatter = (value: number) => value.toString(),
      startEndOnly = false,
      showXAxis = true,
      showYAxis = true,
      showGridLines = true,
      yAxisWidth = 56,
      intervalType = 'equidistantPreserveStart',
      showTooltip = true,
      showLegend = true,
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
      type = 'default',
      legendPosition = 'right',
      fill = 'gradient',
      tooltipCallback,
      customTooltip,
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

    const dataWithUniqueIds = React.useMemo(
      () =>
        data.map((item, index) => ({ ...item, __uniqueId: index })),
      [data]
    )

    const yAxisDomain = getYAxisDomain(
      autoMinValue,
      minValue,
      maxValue,
      0.1 // 10% padding above max value for visual breathing room
    )
    const hasOnValueChange = !!onValueChange
    const stacked = type === 'stacked' || type === 'percent'
    const areaId = React.useId()

    const prevActiveRef = React.useRef<boolean | undefined>(undefined)
    const prevLabelRef = React.useRef<string | undefined>(undefined)

    const getFillContent = ({
      fillType,
      activeDot,
      activeLegend,
      category,
    }: {
      fillType: AreaChartProps['fill']
      activeDot: ActiveDot | undefined
      activeLegend: string | undefined
      category: string
    }) => {
      const stopOpacity =
        activeDot || (activeLegend && activeLegend !== category)
          ? 0.1
          : 0.3

      switch (fillType) {
        case 'none':
          return <stop stopColor="currentColor" stopOpacity={0} />
        case 'gradient':
          return (
            <>
              <stop
                offset="5%"
                stopColor="currentColor"
                stopOpacity={stopOpacity}
              />
              <stop
                offset="95%"
                stopColor="currentColor"
                stopOpacity={0}
              />
            </>
          )
        case 'solid':
        default:
          return (
            <stop
              stopColor="currentColor"
              stopOpacity={stopOpacity}
            />
          )
      }
    }

    function valueToPercent(value: number) {
      return `${(value * 100).toFixed(0)}%`
    }

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
         * 4. These dimensions (width & height) are passed to RechartsAreaChart, which uses them for internal calculations
         * 5. When the container resizes:
         *    - ResizeObserver detects the change and updates width/height state
         *    - These new dimensions flow to RechartsAreaChart
         *    - ResponsiveContainer ensures smooth transitions and maintains aspect ratio
         */}
        <ResponsiveContainer width={'100%'} height={'100%'}>
          <RechartsAreaChart
            width={width || 800}
            height={height || 300}
            data={dataWithUniqueIds}
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
              left: yAxisLabel ? 20 : undefined,
              right: yAxisLabel ? 5 : undefined,
              top: 5,
            }}
            stackOffset={type === 'percent' ? 'expand' : undefined}
          >
            <XAxis
              padding={{ left: paddingValue, right: paddingValue }}
              hide={!showXAxis}
              dataKey={index}
              interval={
                startEndOnly ? 'preserveStartEnd' : intervalType
              }
              tick={{ transform: 'translate(0, 6)', dy: 8 }}
              ticks={
                startEndOnly
                  ? [data[0][index], data[data.length - 1][index]]
                  : undefined
              }
              fill=""
              stroke=""
              className={cn(
                // base
                'text-xs',
                // text fill
                'fill-gray-500 dark:fill-gray-500'
              )}
              tickLine={false}
              axisLine={false}
              minTickGap={tickGap}
            >
              {xAxisLabel && (
                <Label
                  position="insideBottom"
                  offset={0}
                  className="fill-gray-800 text-sm font-medium dark:fill-gray-200"
                >
                  {xAxisLabel}
                </Label>
              )}
            </XAxis>
            {/* Y-Axis Configuration:
             * - Shows only a single tick when minValue equals maxValue to avoid redundant labels
             * - This improves readability when all data points have the same value
             * - Otherwise uses default ticks for dynamic scaling
             */}
            <YAxis
              width={yAxisWidth}
              hide={!showYAxis}
              axisLine={false}
              tickLine={false}
              type="number"
              domain={yAxisDomain as AxisDomain}
              tick={{ transform: 'translate(-3, 0)' }}
              fill=""
              stroke=""
              className={cn(
                // base
                'text-xs',
                // text fill
                'fill-gray-500 dark:fill-gray-500'
              )}
              ticks={
                minValue !== undefined &&
                maxValue !== undefined &&
                minValue === maxValue
                  ? [minValue]
                  : undefined
              }
              tickFormatter={
                type === 'percent' ? valueToPercent : valueFormatter
              }
              allowDecimals={allowDecimals}
            >
              {yAxisLabel && (
                <Label
                  position="insideLeft"
                  style={{ textAnchor: 'middle' }}
                  angle={-90}
                  offset={-15}
                  className="fill-gray-800 text-sm font-medium dark:fill-gray-200"
                >
                  {yAxisLabel}
                </Label>
              )}
            </YAxis>
            <Tooltip
              wrapperStyle={{ outline: 'none' }}
              isAnimationActive={true}
              animationDuration={100}
              cursor={{ stroke: '#d1d5db', strokeWidth: 1 }}
              offset={20}
              position={{ y: 0 }}
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
            {categories.map((category) => {
              const categoryId = `${areaId}-${category.replace(
                /[^a-zA-Z0-9]/g,
                ''
              )}`
              return (
                <React.Fragment key={category}>
                  <defs key={category}>
                    <linearGradient
                      key={category}
                      className={cn(
                        getColorClassName(
                          categoryColors.get(
                            category
                          ) as AvailableChartColorsKeys,
                          'text'
                        )
                      )}
                      id={categoryId}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      {getFillContent({
                        fillType: fill,
                        activeDot: activeDot,
                        activeLegend: activeLegend,
                        category: category,
                      })}
                    </linearGradient>
                  </defs>
                  <Area
                    className={cn(
                      getColorClassName(
                        categoryColors.get(
                          category
                        ) as AvailableChartColorsKeys,
                        'stroke'
                      )
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
                        stroke,
                        strokeLinecap,
                        strokeLinejoin,
                        strokeWidth,
                      } = dotProps
                      return (
                        <Dot
                          className={cn(
                            'stroke-foreground fill-foreground',
                            onValueChange ? 'cursor-pointer' : ''
                          )}
                          cx={cxCoord}
                          cy={cyCoord}
                          r={5}
                          fill=""
                          stroke={stroke}
                          strokeLinecap={strokeLinecap}
                          strokeLinejoin={strokeLinejoin}
                          strokeWidth={strokeWidth}
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
                            (activeLegend &&
                              activeLegend !== category)
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
                        <React.Fragment
                          key={dotIndex}
                        ></React.Fragment>
                      )
                    }}
                    key={category}
                    name={category}
                    type="linear"
                    dataKey={category}
                    stroke=""
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    isAnimationActive={false}
                    connectNulls={connectNulls}
                    stackId={stacked ? 'stack' : undefined}
                    fill={`url(#${categoryId})`}
                  />
                </React.Fragment>
              )
            })}
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
          </RechartsAreaChart>
        </ResponsiveContainer>
      </div>
    )
  }
)

AreaChart.displayName = 'AreaChart'

export { AreaChart, type AreaChartEventProps, type TooltipProps }
