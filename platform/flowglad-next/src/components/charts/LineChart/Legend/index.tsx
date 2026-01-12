'use client'

import { RiArrowLeftSLine, RiArrowRightSLine } from '@remixicon/react'
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useOnWindowResize } from '@/app/hooks/useOnWindowResize'
import { cn } from '@/lib/utils'
import {
  AvailableChartColors,
  type AvailableChartColorsKeys,
  getColorClassName,
} from '@/utils/chartStyles'
import { ScrollButton } from './ScrollButton'

//#region Types

interface LegendItemProps {
  name: string
  color: AvailableChartColorsKeys
  onClick?: (name: string, color: AvailableChartColorsKeys) => void
  activeLegend?: string
}

interface LegendProps
  extends React.OlHTMLAttributes<HTMLOListElement> {
  categories: string[]
  colors?: AvailableChartColorsKeys[]
  onClickLegendItem?: (category: string, color: string) => void
  activeLegend?: string
  enableLegendSlider?: boolean
}

interface HasScrollProps {
  left: boolean
  right: boolean
}

/**
 * Props provided by Recharts to legend content render functions.
 */
export interface RechartsLegendPayloadItem {
  value: string
  type: string
  id?: string
  color?: string
  dataKey?: string
}

export interface RechartsLegendContentProps {
  payload: RechartsLegendPayloadItem[]
}

//#region LegendItem

function LegendItem({
  name,
  color,
  onClick,
  activeLegend,
}: LegendItemProps) {
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

//#region Legend

export const Legend = React.forwardRef<HTMLOListElement, LegendProps>(
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
    const scrollableRef = useRef<HTMLDivElement>(null)
    const scrollButtonsRef = useRef<HTMLDivElement>(null)
    const [hasScroll, setHasScroll] = useState<HasScrollProps | null>(
      null
    )
    const [isKeyDowned, setIsKeyDowned] = useState<string | null>(
      null
    )
    const intervalRef = useRef<NodeJS.Timeout | null>(null)

    const checkScroll = useCallback(() => {
      const scrollable = scrollableRef?.current
      if (!scrollable) return

      const hasLeftScroll = scrollable.scrollLeft > 0
      const hasRightScroll =
        scrollable.scrollWidth - scrollable.clientWidth >
        scrollable.scrollLeft

      setHasScroll({ left: hasLeftScroll, right: hasRightScroll })
    }, [setHasScroll])

    const scrollToTest = useCallback(
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

    useEffect(() => {
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

    useEffect(() => {
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

//#region ChartLegend (for Recharts)

/**
 * Chart legend component for use with Recharts Legend content prop.
 * Wraps the Legend component and handles Recharts payload transformation.
 */
export function ChartLegend(
  { payload }: RechartsLegendContentProps,
  categoryColors: Map<string, AvailableChartColorsKeys>,
  setLegendHeight: React.Dispatch<React.SetStateAction<number>>,
  activeLegend: string | undefined,
  onClick?: (category: string, color: string) => void,
  enableLegendSlider?: boolean,
  legendPosition?: 'left' | 'center' | 'right',
  yAxisWidth?: number
) {
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
