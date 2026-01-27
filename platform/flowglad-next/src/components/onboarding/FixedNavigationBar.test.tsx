/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { FieldValues, UseFormReturn } from 'react-hook-form'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock dependencies that make network calls or need controlled responses
const mockGoToNext = vi.fn().mockResolvedValue(true)
const mockGoToPrevious = vi.fn()
const mockGoToStep = vi.fn()

interface MockContextOptions {
  isFirstStep?: boolean
  isLastStep?: boolean
  isSubmitting?: boolean
  currentStepIndex?: number
}

function createMockForm(
  isSubmitting: boolean
): UseFormReturn<FieldValues> {
  return {
    formState: {
      isSubmitting,
      isDirty: false,
      isValid: true,
      isLoading: false,
      isSubmitted: false,
      isSubmitSuccessful: false,
      isValidating: false,
      submitCount: 0,
      defaultValues: {},
      dirtyFields: {},
      touchedFields: {},
      errors: {},
      disabled: false,
    },
    watch: vi.fn(),
    getValues: vi.fn(),
    getFieldState: vi.fn(),
    setError: vi.fn(),
    clearErrors: vi.fn(),
    setValue: vi.fn(),
    trigger: vi.fn(),
    reset: vi.fn(),
    resetField: vi.fn(),
    setFocus: vi.fn(),
    unregister: vi.fn(),
    control: {} as UseFormReturn<FieldValues>['control'],
    register: vi.fn(),
    handleSubmit: vi.fn(),
  }
}

function createMockContextValue(options: MockContextOptions = {}) {
  const {
    isFirstStep = false,
    isLastStep = false,
    isSubmitting = false,
    currentStepIndex = 1,
  } = options

  return {
    currentStepIndex,
    totalSteps: 3,
    form: createMockForm(isSubmitting),
    goToNext: mockGoToNext,
    goToPrevious: mockGoToPrevious,
    goToStep: mockGoToStep,
    isFirstStep,
    isLastStep,
    canProceed: true,
    progress: ((currentStepIndex + 1) / 3) * 100,
    direction: 'forward' as const,
    currentStep: {
      id: 'test-step',
      title: 'Test Step',
      schema: {} as never,
      component: () => null,
    },
  }
}

// Mock the MultiStepForm context
let mockContextValue = createMockContextValue()

vi.mock('./MultiStepForm', () => ({
  useMultiStepForm: () => mockContextValue,
}))

// Import after mocking
import { FixedNavigationBar } from './FixedNavigationBar'

// Wrapper component to provide necessary context
function TestWrapper({ children }: { children: ReactNode }) {
  return <>{children}</>
}

