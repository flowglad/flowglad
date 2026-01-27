/**
 * @vitest-environment jsdom
 */
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { FixedNavigationBar } from './FixedNavigationBar'
import { MultiStepForm } from './MultiStepForm'

// Minimal step schemas for testing
const step1Schema = z.object({
  name: z.string().min(1),
})

const step2Schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
})

const step3Schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  company: z.string().min(1),
})

// Simple step components for testing
function Step1() {
  return <div data-testid="step-1">Step 1 Content</div>
}

function Step2() {
  return <div data-testid="step-2">Step 2 Content</div>
}

function Step3() {
  return <div data-testid="step-3">Step 3 Content</div>
}

const testSteps = [
  {
    id: 'step-1',
    title: 'Step 1',
    schema: step1Schema,
    component: Step1,
  },
  {
    id: 'step-2',
    title: 'Step 2',
    schema: step2Schema,
    component: Step2,
  },
  {
    id: 'step-3',
    title: 'Step 3',
    schema: step3Schema,
    component: Step3,
  },
]

const validFormData = {
  name: 'Test User',
  email: 'test@example.com',
  company: 'Test Corp',
}

interface TestWrapperProps {
  children: React.ReactNode
  initialStep?: number
  defaultValues?: Record<string, string>
  onComplete?: (data: unknown) => Promise<void>
  onStepChange?: (step: number) => void
}

function TestWrapper({
  children,
  initialStep = 0,
  defaultValues = validFormData,
  onComplete = async () => {},
  onStepChange,
}: TestWrapperProps) {
  return (
    <MultiStepForm
      schema={step3Schema}
      defaultValues={defaultValues}
      steps={testSteps}
      onComplete={onComplete}
      initialStep={initialStep}
      onStepChange={onStepChange}
    >
      {children}
    </MultiStepForm>
  )
}

describe('FixedNavigationBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('back button behavior', () => {
    it('renders back button with "Login" label and calls onBackOverride when on first step with override provided', () => {
      const mockBackOverride = vi.fn()

      render(
        <TestWrapper initialStep={0}>
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
    })

    it('renders back button with "Back" label and navigates to previous step when on non-first step', async () => {
      const onStepChange = vi.fn()

      render(
        <TestWrapper initialStep={1} onStepChange={onStepChange}>
          <FixedNavigationBar />
          {/* Render step content to verify navigation */}
          <Step1 />
          <Step2 />
        </TestWrapper>
      )

      const backButton = screen.getByRole('button', { name: /Back/i })
      expect(backButton).toBeInTheDocument()

      fireEvent.click(backButton)

      await waitFor(() => {
        expect(onStepChange).toHaveBeenCalledWith(0)
      })
    })

    it('renders back button with "Back" label and calls goToPrevious when on first step without onBackOverride', () => {
      // On first step without override, clicking back should still call goToPrevious
      // (which will clamp to 0, effectively a no-op)
      render(
        <TestWrapper initialStep={0}>
          <FixedNavigationBar />
        </TestWrapper>
      )

      const backButton = screen.getByRole('button', { name: /Back/i })
      expect(backButton).toBeInTheDocument()

      // Should not throw when clicked
      fireEvent.click(backButton)

      // Button should still be present (navigation stays at step 0)
      expect(
        screen.getByRole('button', { name: /Back/i })
      ).toBeInTheDocument()
    })

    it('renders back button with custom backLabel when provided and not on first step', () => {
      render(
        <TestWrapper initialStep={1}>
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
      render(
        <TestWrapper initialStep={0}>
          <FixedNavigationBar />
        </TestWrapper>
      )

      const continueButton = screen.getByRole('button', {
        name: /Continue/i,
      })
      expect(continueButton).toBeInTheDocument()
    })

    it('advances to next step when continue is clicked with valid data', async () => {
      const onStepChange = vi.fn()

      render(
        <TestWrapper initialStep={0} onStepChange={onStepChange}>
          <FixedNavigationBar />
        </TestWrapper>
      )

      const continueButton = screen.getByRole('button', {
        name: /Continue/i,
      })

      fireEvent.click(continueButton)

      await waitFor(() => {
        expect(onStepChange).toHaveBeenCalledWith(1)
      })
    })

    it('renders continue button with "Complete" label when on last step', () => {
      render(
        <TestWrapper initialStep={2}>
          <FixedNavigationBar />
        </TestWrapper>
      )

      const submitButton = screen.getByRole('button', {
        name: /Complete/i,
      })
      expect(submitButton).toBeInTheDocument()
    })

    it('renders continue button with custom submitLabel when on last step and submitLabel provided', () => {
      render(
        <TestWrapper initialStep={2}>
          <FixedNavigationBar submitLabel="Finish Setup" />
        </TestWrapper>
      )

      expect(
        screen.getByRole('button', { name: /Finish Setup/i })
      ).toBeInTheDocument()
    })

    it('renders continue button with custom continueLabel when not on last step and continueLabel provided', () => {
      render(
        <TestWrapper initialStep={0}>
          <FixedNavigationBar continueLabel="Next Step" />
        </TestWrapper>
      )

      expect(
        screen.getByRole('button', { name: /Next Step/i })
      ).toBeInTheDocument()
    })

    it('calls onComplete when clicking complete on last step with valid data', async () => {
      const onComplete = vi.fn().mockResolvedValue(undefined)

      render(
        <TestWrapper initialStep={2} onComplete={onComplete}>
          <FixedNavigationBar />
        </TestWrapper>
      )

      const submitButton = screen.getByRole('button', {
        name: /Complete/i,
      })

      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalledTimes(1)
        const calledWith = onComplete.mock.calls[0][0]
        expect(calledWith).toMatchObject({
          name: 'Test User',
          email: 'test@example.com',
          company: 'Test Corp',
        })
      })
    })
  })

  describe('loading state', () => {
    it('shows loading spinner on continue button during form submission', async () => {
      // Create a promise we can control to keep the form in submitting state
      let resolveSubmit: () => void
      const submitPromise = new Promise<void>((resolve) => {
        resolveSubmit = resolve
      })
      const onComplete = vi.fn().mockReturnValue(submitPromise)

      render(
        <TestWrapper initialStep={2} onComplete={onComplete}>
          <FixedNavigationBar />
        </TestWrapper>
      )

      const submitButton = screen.getByRole('button', {
        name: /Complete/i,
      })

      fireEvent.click(submitButton)

      // Wait for the spinner to appear (form is submitting)
      await waitFor(() => {
        const spinner = submitButton.querySelector('.animate-spin')
        expect(spinner).toBeInTheDocument()
      })

      // Both buttons should be disabled during submission
      const buttons = screen.getAllByRole('button')
      for (const button of buttons) {
        expect(button).toBeDisabled()
      }

      // Resolve the submission
      resolveSubmit!()

      // Wait for spinner to disappear
      await waitFor(() => {
        const spinner = submitButton.querySelector('.animate-spin')
        expect(spinner).not.toBeInTheDocument()
      })
    })

    it('does not show loading spinner when form is not submitting', () => {
      render(
        <TestWrapper initialStep={0}>
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
