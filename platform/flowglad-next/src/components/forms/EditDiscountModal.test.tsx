/// <reference lib="dom" />

import {
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  mock,
} from 'bun:test'
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { FormProvider, useForm } from 'react-hook-form'

import { trpc } from '@/app/_trpc/client'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { DiscountAmountType, DiscountDuration } from '@/types'
import EditDiscountModal from './EditDiscountModal'

// Mock the auth context (compatible with DiscountFormFields.test.tsx)
mock.module('@/contexts/authContext', () => ({
  useAuthenticatedContext: mock(() => {}),
  useAuthContext: mock(() => {}),
}))

// Mock tRPC
mock.module('@/app/_trpc/client', () => ({
  trpc: {
    discounts: {
      update: {
        useMutation: mock(() => {}),
      },
    },
  },
}))

// Mock the stripe utils (combined mock for both tests)
mock.module('@/utils/stripe', () => ({
  rawStringAmountToCountableCurrencyAmount: mock(
    (_currency: string, amount: string) => {
      return Math.round(parseFloat(amount) * 100)
    }
  ),
  countableCurrencyAmountToRawStringAmount: mock(
    (_currency: string, amount: number) => {
      return (amount / 100).toFixed(2)
    }
  ),
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

// Mock FormModal to control form submission
mock.module('@/components/forms/FormModal', () => {
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
            onClick={async () => {
              // Build submission payload based on discount type
              const isPercent =
                defaultValues?.discount?.amountType ===
                DiscountAmountType.Percent

              const mockInput = isPercent
                ? {
                    discount: {
                      ...defaultValues.discount,
                      name: 'Updated Percent Discount',
                      code: 'PERCENT30',
                      amount: 30.7, // decimal to test rounding
                    },
                    id: defaultValues?.id ?? 'discount_123',
                  }
                : {
                    discount: {
                      ...defaultValues.discount,
                      name: 'Updated Discount',
                      code: 'UPDATED10',
                      amount: undefined,
                    },
                    __rawAmountString: '15.75',
                    id: defaultValues?.id ?? 'discount_123',
                  }

              try {
                await onSubmit(mockInput)
                setIsOpen?.(false)
              } catch {
                // Don't close on error
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

describe('EditDiscountModal', () => {
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

  const mockDiscount = {
    id: 'discount_123',
    name: 'Original Discount',
    code: 'ORIGINAL10',
    amount: 1000, // $10.00 in cents
    amountType: DiscountAmountType.Fixed,
    duration: DiscountDuration.Once,
    active: true,
    numberOfPayments: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    livemode: true,
    organizationId: 'org_123',
  } as any

  const mockMutateAsync = mock(() => {}).mockResolvedValue({})
  const mockEditDiscount = {
    mutateAsync: mockMutateAsync,
  }

  beforeEach(() => {
    mockMutateAsync.mockClear()
    ;(useAuthenticatedContext as Mock).mockReturnValue({
      organization: mockOrganization as any,
      user: undefined as any,
      apiKey: undefined as any,
    })
    ;(trpc.discounts.update.useMutation as Mock).mockReturnValue(
      mockEditDiscount as any
    )
  })

  describe('Modal Rendering', () => {
    it('renders the modal with form fields', () => {
      render(
        <EditDiscountModal
          isOpen={true}
          setIsOpen={mock(() => {})}
          discount={mockDiscount}
        />
      )

      expect(screen.getByTestId('form-modal')).toBeInTheDocument()
      // DiscountFormFields renders real component with mocked dependencies
      expect(screen.getByTestId('currency-input')).toBeInTheDocument()
    })

    it('displays default values from the discount prop', () => {
      render(
        <EditDiscountModal
          isOpen={true}
          setIsOpen={mock(() => {})}
          discount={mockDiscount}
        />
      )

      const defaultValues = JSON.parse(
        screen.getByTestId('default-values').textContent!
      )
      expect(defaultValues.discount.id).toBe('discount_123')
      // Amount is converted: 1000 cents -> "10.00"
      expect(defaultValues.__rawAmountString).toBe('10.00')
    })
  })

  describe('Form Submission - Fixed Amount', () => {
    it('converts raw amount string to cents and calls mutation', async () => {
      const { rawStringAmountToCountableCurrencyAmount } =
        // biome-ignore lint/plugin: dynamic import required to access mocked module
        await import('@/utils/stripe')

      render(
        <EditDiscountModal
          isOpen={true}
          setIsOpen={mock(() => {})}
          discount={mockDiscount}
        />
      )

      const submitButton = screen.getByTestId('submit-button')
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(
          rawStringAmountToCountableCurrencyAmount
        ).toHaveBeenCalledWith('USD', '15.75')
        expect(mockMutateAsync).toHaveBeenCalledTimes(1)
        const callArgs = mockMutateAsync.mock.calls[0][0]
        expect(callArgs.discount.amountType).toBe(
          DiscountAmountType.Fixed
        )
        expect(callArgs.discount.amount).toBe(1575) // 15.75 * 100
      })
    })
  })

  describe('Form Submission - Percent Amount', () => {
    it('rounds percent to integer and calls mutation', async () => {
      const percentDiscount = {
        ...mockDiscount,
        amountType: DiscountAmountType.Percent,
        amount: 25,
      }

      const mutateSpy = mock(() => {}).mockResolvedValue({
        success: true,
      })
      ;(trpc.discounts.update.useMutation as Mock).mockReturnValue({
        mutateAsync: mutateSpy,
      } as any)

      render(
        <EditDiscountModal
          isOpen={true}
          setIsOpen={mock(() => {})}
          discount={percentDiscount}
        />
      )

      const submitButton = screen.getByTestId('submit-button')
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mutateSpy).toHaveBeenCalledTimes(1)
        const payload = mutateSpy.mock.calls[0][0]
        expect(payload.discount.amountType).toBe(
          DiscountAmountType.Percent
        )
        // Should round 30.7 to 31
        expect(payload.discount.amount).toBe(31)
      })
    })
  })

  describe('Default Values Conversion', () => {
    it('converts countable amount to raw string for display', async () => {
      const { countableCurrencyAmountToRawStringAmount } =
        // biome-ignore lint/plugin: dynamic import required to access mocked module
        await import('@/utils/stripe')

      render(
        <EditDiscountModal
          isOpen={true}
          setIsOpen={mock(() => {})}
          discount={mockDiscount}
        />
      )

      expect(
        countableCurrencyAmountToRawStringAmount
      ).toHaveBeenCalledWith('USD', 1000)
    })

    it('handles different currency amounts correctly', () => {
      const discountWithDifferentAmount = {
        ...mockDiscount,
        amount: 2500, // $25.00
      }

      render(
        <EditDiscountModal
          isOpen={true}
          setIsOpen={mock(() => {})}
          discount={discountWithDifferentAmount}
        />
      )

      const defaultValues = JSON.parse(
        screen.getByTestId('default-values').textContent!
      )
      expect(defaultValues.__rawAmountString).toBe('25.00')
    })
  })

  describe('Error Handling', () => {
    it('handles mutation errors without crashing', async () => {
      const mockError = new Error('Failed to update discount')
      mockMutateAsync.mockRejectedValue(mockError)

      render(
        <EditDiscountModal
          isOpen={true}
          setIsOpen={mock(() => {})}
          discount={mockDiscount}
        />
      )

      const submitButton = screen.getByTestId('submit-button')
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('Modal State Management', () => {
    it('triggers submission when submit button is clicked', async () => {
      const mockSetIsOpen = mock(() => {})
      render(
        <EditDiscountModal
          isOpen={true}
          setIsOpen={mockSetIsOpen}
          discount={mockDiscount}
        />
      )

      expect(screen.getByTestId('form-modal')).toBeInTheDocument()
      fireEvent.click(screen.getByTestId('submit-button'))

      // Verify the mutation is called (the actual modal close is handled by FormModal)
      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('Discount Props', () => {
    it('handles percent discount type correctly', () => {
      const percentDiscount = {
        ...mockDiscount,
        amountType: DiscountAmountType.Percent,
        amount: 15,
      }

      render(
        <EditDiscountModal
          isOpen={true}
          setIsOpen={mock(() => {})}
          discount={percentDiscount}
        />
      )

      const defaultValues = JSON.parse(
        screen.getByTestId('default-values').textContent!
      )
      expect(defaultValues.discount.amountType).toBe(
        DiscountAmountType.Percent
      )
      expect(defaultValues.discount.amount).toBe(15)
    })

    it('handles recurring discounts correctly', () => {
      const recurringDiscount = {
        ...mockDiscount,
        duration: DiscountDuration.NumberOfPayments,
        numberOfPayments: 3,
      }

      render(
        <EditDiscountModal
          isOpen={true}
          setIsOpen={mock(() => {})}
          discount={recurringDiscount}
        />
      )

      const defaultValues = JSON.parse(
        screen.getByTestId('default-values').textContent!
      )
      expect(defaultValues.discount.duration).toBe(
        DiscountDuration.NumberOfPayments
      )
      expect(defaultValues.discount.numberOfPayments).toBe(3)
    })
  })
})
