import * as React from 'react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Display the maximum length of the textarea in the bottom right corner, has to include the `maxLength` property to work
   * @default false
   */
  showCount?: boolean
  /** Classname of the textarea (use this to restyle the textarea) */
  textareaClassName?: string
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      textareaClassName,
      showCount = false,
      onChange,
      maxLength,
      ...props
    },
    ref
  ) => {
    const [charCount, setCharCount] = useState(0)

    return (
      <div className={cn('relative', className)}>
        <textarea
          maxLength={maxLength}
          ref={ref}
          onChange={(e) => {
            if (onChange) {
              onChange(e)
            }
            setCharCount(e.target.value.length)
          }}
          className={cn(
            'flex min-h-[80px] w-full rounded border border-input bg-input-bg px-3 py-2 text-base shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:border-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
            textareaClassName
          )}
          {...props}
        />
        {showCount && maxLength && (
          <span className="absolute bottom-3 right-4 text-xs font-normal text-muted-foreground">
            {charCount} / {maxLength}
          </span>
        )}
      </div>
    )
  }
)
Textarea.displayName = 'Textarea'

export { Textarea }
