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
        'flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-base transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:border-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        error ? 'border-destructive' : '',
        className
      )}
      onValueChange={onValueChange}
      allowDecimals={allowDecimals}
      {...props}
    />
  )
}
