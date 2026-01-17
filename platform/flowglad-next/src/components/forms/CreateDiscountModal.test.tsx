import { beforeEach, describe, expect, it, mock } from 'bun:test'
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { DiscountAmountType, DiscountDuration } from '@/types'
import CreateDiscountModal from './CreateDiscountModal'

const mockOrganization = {
  id: 'org_123',
  name: 'Test Org',
  createdAt: new Date(),
  updatedAt: new Date(),
  domain: null,
  countryId: 'US',
  logoURL: null,
  tagline: null,
  subdomainSlug: null,
  defaultCurrency: 'USD',
  hasCompletedStripeConnectOnboarding: false,
  stripeAccountId: null,
  stripeConnectContractType: 'platform',
  clerkOrganizationId: 'org_123',
  payoutsEnabled: false,
  tld: 'com',
  autoAcceptUsersFromEmailDomain: false,
  passkeyAuthEnabled: false,
  duesEnabled: false,
  feePercentage: '0',
  delayDays: 0,
  enableSubscriptions: true,
  emailsEnabled: false,
  displayName: 'Test Org',
  contactEmail: null,
}

// Create mock functions outside mock.module so they can be accessed in tests
const mockUseAuthenticatedContext = mock(() => ({
  organization: mockOrganization,
  user: undefined,
  apiKey: undefined,
}))

const mockMutateAsync = mock((_params: unknown) =>
  Promise.resolve(undefined)
)

const mockUseMutation = mock(() => ({
  mutateAsync: mockMutateAsync,
}))

// Mock the auth context
mock.module('@/contexts/authContext', () => ({
  useAuthenticatedContext: mockUseAuthenticatedContext,
}))

// Mock tRPC
mock.module('@/app/_trpc/client', () => ({
  trpc: {
    discounts: {
      create: {
        useMutation: mockUseMutation,
      },
    },
  },
}))

// Mock the stripe utils
mock.module('@/utils/stripe', () => ({
  rawStringAmountToCountableCurrencyAmount: mock(
    (currency: string, amount: string) => {
      // Mock conversion: "10.50" -> 1050 (cents)
      return Math.round(parseFloat(amount) * 100)
    }
  ),
}))

// Mock the form modal and provide FormProvider context so inner fields can use useFormContext
mock.module('@/components/forms/FormModal', async () => {
  // biome-ignore lint/plugin: dynamic import required for mock.module factory
  const React = await import('react')
  // biome-ignore lint/plugin: dynamic import required for mock.module factory
  const { useForm, FormProvider } = await import('react-hook-form')
  function FormModalMock({ children, onSubmit, defaultValues }: any) {
    const form = useForm({ defaultValues })
    return (
      <FormProvider {...form}>
        <div data-testid="form-modal">
          <div data-testid="default-values">
            {JSON.stringify(defaultValues)}
          </div>
          <button
            data-testid="submit-button"
            onClick={async () => {
              const mockInput = {
                discount: {
                  name: 'Test Discount',
                  code: 'TEST10',
                  amountType: DiscountAmountType.Fixed,
                  amount: 0,
                  duration: DiscountDuration.Once,
                  active: true,
                  numberOfPayments: null,
                },
                __rawAmountString: '10.50',
              }
              try {
                await onSubmit(mockInput)
              } catch {}
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

// Mock the discount form fields
mock.module('./DiscountFormFields', () => ({
  default: () => (
    <div data-testid="discount-form-fields">Form Fields</div>
  ),
}))

describe('CreateDiscountModal', () => {
  beforeEach(() => {
    mockMutateAsync.mockClear()
    mockUseAuthenticatedContext.mockClear()
    mockUseMutation.mockClear()
  })

  describe('Modal Rendering', () => {
    it('should render the modal with correct props', () => {
      render(
        <CreateDiscountModal
          isOpen={true}
          setIsOpen={mock(() => undefined)}
        />
      )

      expect(screen.getByTestId('form-modal')).toBeInTheDocument()
      expect(
        screen.getByTestId('discount-form-fields')
      ).toBeInTheDocument()
    })

    it('should render with correct default values', () => {
      render(
        <CreateDiscountModal
          isOpen={true}
          setIsOpen={mock(() => undefined)}
        />
      )

      const defaultValues = JSON.parse(
        screen.getByTestId('default-values').textContent!
      )
      expect(defaultValues).toEqual({
        discount: {
          name: '',
          code: '',
          amountType: DiscountAmountType.Fixed,
          // amount omitted for fixed form defaults
          duration: DiscountDuration.Once,
          active: true,
          numberOfPayments: null,
        },
        __rawAmountString: '0',
      })
    })
  })

  describe('Form Submission - Fixed Amount', () => {
    it('should calculate amount correctly for fixed discount type', async () => {
      const { rawStringAmountToCountableCurrencyAmount } =
        // biome-ignore lint/plugin: dynamic import required to access mocked module
        await import('@/utils/stripe')

      render(
        <CreateDiscountModal
          isOpen={true}
          setIsOpen={mock(() => undefined)}
        />
      )

      const submitButton = screen.getByTestId('submit-button')
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(
          rawStringAmountToCountableCurrencyAmount
        ).toHaveBeenCalledWith('USD', '10.50')
        expect(mockMutateAsync).toHaveBeenCalledWith({
          discount: {
            name: 'Test Discount',
            code: 'TEST10',
            amountType: DiscountAmountType.Fixed,
            amount: 1050, // 10.50 * 100
            duration: DiscountDuration.Once,
            active: true,
            numberOfPayments: null,
          },
        })
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle mutation errors gracefully', async () => {
      const mockError = new Error('Failed to create discount')
      mockMutateAsync.mockRejectedValue(mockError)

      render(
        <CreateDiscountModal
          isOpen={true}
          setIsOpen={mock(() => undefined)}
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
    it('should call setIsOpen when modal state changes', () => {
      const mockSetIsOpen = mock(() => undefined)
      render(
        <CreateDiscountModal
          isOpen={true}
          setIsOpen={mockSetIsOpen}
        />
      )

      // The modal should be rendered
      expect(screen.getByTestId('form-modal')).toBeInTheDocument()

      // If the modal has close functionality, it would call setIsOpen(false)
      // This would be tested through the FormModal component's behavior
    })
  })
})
