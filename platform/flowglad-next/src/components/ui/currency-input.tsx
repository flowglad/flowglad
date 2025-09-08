// @ts-ignore - react-currency-input-field doesn't have types
import InnerCurrencyInput from 'react-currency-input-field'

import { cn } from '@/lib/utils'

interface CurrencyInputProps
  extends React.ComponentProps<typeof InnerCurrencyInput> {
  className?: string
  error?: boolean | string
  value?: string
  onValueChange?: (value: string | undefined) => void
  allowDecimals?: boolean
}

export const CurrencyInput = ({
  className,
  error,
  value,
  onValueChange,
  allowDecimals,
  ...props
}: CurrencyInputProps) => {
  return (
    <InnerCurrencyInput
      value={value?.toString() ?? ''}
      className={cn(
        'flex h-9 w-full rounded-md border bg-input px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        error
          ? 'border-destructive focus-visible:ring-destructive'
          : 'border-transparent focus-visible:border-stroke-strong focus-visible:bg-transparent focus-visible:ring-0',
        className
      )}
      onValueChange={onValueChange}
      allowDecimals={allowDecimals}
      {...props}
    />
  )
}