describe('FixedNavigationBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockContextValue = createMockContextValue()
  })

  describe('back button behavior', () => {
    it('renders back button with "Login" label and calls onBackOverride when on first step with override provided', () => {
      mockContextValue = createMockContextValue({ isFirstStep: true })
      const mockBackOverride = vi.fn()

      render(
        <TestWrapper>
          <FixedNavigationBar
            onBackOverride={mockBackOverride}
            firstStepBackLabel="Login"
          />
        </TestWrapper>
      )

      const backButton = screen.getByRole('button', {
        name: /Login/i,
      })
      expect(backButton).toBeInTheDocument()

      fireEvent.click(backButton)

      expect(mockBackOverride).toHaveBeenCalledTimes(1)
      expect(mockGoToPrevious).not.toHaveBeenCalled()
    })

    it('renders back button with "Back" label and calls goToPrevious when on non-first step', () => {
      mockContextValue = createMockContextValue({
        isFirstStep: false,
        currentStepIndex: 2,
      })

      render(
        <TestWrapper>
          <FixedNavigationBar />
        </TestWrapper>
      )

      const backButton = screen.getByRole('button', { name: /Back/i })
      expect(backButton).toBeInTheDocument()

      fireEvent.click(backButton)

      expect(mockGoToPrevious).toHaveBeenCalledTimes(1)
    })

    it('renders back button with "Back" label and calls goToPrevious when on first step without onBackOverride', () => {
      mockContextValue = createMockContextValue({ isFirstStep: true })

      render(
        <TestWrapper>
          <FixedNavigationBar />
        </TestWrapper>
      )

      const backButton = screen.getByRole('button', { name: /Back/i })
      expect(backButton).toBeInTheDocument()

      fireEvent.click(backButton)

      expect(mockGoToPrevious).toHaveBeenCalledTimes(1)
    })

    it('renders back button with custom backLabel when provided and not on first step', () => {
      mockContextValue = createMockContextValue({
        isFirstStep: false,
      })

      render(
        <TestWrapper>
          <FixedNavigationBar backLabel="Previous" />
        </TestWrapper>
      )

      expect(
        screen.getByRole('button', { name: /Previous/i })
      ).toBeInTheDocument()
    })
  })

  describe('continue/submit button behavior', () => {
    it('renders continue button with "Continue" label when not on last step', () => {
      mockContextValue = createMockContextValue({ isLastStep: false })

      render(
        <TestWrapper>
          <FixedNavigationBar />
        </TestWrapper>
      )

      const continueButton = screen.getByRole('button', {
        name: /Continue/i,
      })
      expect(continueButton).toBeInTheDocument()

      fireEvent.click(continueButton)

      expect(mockGoToNext).toHaveBeenCalledTimes(1)
    })

    it('renders continue button with "Complete" label when on last step', () => {
      mockContextValue = createMockContextValue({ isLastStep: true })

      render(
        <TestWrapper>
          <FixedNavigationBar />
        </TestWrapper>
      )

      const submitButton = screen.getByRole('button', {
        name: /Complete/i,
      })
      expect(submitButton).toBeInTheDocument()
    })

    it('renders continue button with custom submitLabel when on last step and submitLabel provided', () => {
      mockContextValue = createMockContextValue({ isLastStep: true })

      render(
        <TestWrapper>
          <FixedNavigationBar submitLabel="Finish Setup" />
        </TestWrapper>
      )

      expect(
        screen.getByRole('button', { name: /Finish Setup/i })
      ).toBeInTheDocument()
    })

    it('renders continue button with custom continueLabel when not on last step and continueLabel provided', () => {
      mockContextValue = createMockContextValue({ isLastStep: false })

      render(
        <TestWrapper>
          <FixedNavigationBar continueLabel="Next Step" />
        </TestWrapper>
      )

      expect(
        screen.getByRole('button', { name: /Next Step/i })
      ).toBeInTheDocument()
    })
  })

  describe('loading state', () => {
    it('disables both buttons and shows loading spinner on continue button when form is submitting', () => {
      mockContextValue = createMockContextValue({
        isSubmitting: true,
      })

      render(
        <TestWrapper>
          <FixedNavigationBar />
        </TestWrapper>
      )

      const buttons = screen.getAllByRole('button')
      expect(buttons).toHaveLength(2)

      // Both buttons should be disabled
      for (const button of buttons) {
        expect(button).toBeDisabled()
      }

      // Continue button should have the spinner (Loader2 icon has animate-spin class)
      const continueButton = screen.getByRole('button', {
        name: /Continue/i,
      })
      const spinner = continueButton.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
    })

    it('does not show loading spinner when form is not submitting', () => {
      mockContextValue = createMockContextValue({
        isSubmitting: false,
      })

      render(
        <TestWrapper>
          <FixedNavigationBar />
        </TestWrapper>
      )

      const buttons = screen.getAllByRole('button')

      // Buttons should be enabled
      for (const button of buttons) {
        expect(button).not.toBeDisabled()
      }

      // No spinner should be present
      const continueButton = screen.getByRole('button', {
        name: /Continue/i,
      })
      const spinner = continueButton.querySelector('.animate-spin')
      expect(spinner).not.toBeInTheDocument()
    })
  })

  describe('container styling', () => {
    it('renders with dashed borders by default (showBorders=true)', () => {
      mockContextValue = createMockContextValue()

      const { container } = render(
        <TestWrapper>
          <FixedNavigationBar />
        </TestWrapper>
      )

      // Check for dashed border classes
      const borderedElements =
        container.querySelectorAll('.border-dashed')
      expect(borderedElements.length).toBeGreaterThan(0)
    })

    it('renders without dashed borders when showBorders=false', () => {
      mockContextValue = createMockContextValue()

      const { container } = render(
        <TestWrapper>
          <FixedNavigationBar showBorders={false} />
        </TestWrapper>
      )

      // Check that no dashed border classes are present
      const borderedElements =
        container.querySelectorAll('.border-dashed')
      expect(borderedElements.length).toBe(0)
    })
  })

  describe('accessibility', () => {
    it('all buttons are keyboard accessible with type="button"', () => {
      mockContextValue = createMockContextValue()

      render(
        <TestWrapper>
          <FixedNavigationBar />
        </TestWrapper>
      )

      const buttons = screen.getAllByRole('button')

      for (const button of buttons) {
        expect(button).toHaveAttribute('type', 'button')
      }
    })

    it('back button contains ArrowLeft icon inside', () => {
      mockContextValue = createMockContextValue()

      render(
        <TestWrapper>
          <FixedNavigationBar />
        </TestWrapper>
      )

      const backButton = screen.getByRole('button', { name: /Back/i })
      // Lucide icons render as SVG elements
      const svgIcon = backButton.querySelector('svg')
      expect(svgIcon).toBeInTheDocument()
    })
  })
})
