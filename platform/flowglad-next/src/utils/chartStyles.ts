import type { AxisDomain } from 'recharts/types/util/types'

export type ColorUtility = 'bg' | 'stroke' | 'fill' | 'text'

export const chartColors = {
  blue: {
    bg: 'bg-blue-500',
    stroke: 'stroke-blue-500',
    fill: 'fill-blue-500',
    text: 'text-blue-500',
  },
  emerald: {
    bg: 'bg-emerald-500',
    stroke: 'stroke-emerald-500',
    fill: 'fill-emerald-500',
    text: 'text-emerald-500',
  },
  violet: {
    bg: 'bg-violet-500',
    stroke: 'stroke-violet-500',
    fill: 'fill-violet-500',
    text: 'text-violet-500',
  },
  amber: {
    bg: 'bg-amber-500',
    stroke: 'stroke-amber-500',
    fill: 'fill-amber-500',
    text: 'text-amber-500',
  },
  gray: {
    bg: 'bg-gray-500',
    stroke: 'stroke-gray-500',
    fill: 'fill-gray-500',
    text: 'text-gray-500',
  },
  cyan: {
    bg: 'bg-cyan-500',
    stroke: 'stroke-cyan-500',
    fill: 'fill-cyan-500',
    text: 'text-cyan-500',
  },
  pink: {
    bg: 'bg-pink-500',
    stroke: 'stroke-pink-500',
    fill: 'fill-pink-500',
    text: 'text-pink-500',
  },
  lime: {
    bg: 'bg-lime-500',
    stroke: 'stroke-lime-500',
    fill: 'fill-lime-500',
    text: 'text-lime-500',
  },
  fuchsia: {
    bg: 'bg-fuchsia-500',
    stroke: 'stroke-fuchsia-500',
    fill: 'fill-fuchsia-500',
    text: 'text-fuchsia-500',
  },
  primary: {
    bg: 'bg-primary',
    stroke: 'stroke-primary',
    fill: 'fill-primary',
    text: 'text-primary',
  },
  stone: {
    bg: 'bg-stone-600',
    stroke: 'stroke-stone-600',
    fill: 'fill-stone-600',
    text: 'text-stone-600',
  },
  foreground: {
    bg: 'bg-foreground',
    stroke: 'stroke-foreground',
    fill: 'fill-foreground',
    text: 'text-foreground',
  },
} as const satisfies {
  [color: string]: {
    [key in ColorUtility]: string
  }
}

export type AvailableChartColorsKeys = keyof typeof chartColors

export const AvailableChartColors: AvailableChartColorsKeys[] =
  Object.keys(chartColors) as Array<AvailableChartColorsKeys>

export const constructCategoryColors = (
  categories: string[],
  colors: AvailableChartColorsKeys[]
): Map<string, AvailableChartColorsKeys> => {
  const categoryColors = new Map<string, AvailableChartColorsKeys>()
  categories.forEach((category, index) => {
    categoryColors.set(category, colors[index % colors.length])
  })
  return categoryColors
}

export const getColorClassName = (
  color: AvailableChartColorsKeys,
  type: ColorUtility
): string => {
  const fallbackColor = {
    bg: 'bg-gray-500',
    stroke: 'stroke-gray-500',
    fill: 'fill-gray-500',
    text: 'text-gray-500',
  }
  return chartColors[color]?.[type] ?? fallbackColor[type]
}

export const getYAxisDomain = (
  autoMinValue: boolean,
  minValue: number | undefined,
  maxValue: number | undefined,
  additionalPaddingMultiple: number = 0 // e.g., 0.1 = 10% padding above max value
): AxisDomain => {
  if (minValue !== undefined && maxValue !== undefined) {
    // Always start from 0 for revenue and add significant padding to top
    return [0, maxValue * (1 + additionalPaddingMultiple)]
  }
  // For dynamic domains, also add padding
  if (autoMinValue) {
    return [
      0,
      (dataMax: number) => dataMax * (1 + additionalPaddingMultiple),
    ]
  }
  return [
    'dataMin',
    (dataMax: number) => dataMax * (1 + additionalPaddingMultiple),
  ]
}
export function hasOnlyOneValueForKey(
  array: any[],
  keyToCheck: string
): boolean {
  const val: any[] = []

  for (const obj of array) {
    if (Object.hasOwn(obj, keyToCheck)) {
      val.push(obj[keyToCheck])
      if (val.length > 1) {
        return false
      }
    }
  }

  return true
}
