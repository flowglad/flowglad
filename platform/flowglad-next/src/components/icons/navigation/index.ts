/**
 * Centralized exports for all navigation icons.
 * This file provides a single import point for icons used in the sidebar navigation.
 *
 * Lucide icons wrapped with `createNavIcon` and custom icons have consistent defaults:
 * - Size: 20px (NAV_ICON_SIZE)
 * - Stroke width: 2px (NAV_ICON_STROKE_WIDTH)
 *
 * **Note:** Remixicon exports (e.g., `RiDiscordFill`) are raw re-exports from
 * `@remixicon/react` and do NOT receive the `createNavIcon` defaults. When using
 * Remixicon icons, pass explicit `size` props as needed.
 *
 * @example
 * ```tsx
 * import { CustomersIcon, PaymentsIcon, RiDiscordFill } from '@/components/icons/navigation'
 *
 * // Lucide/custom icons render at 20px with 2px stroke by default
 * <CustomersIcon />
 *
 * // Override size if needed
 * <CustomersIcon size={24} />
 *
 * // Remixicon requires explicit size prop
 * <RiDiscordFill size={20} />
 * ```
 */

// Re-export constants for external use
// Factory function for creating navigation icons
export {
  createNavIcon,
  NAV_ICON_SIZE,
  NAV_ICON_STROKE_WIDTH,
} from './createNavIcon'

// Lucide icons wrapped with navigation defaults
import {
  BookOpen as LucideBookOpen,
  ChevronsUpDown as LucideChevronsUpDown,
  DollarSign as LucideDollarSign,
  ExternalLink as LucideExternalLink,
  Flag as LucideFlag,
  Gauge as LucideGauge,
  LogOut as LucideLogOut,
  PanelLeft as LucidePanelLeft,
  PanelRight as LucidePanelRight,
  Shapes as LucideShapes,
  ShoppingCart as LucideShoppingCart,
  Shuffle as LucideShuffle,
  Tag as LucideTag,
  TriangleRight as LucideTriangleRight,
  X as LucideX,
} from 'lucide-react'
import { createNavIcon } from './createNavIcon'

// Navigation-ready Lucide icons with standard 20px size and 2px stroke
export const BookOpen = createNavIcon(LucideBookOpen, 'BookOpen')
export const ChevronsUpDown = createNavIcon(
  LucideChevronsUpDown,
  'ChevronsUpDown'
)
export const DollarSign = createNavIcon(
  LucideDollarSign,
  'DollarSign'
)
export const ExternalLink = createNavIcon(
  LucideExternalLink,
  'ExternalLink'
)
export const Flag = createNavIcon(LucideFlag, 'Flag')
export const Gauge = createNavIcon(LucideGauge, 'Gauge')
export const LogOut = createNavIcon(LucideLogOut, 'LogOut')
export const PanelLeft = createNavIcon(LucidePanelLeft, 'PanelLeft')
export const PanelRight = createNavIcon(
  LucidePanelRight,
  'PanelRight'
)
export const Shapes = createNavIcon(LucideShapes, 'Shapes')
export const ShoppingCart = createNavIcon(
  LucideShoppingCart,
  'ShoppingCart'
)
export const Shuffle = createNavIcon(LucideShuffle, 'Shuffle')
export const Tag = createNavIcon(LucideTag, 'Tag')
export const TriangleRight = createNavIcon(
  LucideTriangleRight,
  'TriangleRight'
)
export const X = createNavIcon(LucideX, 'X')

// Remixicon (used as-is, external icon library)
export { RiDiscordFill } from '@remixicon/react'

// Custom icons (already configured with NAV_ICON_SIZE/STROKE_WIDTH defaults)
export { FinishSetupIcon } from '../FinishSetupIcon'
export { FlowgladLogomark } from '../FlowgladLogomark'
export { MoreIcon } from '../MoreIcon'
export { PaymentsIcon } from '../PaymentsIcon'
export { SettingsIcon } from '../SettingsIcon'

// Phosphor wrappers (already configured with NAV_ICON_SIZE default)
export { CustomersIcon, SubscriptionsIcon } from './PhosphorWrappers'
