import type { LucideIcon } from 'lucide-react'
import type { ComponentType } from 'react'

export type StatusVariant =
  | 'success'
  | 'warning'
  | 'destructive'
  | 'info'
  | 'muted'
  | 'amethyst'

/**
 * Icon component type that accepts LucideIcon or any component with className support.
 * This flexibility allows for easier testing while maintaining Lucide compatibility.
 */
export type StatusIcon =
  | LucideIcon
  | ComponentType<{ className?: string }>

export interface StatusConfigItem {
  label: string
  variant: StatusVariant
  icon?: StatusIcon
  tooltip?: string
}

export type StatusConfig<T extends string> = Record<
  T,
  StatusConfigItem
>
