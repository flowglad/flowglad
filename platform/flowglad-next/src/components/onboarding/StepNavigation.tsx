import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'
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
    <div className={cn('flex items-center gap-3', className)}>
      {showBack && !isFirstStep && (
        <Button
          type="button"
          variant="ghost"
          onClick={goToPrevious}
          disabled={isSubmitting}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {backLabel}
        </Button>
      )}

      <Button
        type="button"
        onClick={goToNext}
        disabled={isSubmitting}
        className="flex-1 max-w-[200px]"
      >
        {isSubmitting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            {isLastStep ? submitLabel : nextLabel}
            {!isLastStep && <ArrowRight className="w-4 h-4 ml-2" />}
          </>
        )}
      </Button>
    </div>
  )
}
