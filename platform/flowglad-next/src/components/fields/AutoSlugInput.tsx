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
}

export function AutoSlugInput({
  name,
  sourceName,
  disabledAuto = false,
  debounceMs = 0,
  onDirtyChange,
  className,
  placeholder = 'slug_name',
  ...props
}: AutoSlugInputProps) {
  const { bindSlugInput, isDirty, setDirty } = useAutoSlug({
    name,
    sourceName,
    disabledAuto,
    debounceMs,
  })
  
  React.useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])
  
  return (
    <Input
      {...props}
      {...bindSlugInput}
      placeholder={placeholder}
      className={cn(className)}
    />
  )
}

export default AutoSlugInput