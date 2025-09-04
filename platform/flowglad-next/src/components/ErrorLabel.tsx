import { FieldError, GlobalError } from 'react-hook-form'
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
    <p className={core.cn('mt-1 text-sm text-danger', className)}>
      {errorMessage}
    </p>
  )
}

export default ErrorLabel
