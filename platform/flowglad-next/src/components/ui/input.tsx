import * as React from 'react'

import { cn } from '@/utils/core'

interface InputProps extends React.ComponentProps<'input'> {
  /** Icon to the left of the input text */
  iconLeading?: React.ReactNode
  /** Icon to the right of the input text */
  iconTrailing?: React.ReactNode
  /** Display the input with an error state */
  error?: boolean | string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    { className, type, iconLeading, iconTrailing, error, ...props },
    ref
  ) => {
    if (iconLeading || iconTrailing) {
      return (
        <div className="relative flex items-center">
          {iconLeading && (
            <div className="absolute left-3 flex items-center text-muted-foreground">
              {iconLeading}
            </div>
          )}
          <input
            type={type}
            className={cn(
              'flex h-9 w-full rounded-md border bg-input px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
              iconLeading && 'pl-10',
              iconTrailing && 'pr-10',
              error
                ? 'border-destructive focus-visible:ring-destructive'
                : 'border-transparent focus-visible:border-stroke-strong focus-visible:bg-transparent focus-visible:ring-0',
              className
            )}
            ref={ref}
            {...props}
          />
          {iconTrailing && (
            <div className="absolute right-3 flex items-center text-muted-foreground">
              {iconTrailing}
            </div>
          )}
        </div>
      )
    }

    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border bg-input px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          error
            ? 'border-destructive focus-visible:ring-destructive'
            : 'border-transparent focus-visible:border-stroke-strong focus-visible:bg-transparent focus-visible:ring-0',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export { Input }
