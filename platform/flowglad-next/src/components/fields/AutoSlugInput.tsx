import React from 'react'
import { Input } from '@/components/ui/input'
import { useAutoSlug } from '@/hooks/useAutoSlug'
import { cn } from '@/utils/core'

interface AutoSlugInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'name' | 'value' | 'onChange' | 'onFocus'> {
  name: string
  sourceName: string
  disabledAuto?: boolean
  debounceMs?: number
  onDirtyChange?: (isDirty: boolean) => void
  onBlur?: React.FocusEventHandler<HTMLInputElement>
}

const AutoSlugInput = React.forwardRef<HTMLInputElement, AutoSlugInputProps>(({
  name,
  sourceName,
  disabledAuto = false,
  debounceMs = 0,
  onDirtyChange,
  onBlur,
  className,
  placeholder = 'slug_name',
  ...props
}, ref) => {
  const { bindSlugInput, isDirty, setDirty } = useAutoSlug({
    name,
    sourceName,
    disabledAuto,
    debounceMs,
  })
  
  React.useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])
  
  const handleBlur = React.useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    onBlur?.(e)
  }, [onBlur])
  
  return (
    <Input
      ref={ref}
      {...props}
      {...bindSlugInput}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={cn(className)}
    />
  )
})

AutoSlugInput.displayName = 'AutoSlugInput'

export { AutoSlugInput }
export default AutoSlugInput