import { beforeEach, describe, expect, it, mock } from 'bun:test'
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import type { DefaultValues, FieldValues } from 'react-hook-form'
import { trpc } from '@/app/_trpc/client'
import type { NotificationPreferences } from '@/db/schema/memberships'

interface FormModalMockProps<T extends FieldValues> {
  children: ReactNode
  onSubmit: (data: T) => Promise<void> | void
  defaultValues: DefaultValues<T>
  setIsOpen: (open: boolean) => void
}

interface EditNotificationPreferencesInput {
  preferences: Partial<NotificationPreferences>
}

// Mock tRPC - network calls need to be mocked per testing guidelines
const mockUseMutation = mock()
const mockUseUtils = mock()

mock.module('@/app/_trpc/client', () => ({
  trpc: {
    organizations: {
      updateNotificationPreferences: {
        useMutation: mockUseMutation,
      },
    },
    useUtils: mockUseUtils,
  },
}))

// Mock the form modal and wrap children with FormProvider
// This mock is consistent with the established pattern in other modal tests (e.g., EditDiscountModal.test.tsx)
mock.module('@/components/forms/FormModal', async () => {
  // biome-ignore lint/plugin: dynamic import required for mock.module factory
  const { useForm, FormProvider } = await import('react-hook-form')
  function FormModalMock<T extends FieldValues>({
    children,
    onSubmit,
    defaultValues,
    setIsOpen,
  }: FormModalMockProps<T>) {
    const form = useForm({ defaultValues })
    return (
      <FormProvider {...form}>
        <div data-testid="form-modal">
          <div data-testid="default-values">
            {JSON.stringify(defaultValues)}
          </div>
          <button
            data-testid="submit-button"
            type="button"
            onClick={() => {
              const mockInput: EditNotificationPreferencesInput = {
                preferences: {
                  testModeNotifications: true,
                  subscriptionCreated: false,
                  subscriptionAdjusted: true,
                  paymentFailed: false,
                },
              }
              const maybePromise = onSubmit(mockInput as unknown as T)
              if (
                maybePromise &&
                typeof maybePromise.then === 'function'
              ) {
                maybePromise
                  .then(() => setIsOpen(false))
                  .catch(() => {
                    // Swallow rejection to avoid unhandled errors during tests
                  })
              } else {
                setIsOpen(false)
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
// This mock is consistent with the established pattern in other modal tests
mock.module('./NotificationPreferencesFormFields', () => ({
  default: () => (
    <div data-testid="notification-preferences-form-fields">
      Form Fields
    </div>
  ),
}))

// Import component AFTER mock.module calls (bun:test doesn't hoist mocks)
import EditNotificationPreferencesModal from './EditNotificationPreferencesModal'

describe('EditNotificationPreferencesModal', () => {
  const mockCurrentPreferences: NotificationPreferences = {
    testModeNotifications: false,
    subscriptionCreated: true,
    subscriptionAdjusted: true,
    subscriptionCanceled: true,
    subscriptionCancellationScheduled: true,
    paymentFailed: true,
    paymentSuccessful: true,
  }

  const mockMutateAsync = mock()
  const mockInvalidate = mock()
  const mockUtils = {
    organizations: {
      getNotificationPreferences: {
        invalidate: mockInvalidate,
      },
    },
  }

  beforeEach(() => {
    mockMutateAsync.mockClear()
    mockInvalidate.mockClear()
    mockUseMutation.mockClear()
    mockUseUtils.mockClear()

    mockUseUtils.mockReturnValue(
      mockUtils as unknown as ReturnType<typeof trpc.useUtils>
    )
    // Mock useMutation to capture the onSuccess callback and call it when mutateAsync resolves
    mockUseMutation.mockImplementation(
      (options: { onSuccess?: (...args: unknown[]) => void }) => {
        const onSuccess = options?.onSuccess
        const mutateAsyncWithCallback = mock(
          async (data: unknown) => {
            const result = await mockMutateAsync(data)
            if (onSuccess) {
              // onSuccess signature: (data, variables, context, mutation)
              // We pass undefined for context and mutation since we don't use them
              onSuccess(result, data, undefined, undefined)
            }
            return result
          }
        )
        return {
          mutateAsync: mutateAsyncWithCallback,
        } as unknown as ReturnType<
          typeof trpc.organizations.updateNotificationPreferences.useMutation
        >
      }
    )
  })

  describe('Modal Rendering', () => {
    it('renders the modal with form fields when open', () => {
      render(
        <EditNotificationPreferencesModal
          isOpen={true}
          setIsOpen={mock()}
          currentPreferences={mockCurrentPreferences}
        />
      )

      expect(screen.getByTestId('form-modal')).toBeInTheDocument()
      expect(
        screen.getByTestId('notification-preferences-form-fields')
      ).toBeInTheDocument()
    })

    it('passes current preferences as default values to the form', () => {
      render(
        <EditNotificationPreferencesModal
          isOpen={true}
          setIsOpen={mock()}
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
    it('calls updateNotificationPreferences mutation with submitted preferences', async () => {
      mockMutateAsync.mockResolvedValue({ success: true })

      render(
        <EditNotificationPreferencesModal
          isOpen={true}
          setIsOpen={mock()}
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

    it('invalidates getNotificationPreferences query on successful submission', async () => {
      mockMutateAsync.mockResolvedValue({ success: true })

      render(
        <EditNotificationPreferencesModal
          isOpen={true}
          setIsOpen={mock()}
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
    it('does not close modal when mutation fails', async () => {
      const mockError = new Error(
        'Failed to update notification preferences'
      )
      mockMutateAsync.mockRejectedValue(mockError)
      const mockSetIsOpen = mock()

      render(
        <EditNotificationPreferencesModal
          isOpen={true}
          setIsOpen={mockSetIsOpen}
          currentPreferences={mockCurrentPreferences}
        />
      )

      const submitButton = screen.getByTestId('submit-button')
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalled()
      })

      // Modal should not close on error (setIsOpen(false) not called)
      expect(mockSetIsOpen).not.toHaveBeenCalledWith(false)
    })
  })

  describe('Modal State Management', () => {
    it('closes modal after successful submission', async () => {
      mockMutateAsync.mockResolvedValue({ success: true })
      const mockSetIsOpen = mock()

      render(
        <EditNotificationPreferencesModal
          isOpen={true}
          setIsOpen={mockSetIsOpen}
          currentPreferences={mockCurrentPreferences}
        />
      )

      fireEvent.click(screen.getByTestId('submit-button'))

      await waitFor(() => {
        expect(mockSetIsOpen).toHaveBeenCalledWith(false)
      })
    })
  })

  describe('Current Preferences Props', () => {
    it('initializes form with all notifications enabled when passed', () => {
      const allEnabledPreferences: NotificationPreferences = {
        testModeNotifications: true,
        subscriptionCreated: true,
        subscriptionAdjusted: true,
        subscriptionCanceled: true,
        subscriptionCancellationScheduled: true,
        paymentFailed: true,
        paymentSuccessful: true,
      }

      render(
        <EditNotificationPreferencesModal
          isOpen={true}
          setIsOpen={mock()}
          currentPreferences={allEnabledPreferences}
        />
      )

      const defaultValues = JSON.parse(
        screen.getByTestId('default-values').textContent!
      )
      expect(defaultValues.preferences).toEqual(allEnabledPreferences)
    })

    it('initializes form with all notifications disabled when passed', () => {
      const allDisabledPreferences: NotificationPreferences = {
        testModeNotifications: false,
        subscriptionCreated: false,
        subscriptionAdjusted: false,
        subscriptionCanceled: false,
        subscriptionCancellationScheduled: false,
        paymentFailed: false,
        paymentSuccessful: false,
      }

      render(
        <EditNotificationPreferencesModal
          isOpen={true}
          setIsOpen={mock()}
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

    it('initializes form with mixed notification preferences when passed', () => {
      const mixedPreferences: NotificationPreferences = {
        testModeNotifications: true,
        subscriptionCreated: false,
        subscriptionAdjusted: true,
        subscriptionCanceled: false,
        subscriptionCancellationScheduled: true,
        paymentFailed: false,
        paymentSuccessful: true,
      }

      render(
        <EditNotificationPreferencesModal
          isOpen={true}
          setIsOpen={mock()}
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
    it('uses updateNotificationPreferences mutation hook', () => {
      render(
        <EditNotificationPreferencesModal
          isOpen={true}
          setIsOpen={mock()}
          currentPreferences={mockCurrentPreferences}
        />
      )

      expect(
        trpc.organizations.updateNotificationPreferences.useMutation
      ).toHaveBeenCalled()
    })

    it('configures mutation with onSuccess callback that invalidates preferences query', () => {
      render(
        <EditNotificationPreferencesModal
          isOpen={true}
          setIsOpen={mock()}
          currentPreferences={mockCurrentPreferences}
        />
      )

      const mutationCalls = mockUseMutation.mock.calls
      expect(mutationCalls.length).toBeGreaterThan(0)

      const firstCallArgs = mutationCalls[0]?.[0] as
        | { onSuccess?: unknown }
        | undefined
      expect(firstCallArgs).toHaveProperty('onSuccess')
      expect(typeof firstCallArgs?.onSuccess).toBe('function')
    })
  })
})
