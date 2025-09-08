import InnerCurrencyInput from 'react-currency-input-field'

import { cn } from '@/utils/core'

interface CurrencyInputProps
  extends React.ComponentProps<typeof InnerCurrencyInput> {
  className?: string
  error?: boolean | string
  value?: string
}

export const CurrencyInput = ({
  className,
  error,
  value,
  onValueChange,
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
      {...props}
    />
  )
}
