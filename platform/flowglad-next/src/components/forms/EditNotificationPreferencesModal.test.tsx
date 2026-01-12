import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { trpc } from '@/app/_trpc/client'
import EditNotificationPreferencesModal from './EditNotificationPreferencesModal'

// Mock tRPC
vi.mock('@/app/_trpc/client', () => ({
  trpc: {
    organizations: {
      updateNotificationPreferences: {
        useMutation: vi.fn(),
      },
    },
    useUtils: vi.fn(),
  },
}))

// Mock the form modal and wrap children with FormProvider
vi.mock('@/components/forms/FormModal', async () => {
  // biome-ignore lint/plugin: dynamic import required for vi.mock factory
  const React = await import('react')
  // biome-ignore lint/plugin: dynamic import required for vi.mock factory
  const { useForm, FormProvider } = await import('react-hook-form')
  function FormModalMock({
    children,
    onSubmit,
    defaultValues,
    setIsOpen,
  }: any) {
    const form = useForm({ defaultValues })
    return (
      <FormProvider {...form}>
        <div data-testid="form-modal">
          <div data-testid="default-values">
            {JSON.stringify(defaultValues)}
          </div>
          <button
            data-testid="submit-button"
            onClick={() => {
              const mockInput = {
                preferences: {
                  testModeNotifications: true,
                  subscriptionCreated: false,
                  subscriptionAdjusted: true,
                  paymentFailed: false,
                },
              }
              const maybePromise = onSubmit(mockInput)
              if (
                maybePromise &&
                typeof maybePromise.then === 'function'
              ) {
                maybePromise
                  .then(() => setIsOpen?.(false))
                  .catch(() => {
                    // Swallow rejection to avoid unhandled errors during tests
                  })
              } else {
                setIsOpen?.(false)
              }
            }}
          >
            Submit
          </button>
          {children}
        </div>
      </FormProvider>
    )
  }
  return { default: FormModalMock }
})

// Mock the notification preferences form fields
vi.mock('./NotificationPreferencesFormFields', () => ({
  default: () => (
    <div data-testid="notification-preferences-form-fields">
      Form Fields
    </div>
  ),
}))

