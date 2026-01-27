import { zodResolver } from '@hookform/resolvers/zod'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  type FieldValues,
  FormProvider,
  type UseFormReturn,
  useForm,
} from 'react-hook-form'
import { type z } from 'zod'

type NavigationDirection = 'forward' | 'backward' | 'initial'

interface StepConfig<T extends z.ZodType> {
  id: string
  title: string
  description?: string
  schema: T
  component: React.ComponentType
  /** Optional skip condition based on current form data */
  shouldSkip?: (data: unknown) => boolean
}

interface MultiStepFormContextValue<TFormData extends FieldValues> {
  currentStepIndex: number
  totalSteps: number
  form: UseFormReturn<TFormData>
  goToNext: () => Promise<boolean>
  goToPrevious: () => void
  goToStep: (index: number) => void
  isFirstStep: boolean
  isLastStep: boolean
  canProceed: boolean
  progress: number
  direction: NavigationDirection
  currentStep: StepConfig<z.ZodType> | undefined
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MultiStepFormContext =
  createContext<MultiStepFormContextValue<any> | null>(null)

export function useMultiStepForm<T extends FieldValues>() {
  const context = useContext(MultiStepFormContext)
  if (!context) {
    throw new Error(
      'useMultiStepForm must be used within MultiStepFormProvider'
    )
  }
  return context as MultiStepFormContextValue<T>
}

interface MultiStepFormProps<T extends FieldValues> {
  schema: z.ZodType<T>
  defaultValues: Partial<T>
  steps: StepConfig<z.ZodType>[]
  onComplete: (data: T) => Promise<void>
  persistKey?: string
  initialStep?: number
  onStepChange?: (stepIndex: number) => void
  analyticsPrefix?: string
  children: React.ReactNode
}

export function MultiStepForm<T extends FieldValues>({
  schema,
  defaultValues,
  steps,
  onComplete,
  persistKey,
  initialStep = 0,
  onStepChange,
  analyticsPrefix,
  children,
}: MultiStepFormProps<T>) {
  const [currentStepIndex, setCurrentStepIndex] =
    useState(initialStep)
  const [direction, setDirection] =
    useState<NavigationDirection>('initial')
  const [currentStepValid, setCurrentStepValid] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  const form = useForm<T>({
    // Type assertion needed because Zod 4's ZodSchema<T> has unknown input type,
    // but zodResolver expects FieldValues. This is safe because T extends FieldValues.
    resolver: zodResolver(schema as z.ZodType<T, T>),
    defaultValues: defaultValues as T,
    mode: 'onChange',
  })

  // Watch form values to reactively update activeSteps
  const formValues = form.watch()

  // Filter steps based on skip conditions (memoized with proper dependencies)
  const activeSteps = useMemo(() => {
    return steps.filter((step) => !step.shouldSkip?.(formValues))
  }, [steps, formValues])

  const currentStep = activeSteps[currentStepIndex]
  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === activeSteps.length - 1
  const progress =
    activeSteps.length > 0
      ? ((currentStepIndex + 1) / activeSteps.length) * 100
      : 0

  // Validate current step on value changes
  useEffect(() => {
    if (!currentStep) {
      setCurrentStepValid(false)
      return
    }

    const validate = async () => {
      const result = await currentStep.schema.safeParseAsync(
        form.getValues()
      )
      setCurrentStepValid(result.success)
    }
    validate()
  }, [formValues, currentStep, form])

  // Sync state when URL changes (browser back/forward)
  // Note: currentStepIndex intentionally omitted to prevent loops
  useEffect(() => {
    if (
      initialStep !== currentStepIndex &&
      initialStep >= 0 &&
      initialStep < activeSteps.length
    ) {
      setDirection(
        initialStep > currentStepIndex ? 'forward' : 'backward'
      )
      setCurrentStepIndex(initialStep)
    }
  }, [initialStep, activeSteps.length])

  // Step change callback and analytics
  const setStep = useCallback(
    (index: number) => {
      setCurrentStepIndex(index)
      onStepChange?.(index)
    },
    [onStepChange]
  )

  // Analytics: track step views (uncomment when analytics is configured)
  useEffect(() => {
    if (!analyticsPrefix || !currentStep) return

    // analytics.track(`${analyticsPrefix}_step_viewed`, {
    //   stepId: currentStep.id,
    //   stepIndex: currentStepIndex,
    //   totalSteps: activeSteps.length,
    // })
  }, [
    currentStepIndex,
    analyticsPrefix,
    currentStep,
    activeSteps.length,
  ])

  const validateCurrentStep = useCallback(async () => {
    if (!currentStep) return false
    const result = await currentStep.schema.safeParseAsync(
      form.getValues()
    )
    return result.success
  }, [currentStep, form])

  const goToNext = useCallback(async () => {
    const isValid = await validateCurrentStep()
    if (!isValid) {
      await form.trigger()
      return false
    }

    if (isLastStep) {
      try {
        await form.handleSubmit(onComplete)()
      } catch {
        // Error handling is done in onComplete via form.setError('root', ...)
        return false
      }
    } else {
      setDirection('forward')
      setStep(Math.min(currentStepIndex + 1, activeSteps.length - 1))
    }
    return true
  }, [
    validateCurrentStep,
    isLastStep,
    form,
    onComplete,
    activeSteps.length,
    setStep,
    currentStepIndex,
  ])

  const goToPrevious = useCallback(() => {
    setDirection('backward')
    setStep(Math.max(currentStepIndex - 1, 0))
  }, [setStep, currentStepIndex])

  const goToStep = useCallback(
    (index: number) => {
      if (index >= 0 && index < activeSteps.length) {
        setDirection(
          index > currentStepIndex ? 'forward' : 'backward'
        )
        setStep(index)
      }
    },
    [activeSteps.length, currentStepIndex, setStep]
  )

  // Restore form data from localStorage FIRST (before save subscription)
  useEffect(() => {
    if (!persistKey) {
      setIsHydrated(true)
      return
    }

    const saved = localStorage.getItem(persistKey)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        form.reset(parsed, { keepDefaultValues: true })
      } catch {
        // Ignore invalid saved data
      }
    }
    setIsHydrated(true)
  }, []) // Run once on mount - persistKey and form are stable

  // Persist form data to localStorage AFTER hydration
  useEffect(() => {
    if (!persistKey || !isHydrated) return

    const subscription = form.watch((data) => {
      localStorage.setItem(persistKey, JSON.stringify(data))
    })

    return () => subscription.unsubscribe()
  }, [form, persistKey, isHydrated])

  // Handle edge case: no active steps
  if (activeSteps.length === 0) {
    return (
      <div className="text-center p-8">
        <p className="text-muted-foreground">
          Unable to load onboarding steps. Please refresh and try
          again.
        </p>
      </div>
    )
  }

  const contextValue: MultiStepFormContextValue<T> = {
    currentStepIndex,
    totalSteps: activeSteps.length,
    form,
    goToNext,
    goToPrevious,
    goToStep,
    isFirstStep,
    isLastStep,
    canProceed: currentStepValid,
    progress,
    direction,
    currentStep,
  }

  return (
    <MultiStepFormContext.Provider value={contextValue}>
      <FormProvider {...form}>{children}</FormProvider>
    </MultiStepFormContext.Provider>
  )
}
