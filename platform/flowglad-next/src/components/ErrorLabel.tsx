import type { FieldError, GlobalError } from 'react-hook-form'
import { cn } from '@/lib/utils'
import core from '@/utils/core'

const ErrorLabel = ({
  error,
  className,
}: {
  error?: string | FieldError | GlobalError
  className?: string
}) => {
  if (!error) {
    return null
  }
  const errorMessage =
    typeof error === 'string' ? error : error.message
  return (
    <p
      className={cn(
        'mt-1 text-sm text-destructive text-red-600',
        className
      )}
    >
      {errorMessage}
    </p>
  )
}

export default ErrorLabel
