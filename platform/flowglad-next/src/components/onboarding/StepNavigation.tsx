import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useMultiStepForm } from './MultiStepForm'

interface StepNavigationProps {
  nextLabel?: string
  backLabel?: string
  submitLabel?: string
  showBack?: boolean
  className?: string
}

export function StepNavigation({
  nextLabel = 'Continue',
  backLabel = 'Back',
  submitLabel = 'Complete',
  showBack = true,
  className,
}: StepNavigationProps) {
  const { goToNext, goToPrevious, isFirstStep, isLastStep, form } =
    useMultiStepForm()

  const { isSubmitting } = form.formState

  return (
    <div className={cn('flex items-center justify-between mt-8', className)}>
      {showBack && !isFirstStep ? (
        <Button
          type="button"
          variant="outline"
          onClick={goToPrevious}
          disabled={isSubmitting}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          {backLabel}
        </Button>
      ) : (
        <div />
      )}

      <Button
        type="button"
        onClick={goToNext}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            {isLastStep ? submitLabel : nextLabel}
            {!isLastStep && <ChevronRight className="w-4 h-4 ml-1" />}
          </>
        )}
      </Button>
    </div>
  )
}
