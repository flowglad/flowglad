import * as React from 'react'
import {
  Button as ShadcnButton,
  ButtonProps as ShadcnButtonProps,
} from './button'
import { cn } from '@/utils/core'
import DisabledTooltip from '@/components/ion/DisabledTooltip'
import { Loader2 } from 'lucide-react'

// Ion Button Props (for backward compatibility)
interface IonButtonProps {
  /** Color of the button - maps to shadcn variants */
  color?: 'primary' | 'neutral' | 'danger'
  /** Ion variant - maps to shadcn variants */
  variant?:
    | 'filled'
    | 'outline'
    | 'gradient'
    | 'soft'
    | 'ghost'
    | 'link'
  /** Ion size - maps to shadcn size */
  size?: 'sm' | 'md' | 'lg'
  /** Icon to the left of the button text */
  iconLeading?: React.ReactNode
  /** Icon to the right of the button text */
  iconTrailing?: React.ReactNode
  /** Loading state with spinner */
  loading?: boolean
  /** Tooltip message to show when button is disabled and hovered */
  disabledTooltip?: string
  /** Render as div instead of button (for nested button scenarios) */
  asDiv?: boolean
}

// Combined Props for Migration
export interface MigrationButtonProps
  extends Omit<ShadcnButtonProps, 'variant' | 'size'> {
  /** Icon color mapping - Ion Button prop */
  color?: 'primary' | 'neutral' | 'danger'
  /** Ion variant - maps to shadcn variants */
  variant?:
    | ShadcnButtonProps['variant']
    | 'filled'
    | 'gradient'
    | 'soft'
  /** Ion/Shadcn size */
  size?: ShadcnButtonProps['size'] | 'md'
  /** Icon to the left of the button text */
  iconLeading?: React.ReactNode
  /** Icon to the right of the button text */
  iconTrailing?: React.ReactNode
  /** Loading state with spinner */
  loading?: boolean
  /** Tooltip message to show when button is disabled and hovered */
  disabledTooltip?: string
  /** Render as div instead of button (for nested button scenarios) */
  asDiv?: boolean
}

// Prop Mapping Functions
const mapIonToShadcnVariant = (
  ionColor?: MigrationButtonProps['color'],
  ionVariant?: MigrationButtonProps['variant']
): ShadcnButtonProps['variant'] => {
  // Direct variant mappings that exist in both systems
  if (ionVariant === 'outline') return 'outline'
  if (ionVariant === 'ghost') return 'ghost'
  if (ionVariant === 'link') return 'link'

  // If shadcn variant is provided directly, use it
  if (
    ionVariant === 'default' ||
    ionVariant === 'destructive' ||
    ionVariant === 'secondary'
  ) {
    return ionVariant
  }

  // Ion-specific variant mappings
  if (ionVariant === 'soft') return 'secondary' // soft -> secondary

  // Color-based mappings for 'filled', 'gradient' or default variants
  if (ionColor === 'danger') return 'destructive'
  if (ionColor === 'neutral') return 'secondary'

  // Default: primary/filled/gradient -> default
  return 'default'
}

const mapIonToShadcnSize = (
  ionSize?: MigrationButtonProps['size']
): ShadcnButtonProps['size'] => {
  if (ionSize === 'md') return 'default'
  // Direct mappings for sizes that exist in both
  if (ionSize === 'sm' || ionSize === 'lg' || ionSize === 'icon')
    return ionSize
  if (ionSize === 'default') return 'default'
  return 'default' // fallback
}

const MigrationButton = React.forwardRef<
  HTMLButtonElement,
  MigrationButtonProps
>(
  (
    {
      // Migration props
      color,
      variant,
      size,
      iconLeading,
      iconTrailing,
      loading,
      disabledTooltip,
      asDiv,

      // Standard props
      className,
      children,
      disabled,
      onClick,
      ...props
    },
    ref
  ) => {
    // Map ion/migration props to shadcn props
    const finalVariant = mapIonToShadcnVariant(color, variant)
    const finalSize = mapIonToShadcnSize(size)
    const isDisabled = disabled || loading

    // Handle loading state
    const showLoadingSpinner = loading && !iconLeading
    const effectiveIconLeading = showLoadingSpinner ? (
      <Loader2 className="h-4 w-4 animate-spin" />
    ) : (
      iconLeading
    )

    // Button content with icons
    const buttonContent = (
      <>
        {effectiveIconLeading}
        {children}
        {iconTrailing}
      </>
    )

    // Handle asDiv case (for nested button scenarios)
    if (asDiv) {
      return (
        <div
          className={cn(
            'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium',
            'border border-transparent', // consistent with button styling
            finalSize === 'sm' && 'h-8 px-3 text-xs',
            finalSize === 'default' && 'h-9 px-4 py-2',
            finalSize === 'lg' && 'h-10 px-8',
            finalSize === 'icon' && 'h-9 w-9',
            // Apply variant styles for div
            finalVariant === 'default' &&
              'bg-primary text-primary-foreground shadow',
            finalVariant === 'destructive' &&
              'bg-destructive text-destructive-foreground shadow-sm',
            finalVariant === 'outline' &&
              'border-input bg-background text-foreground shadow-sm',
            finalVariant === 'secondary' &&
              'bg-secondary text-secondary-foreground shadow-sm',
            finalVariant === 'ghost' && 'text-foreground',
            finalVariant === 'link' &&
              'text-primary underline-offset-4',
            isDisabled && 'opacity-50 pointer-events-none',
            className
          )}
          ref={ref as React.Ref<HTMLDivElement>}
        >
          {buttonContent}
          {isDisabled && disabledTooltip && (
            <DisabledTooltip message={disabledTooltip} />
          )}
        </div>
      )
    }

    // Standard button implementation
    const buttonElement = (
      <ShadcnButton
        ref={ref}
        variant={finalVariant}
        size={finalSize}
        className={cn(
          loading && 'pointer-events-none', // prevent interaction during loading
          className
        )}
        disabled={isDisabled}
        onClick={loading ? undefined : onClick} // disable onClick when loading
        {...props}
      >
        {buttonContent}
      </ShadcnButton>
    )

    // Wrap with tooltip if needed
    if (isDisabled && disabledTooltip) {
      return (
        <div className="group relative inline-block">
          {buttonElement}
          <DisabledTooltip message={disabledTooltip} />
        </div>
      )
    }

    return buttonElement
  }
)

MigrationButton.displayName = 'MigrationButton'

export { MigrationButton }
