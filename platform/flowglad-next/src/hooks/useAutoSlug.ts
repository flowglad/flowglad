import { snakeCase } from 'change-case'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useFormContext } from 'react-hook-form'

interface UseAutoSlugOptions {
  name: string
  sourceName: string
  disabledAuto?: boolean
  debounceMs?: number
}

export function useAutoSlug({
  name,
  sourceName,
  disabledAuto = false,
  debounceMs = 0,
}: UseAutoSlugOptions) {
  const form = useFormContext()
  const isDirtyRef = useRef(false)
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastSourceValueRef = useRef<string>('')

  const sourceValue = form.watch(sourceName)
  const value = form.watch(name)

  const setValue = useCallback(
    (newValue: string) => {
      form.setValue(name, newValue, { shouldValidate: false })
    },
    [form, name]
  )

  const setDirty = useCallback((dirty: boolean) => {
    isDirtyRef.current = dirty
  }, [])

  useEffect(() => {
    // Skip if auto-generation is disabled or field has been manually edited
    if (disabledAuto || isDirtyRef.current) return

    // Skip if source value hasn't actually changed
    const currentSourceValue = sourceValue || ''
    if (lastSourceValueRef.current === currentSourceValue) return

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current)
    }

    const executeUpdate = () => {
      // Update ref only after we're actually executing the update
      lastSourceValueRef.current = currentSourceValue

      // Get the current slug value directly from form
      const currentSlug = form.getValues(name) || ''
      let newSlug = ''

      if (currentSourceValue.trim()) {
        newSlug = snakeCase(currentSourceValue.trim())
      }

      // Only update if the slug actually changed
      if (currentSlug !== newSlug) {
        form.setValue(name, newSlug, { shouldValidate: false })
      }
    }

    if (debounceMs > 0) {
      debounceTimeoutRef.current = setTimeout(
        executeUpdate,
        debounceMs
      )
    } else {
      executeUpdate()
    }

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
    }
    // Intentionally exclude form from dependencies to avoid re-running on form reference changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceValue, disabledAuto, debounceMs, name])

  const handleFocus = useCallback(() => {
    setDirty(true)
  }, [setDirty])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setDirty(true)
      setValue(e.target.value)
    },
    [setValue, setDirty]
  )

  const bindSlugInput = useMemo(
    () => ({
      value: value || '',
      onFocus: handleFocus,
      onChange: handleChange,
    }),
    [value, handleFocus, handleChange]
  )

  return {
    value,
    setValue,
    isDirty: isDirtyRef.current,
    setDirty,
    bindSlugInput,
  }
}
