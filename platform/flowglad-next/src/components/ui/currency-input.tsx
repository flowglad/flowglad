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
        'flex h-10 w-full rounded border border-input bg-input-bg px-3 py-2 text-base shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:border-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        error ? 'border-destructive' : '',
        className
      )}
      min={0}
      allowNegativeValue={false}
      onValueChange={onValueChange}
      allowDecimals={allowDecimals}
      {...props}
    />
  )
}