describe('EditNotificationPreferencesModal', () => {
  const mockCurrentPreferences = {
    testModeNotifications: false,
    subscriptionCreated: true,
    subscriptionAdjusted: true,
    subscriptionCanceled: true,
    subscriptionCancellationScheduled: true,
    paymentFailed: true,
    onboardingCompleted: true,
    payoutsEnabled: true,
  }

  const mockMutateAsync = vi.fn()
  const mockInvalidate = vi.fn()
  const mockUtils = {
    organizations: {
      getNotificationPreferences: {
        invalidate: mockInvalidate,
      },
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(trpc.useUtils).mockReturnValue(mockUtils as any)
    vi.mocked(
      trpc.organizations.updateNotificationPreferences.useMutation
    ).mockReturnValue({
      mutateAsync: mockMutateAsync,
    } as any)
  })

  describe('Modal Rendering', () => {
    it('should render the modal with correct props', () => {
      render(
        <EditNotificationPreferencesModal
          isOpen={true}
          setIsOpen={vi.fn()}
          currentPreferences={mockCurrentPreferences}
        />
      )

      expect(screen.getByTestId('form-modal')).toBeInTheDocument()
      expect(
        screen.getByTestId('notification-preferences-form-fields')
      ).toBeInTheDocument()
    })

    it('should render with correct default values', () => {
      render(
        <EditNotificationPreferencesModal
          isOpen={true}
          setIsOpen={vi.fn()}
          currentPreferences={mockCurrentPreferences}
        />
      )

      const defaultValues = JSON.parse(
        screen.getByTestId('default-values').textContent!
      )
      expect(defaultValues.preferences).toEqual(
        mockCurrentPreferences
      )
    })
  })

  describe('Form Submission', () => {
    it('should call updateNotificationPreferences mutation with correct data', async () => {
      mockMutateAsync.mockResolvedValue({ success: true })

      render(
        <EditNotificationPreferencesModal
          isOpen={true}
          setIsOpen={vi.fn()}
          currentPreferences={mockCurrentPreferences}
        />
      )

      const submitButton = screen.getByTestId('submit-button')
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          preferences: {
            testModeNotifications: true,
            subscriptionCreated: false,
            subscriptionAdjusted: true,
            paymentFailed: false,
          },
        })
      })
    })

    it('should invalidate getNotificationPreferences query on successful submission', async () => {
      mockMutateAsync.mockResolvedValue({ success: true })

      render(
        <EditNotificationPreferencesModal
          isOpen={true}
          setIsOpen={vi.fn()}
          currentPreferences={mockCurrentPreferences}
        />
      )

      const submitButton = screen.getByTestId('submit-button')
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockInvalidate).toHaveBeenCalled()
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle mutation errors gracefully', async () => {
      const mockError = new Error(
        'Failed to update notification preferences'
      )
      mockMutateAsync.mockRejectedValue(mockError)

      render(
        <EditNotificationPreferencesModal
          isOpen={true}
          setIsOpen={vi.fn()}
          currentPreferences={mockCurrentPreferences}
        />
      )

      const submitButton = screen.getByTestId('submit-button')
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalled()
      })
    })
  })

  describe('Modal State Management', () => {
    it('should call setIsOpen(false) after successful submit', async () => {
      mockMutateAsync.mockResolvedValue({ success: true })
      const mockSetIsOpen = vi.fn()

      render(
        <EditNotificationPreferencesModal
          isOpen={true}
          setIsOpen={mockSetIsOpen}
          currentPreferences={mockCurrentPreferences}
        />
      )

      expect(screen.getByTestId('form-modal')).toBeInTheDocument()
      fireEvent.click(screen.getByTestId('submit-button'))

      await waitFor(() => {
        expect(mockSetIsOpen).toHaveBeenCalledWith(false)
      })
    })
  })

  describe('Current Preferences Props', () => {
    it('should handle preferences with all notifications enabled', () => {
      const allEnabledPreferences = {
        testModeNotifications: true,
        subscriptionCreated: true,
        subscriptionAdjusted: true,
        subscriptionCanceled: true,
        subscriptionCancellationScheduled: true,
        paymentFailed: true,
        onboardingCompleted: true,
        payoutsEnabled: true,
      }

      render(
        <EditNotificationPreferencesModal
          isOpen={true}
          setIsOpen={vi.fn()}
          currentPreferences={allEnabledPreferences}
        />
      )

      const defaultValues = JSON.parse(
        screen.getByTestId('default-values').textContent!
      )
      expect(defaultValues.preferences).toEqual(allEnabledPreferences)
    })

    it('should handle preferences with all notifications disabled', () => {
      const allDisabledPreferences = {
        testModeNotifications: false,
        subscriptionCreated: false,
        subscriptionAdjusted: false,
        subscriptionCanceled: false,
        subscriptionCancellationScheduled: false,
        paymentFailed: false,
        onboardingCompleted: false,
        payoutsEnabled: false,
      }

      render(
        <EditNotificationPreferencesModal
          isOpen={true}
          setIsOpen={vi.fn()}
          currentPreferences={allDisabledPreferences}
        />
      )

      const defaultValues = JSON.parse(
        screen.getByTestId('default-values').textContent!
      )
      expect(defaultValues.preferences).toEqual(
        allDisabledPreferences
      )
    })

    it('should handle mixed notification preferences', () => {
      const mixedPreferences = {
        testModeNotifications: true,
        subscriptionCreated: false,
        subscriptionAdjusted: true,
        subscriptionCanceled: false,
        subscriptionCancellationScheduled: true,
        paymentFailed: false,
        onboardingCompleted: true,
        payoutsEnabled: false,
      }

      render(
        <EditNotificationPreferencesModal
          isOpen={true}
          setIsOpen={vi.fn()}
          currentPreferences={mixedPreferences}
        />
      )

      const defaultValues = JSON.parse(
        screen.getByTestId('default-values').textContent!
      )
      expect(defaultValues.preferences).toEqual(mixedPreferences)
    })
  })

  describe('TRPC Integration', () => {
    it('should use correct TRPC mutation hook', () => {
      render(
        <EditNotificationPreferencesModal
          isOpen={true}
          setIsOpen={vi.fn()}
          currentPreferences={mockCurrentPreferences}
        />
      )

      expect(
        trpc.organizations.updateNotificationPreferences.useMutation
      ).toHaveBeenCalled()
    })

    it('should pass onSuccess callback to mutation hook', () => {
      render(
        <EditNotificationPreferencesModal
          isOpen={true}
          setIsOpen={vi.fn()}
          currentPreferences={mockCurrentPreferences}
        />
      )

      const mutationCalls = vi.mocked(
        trpc.organizations.updateNotificationPreferences.useMutation
      ).mock.calls
      expect(mutationCalls.length).toBeGreaterThan(0)

      const firstCallArgs = mutationCalls[0]?.[0]
      expect(firstCallArgs).toHaveProperty('onSuccess')
      if (firstCallArgs) {
        expect(typeof firstCallArgs.onSuccess).toBe('function')
      }
    })
  })
})
