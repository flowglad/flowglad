import { zodResolver } from '@hookform/resolvers/zod'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  type DefaultValues,
  type FieldValues,
  FormProvider,
  type UseFormReturn,
  useForm,
} from 'react-hook-form'
import { type z } from 'zod'

type NavigationDirection = 'forward' | 'backward' | 'initial'

/** Validation debounce delay in milliseconds */
const VALIDATION_DEBOUNCE_MS = 150

/**
 * Deep merges saved form data with default values.
 * Prefers saved values only when they are truthy (not empty strings, null, or undefined).
 * This ensures default values are preserved when users clear form fields.
 */
function deepMergeWithDefaults<T>(defaults: T, saved: unknown): T {
  if (defaults === null || defaults === undefined) {
    return saved as T
  }

  if (typeof defaults !== 'object' || Array.isArray(defaults)) {
    // For primitives and arrays: use saved value if it's truthy, otherwise use default
    return saved !== undefined && saved !== null && saved !== ''
      ? (saved as T)
      : defaults
  }

  // For objects: recursively merge each key
  const result = { ...defaults } as Record<string, unknown>
  const savedObj = saved as Record<string, unknown> | undefined | null
  for (const key of Object.keys(defaults as object)) {
    const defaultValue = (defaults as Record<string, unknown>)[key]
    const savedValue = savedObj?.[key]

    if (
      savedValue === undefined ||
      savedValue === null ||
      savedValue === ''
    ) {
      // Keep the default value
      result[key] = defaultValue
    } else if (
      typeof defaultValue === 'object' &&
      defaultValue !== null &&
      !Array.isArray(defaultValue)
    ) {
      // Recursively merge nested objects
      result[key] = deepMergeWithDefaults(defaultValue, savedValue)
    } else {
      // Use the saved value
      result[key] = savedValue
    }
  }

  return result as T
}

interface StepConfig<T extends z.ZodType> {
  id: string
  title: string
  description?: string
  schema: T
  component: React.ComponentType
  /**
   * Optional skip condition based on current form data.
   *
   * @param data - Current form values (may be undefined during initial render)
   * @returns true to skip this step, false to include it
   *
   * @remarks
   * **Performance Note**: If your `shouldSkip` function depends on form data,
   * the step list will re-evaluate whenever form values change. For static
   * conditions (e.g., environment checks), this has no performance impact.
   *
   * @example
   * // Static condition - no performance impact
   * shouldSkip: () => process.env.NODE_ENV === 'production'
   *
   * @example
   * // Dynamic condition - re-evaluates on form changes
   * shouldSkip: (data) => data?.userType === 'enterprise'
   */
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

const MultiStepFormContext =
  createContext<MultiStepFormContextValue<FieldValues> | null>(null)

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
  defaultValues: DefaultValues<T>
  steps: StepConfig<z.ZodType>[]
  onComplete: (data: T) => Promise<void>
  persistKey?: string
  initialStep?: number
  onStepChange?: (stepIndex: number) => void
  analyticsPrefix?: string
  children: React.ReactNode
}

/**
 * Checks if any step's shouldSkip function expects form data as a parameter.
 * This is a heuristic to detect if steps need reactive form data.
 *
 * @remarks
 * We inspect the function's string representation to detect if it declares
 * any parameters. This is necessary because `Function.length` returns 0 for
 * functions with default parameters (`(data = {}) => ...`) or rest parameters
 * (`(...args) => ...`), which would incorrectly classify them as static.
 *
 * The heuristic: if the function is parameterless (e.g., `() => ...` or
 * `function() { ... }`), it cannot depend on form data. Any other function
 * signature suggests potential form data usage.
 *
 * Trade-off: This may trigger unnecessary form watching if a developer declares
 * a parameter but doesn't use it. However, this is preferable to missing
 * legitimate form data dependencies which would cause broken functionality.
 */
