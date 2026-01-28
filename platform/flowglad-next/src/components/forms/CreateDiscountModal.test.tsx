/// <reference lib="dom" />

import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type { ReactNode } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { DiscountAmountType, DiscountDuration } from '@/types'

// Create mock functions
const mockMutateAsync = mock(() => Promise.resolve({}))
const mockUseMutation = mock(() => ({
  mutateAsync: mockMutateAsync,
}))
const mockUseAuthenticatedContext = mock(() => ({
  organization: {
    id: 'org_123',
    name: 'Test Org',
    defaultCurrency: 'USD',
  },
  user: undefined,
  apiKey: undefined,
}))
const mockRawStringAmountToCountableCurrencyAmount = mock(
  (_currency: string, amount: string) =>
    Math.round(Number.parseFloat(amount) * 100)
)

// Mock modules (compatible with DiscountFormFields.test.tsx)
mock.module('@/contexts/authContext', () => ({
  useAuthenticatedContext: mockUseAuthenticatedContext,
  useAuthContext: mock(() => ({
    organization: {
      id: 'org_123',
      name: 'Test Org',
      defaultCurrency: 'USD',
    },
    user: undefined,
    apiKey: undefined,
  })),
}))

mock.module('@/app/_trpc/client', () => ({
  trpc: {
    discounts: {
      create: {
        useMutation: mockUseMutation,
      },
    },
  },
}))

// Combined stripe mock with all needed functions
mock.module('@/utils/stripe', () => ({
  rawStringAmountToCountableCurrencyAmount:
    mockRawStringAmountToCountableCurrencyAmount,
  isCurrencyZeroDecimal: mock(() => false),
}))

// Mock PricingModelSelect (needed by DiscountFormFields)
mock.module('@/components/forms/PricingModelSelect', () => ({
  default: () => (
    <div data-testid="pricing-model-select">
      Mocked PricingModelSelect
    </div>
  ),
}))

// Mock currency character (needed by DiscountFormFields)
mock.module('@/registry/lib/currency', () => ({
  currencyCharacter: mock(() => '$'),
}))

// Mock currency input (needed by DiscountFormFields)
mock.module('@/components/ui/currency-input', () => ({
  CurrencyInput: ({ value, onValueChange, allowDecimals }: any) => (
    <input
      data-testid="currency-input"
      value={value ?? ''}
      onChange={(e) => onValueChange?.(e.target.value)}
      data-allow-decimals={allowDecimals}
    />
  ),
}))

// Mock FormModal with FormProvider context
mock.module('@/components/forms/FormModal', () => {
  function FormModalMock({
    children,
    onSubmit,
    defaultValues,
  }: {
    children: ReactNode
    onSubmit: (data: unknown) => Promise<void>
    defaultValues?: Record<string, unknown>
  }) {
    const form = useForm({ defaultValues })
    return (
      <FormProvider {...form}>
        <div data-testid="form-modal">
          <div data-testid="default-values">
            {JSON.stringify(defaultValues)}
          </div>
          <button
            type="button"
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
              } catch {
                // Swallow
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

// Import after mocks
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import CreateDiscountModal from './CreateDiscountModal'

describe('CreateDiscountModal', () => {
  beforeEach(() => {
    mockMutateAsync.mockClear()
    mockUseMutation.mockClear()
    mockRawStringAmountToCountableCurrencyAmount.mockClear()
    mockUseMutation.mockReturnValue({
      mutateAsync: mockMutateAsync,
    })
  })

  describe('Modal Rendering', () => {
    it('renders the modal with form fields', () => {
      render(
        <CreateDiscountModal
          isOpen={true}
          setIsOpen={mock(() => {})}
        />
      )

      expect(screen.getByTestId('form-modal')).toBeInTheDocument()
      // DiscountFormFields renders real component with mocked dependencies
      expect(screen.getByTestId('currency-input')).toBeInTheDocument()
    })

    it('renders with correct default values', () => {
      render(
        <CreateDiscountModal
          isOpen={true}
          setIsOpen={mock(() => {})}
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
          duration: DiscountDuration.Once,
          active: true,
          numberOfPayments: null,
        },
        __rawAmountString: '0',
      })
    })
  })

  describe('Form Submission - Fixed Amount', () => {
    it('converts amount and calls create mutation', async () => {
      render(
        <CreateDiscountModal
          isOpen={true}
          setIsOpen={mock(() => {})}
        />
      )

      const submitButton = screen.getByTestId('submit-button')
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(
          mockRawStringAmountToCountableCurrencyAmount
        ).toHaveBeenCalledWith('USD', '10.50')
        expect(mockMutateAsync).toHaveBeenCalledWith({
          discount: {
            name: 'Test Discount',
            code: 'TEST10',
            amountType: DiscountAmountType.Fixed,
            amount: 1050,
            duration: DiscountDuration.Once,
            active: true,
            numberOfPayments: null,
          },
        })
      })
    })
  })

  describe('Error Handling', () => {
    it('handles mutation errors without crashing', async () => {
      const mockError = new Error('Failed to create discount')
      mockMutateAsync.mockRejectedValue(mockError)

      render(
        <CreateDiscountModal
          isOpen={true}
          setIsOpen={mock(() => {})}
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
    it('renders modal when isOpen is true', () => {
      const mockSetIsOpen = mock(() => {})
      render(
        <CreateDiscountModal
          isOpen={true}
          setIsOpen={mockSetIsOpen}
        />
      )

      expect(screen.getByTestId('form-modal')).toBeInTheDocument()
    })
  })
})