function stepsDependOnFormData(
  steps: StepConfig<z.ZodType>[]
): boolean {
  return steps.some((step) => {
    if (!step.shouldSkip) return false

    const fnStr = step.shouldSkip.toString()

    // Check if it's a parameterless function:
    // - Arrow: () => ...
    // - Regular: function() { ... } or function name() { ... }
    // Note: We use string inspection instead of Function.length because
    // length is 0 for default params `(data = {})` and rest params `(...args)`
    const isParameterless =
      /^\s*(?:\(\s*\)\s*=>|function\s*\w*\s*\(\s*\)\s*\{)/.test(fnStr)

    // If the function takes no parameters, it can't depend on form data
    return !isParameterless
  })
}

/**
 * A multi-step form component that manages step navigation, validation, and persistence.
 *
 * @remarks
 * **Performance Characteristics**:
 * - Form watching is conditional: only subscribes to form changes if any step's
 *   `shouldSkip` function references form data
 * - Validation is debounced to avoid excessive validation on rapid input
 * - localStorage persistence uses a subscription pattern that doesn't cause re-renders
 *
 * **Step Filtering**:
 * Steps can be dynamically shown/hidden using the `shouldSkip` function. If your
 * skip conditions are static (e.g., environment checks), there's no performance
 * overhead. If they depend on form data, the component will re-evaluate steps
 * when form values change.
 */
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

  // Track form values for steps that need dynamic skip conditions
  // This is only updated via subscription when steps actually depend on form data
  const [formValuesForSkip, setFormValuesForSkip] = useState<
    T | undefined
  >(undefined)

  // Ref for debouncing validation
  const validationTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null)

  const form = useForm<T>({
    // Type assertion needed because Zod 4's ZodSchema<T> has unknown input type,
    // but zodResolver expects FieldValues. This is safe because T extends FieldValues.
    resolver: zodResolver(schema as z.ZodType<T, T>),
    defaultValues,
    mode: 'onChange',
  })

  // Determine if any step needs reactive form data for shouldSkip
  const needsFormWatchForSkip = useMemo(
    () => stepsDependOnFormData(steps),
    [steps]
  )

  // Subscribe to form changes ONLY if steps depend on form data for skip conditions
  // This avoids re-renders when shouldSkip functions are static (e.g., env checks)
  useEffect(() => {
    if (!needsFormWatchForSkip) return

    const subscription = form.watch((data) => {
      setFormValuesForSkip(data as T)
    })

    // Initialize with current values
    setFormValuesForSkip(form.getValues())

    return () => subscription.unsubscribe()
  }, [form, needsFormWatchForSkip])

  // Filter steps based on skip conditions
  // When steps don't depend on form data, this only runs when steps array changes
  const activeSteps = useMemo(() => {
    const dataForSkip = needsFormWatchForSkip
      ? formValuesForSkip
      : undefined
    return steps.filter((step) => !step.shouldSkip?.(dataForSkip))
  }, [steps, formValuesForSkip, needsFormWatchForSkip])

  // Clamp currentStepIndex when activeSteps shrinks to prevent out-of-range access
  // This can happen when skip conditions dynamically remove steps based on form data
  useEffect(() => {
    if (
      currentStepIndex >= activeSteps.length &&
      activeSteps.length > 0
    ) {
      setCurrentStepIndex(activeSteps.length - 1)
    }
  }, [activeSteps.length, currentStepIndex])

  const currentStep = activeSteps[currentStepIndex]
  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === activeSteps.length - 1
  const progress =
    activeSteps.length > 0
      ? ((currentStepIndex + 1) / activeSteps.length) * 100
      : 0

  // Validate current step on value changes (debounced to reduce validation frequency)
  // Uses form.watch subscription pattern to avoid re-renders from direct watch()
  useEffect(() => {
    if (!currentStep) {
      setCurrentStepValid(false)
      return
    }

    const runValidation = async () => {
      const result = await currentStep.schema.safeParseAsync(
        form.getValues()
      )
      setCurrentStepValid(result.success)
    }

    // Run initial validation immediately
    runValidation()

    // Subscribe to form changes and debounce validation
    const subscription = form.watch(() => {
      // Clear any pending validation
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current)
      }

      // Debounce validation to avoid running on every keystroke
      validationTimeoutRef.current = setTimeout(() => {
        runValidation()
      }, VALIDATION_DEBOUNCE_MS)
    })

    return () => {
      subscription.unsubscribe()
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current)
      }
    }
  }, [currentStep, form])

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
        // Validate the full form schema before final submission.
        // validateCurrentStep() only validates the current step's schema,
        // but we need to ensure all fields across all steps are valid
        // against the complete form schema before submitting.
        const isFullFormValid = await form.trigger()
        if (!isFullFormValid) {
          return false
        }

        // Call onComplete directly instead of through handleSubmit.
        // handleSubmit internally catches errors and doesn't rethrow them,
        // which prevents our try-catch from catching API errors.
        const data = form.getValues()
        await onComplete(data)
      } catch (error) {
        // Set root error so the UI can display feedback
        form.setError('root', {
          type: 'manual',
          message:
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred. Please try again.',
        })
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
        // Deep merge saved values with defaults, preferring saved values only when truthy
        // This ensures default values are preserved when saved values are empty strings
        const merged = deepMergeWithDefaults(defaultValues, parsed)
        form.reset(merged, { keepDefaultValues: true })
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
    <MultiStepFormContext.Provider
      value={contextValue as MultiStepFormContextValue<FieldValues>}
    >
      <FormProvider {...form}>{children}</FormProvider>
    </MultiStepFormContext.Provider>
  )
}
