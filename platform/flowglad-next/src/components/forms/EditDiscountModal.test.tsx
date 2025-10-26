import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react'
import EditDiscountModal from './EditDiscountModal'
import { DiscountAmountType, DiscountDuration } from '@/types'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { trpc } from '@/app/_trpc/client'

// Mock the auth context
vi.mock('@/contexts/authContext', () => ({
  useAuthenticatedContext: vi.fn(),
}))

// Mock tRPC
vi.mock('@/app/_trpc/client', () => ({
  trpc: {
    discounts: {
      update: {
        useMutation: vi.fn(),
      },
    },
  },
}))

// Mock the stripe utils
vi.mock('@/utils/stripe', () => ({
  rawStringAmountToCountableCurrencyAmount: vi.fn(
    (currency, amount) => {
      // Mock conversion: "10.50" -> 1050 (cents)
      return Math.round(parseFloat(amount) * 100)
    }
  ),
  countableCurrencyAmountToRawStringAmount: vi.fn(
    (currency, amount) => {
      // Mock conversion: 1050 -> "10.50"
      return (amount / 100).toFixed(2)
    }
  ),
}))

// Mock the form modal and wrap children with FormProvider
vi.mock('@/components/forms/FormModal', async () => {
  const React = await import('react')
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
              // Simulate submit based on defaultValues (fixed vs percent)
              const isPercent =
                defaultValues?.discount?.amountType ===
                DiscountAmountType.Percent
              const mockInput = isPercent
                ? {
                    discount: {
                      name: 'Updated Percent Discount',
                      code: 'PERCENT30',
                      amountType: DiscountAmountType.Percent,
                      amount: 30.7, // user entered percent with decimal; should round to 31
                      duration: DiscountDuration.Once,
                      active: true,
                      numberOfPayments: null,
                    },
                    id: defaultValues?.id ?? 'discount_123',
                  }
                : {
                    discount: {
                      name: 'Updated Discount',
                      code: 'UPDATED10',
                      amountType: DiscountAmountType.Fixed,
                      amount: undefined,
                      duration: DiscountDuration.Once,
                      active: true,
                      numberOfPayments: null,
                    },
                    __rawAmountString: '15.75',
                    id: defaultValues?.id ?? 'discount_123',
                  }
              const maybePromise = onSubmit(mockInput)
              if (
                maybePromise &&
                typeof maybePromise.then === 'function'
              ) {
                maybePromise
                  .then(() => setIsOpen?.(false))
                  .catch(() => {
                    // Swallow rejection to avoid unhandled errors during tests,
                    // and do not auto-close on failure to mirror real behavior
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

// Mock the discount form fields
vi.mock('./DiscountFormFields', () => ({
  default: ({ edit }: { edit?: boolean }) => (
    <div data-testid="discount-form-fields" data-edit={edit}>
      Form Fields {edit ? '(Edit Mode)' : ''}
    </div>
  ),
}))

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

  const mockMutateAsync = vi.fn()
  const mockEditDiscount = {
    mutateAsync: mockMutateAsync,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuthenticatedContext).mockReturnValue({
      organization: mockOrganization as any,
      user: undefined as any,
      apiKey: undefined as any,
    } as any)
    vi.mocked(trpc.discounts.update.useMutation).mockReturnValue(
      mockEditDiscount as any
    )
  })

  describe('Modal Rendering', () => {
    it('should render the modal with correct props', () => {
      render(
        <EditDiscountModal
          isOpen={true}
          setIsOpen={vi.fn()}
          discount={mockDiscount}
        />
      )

      expect(screen.getByTestId('form-modal')).toBeInTheDocument()
      expect(
        screen.getByTestId('discount-form-fields')
      ).toBeInTheDocument()
      expect(
        screen.getByTestId('discount-form-fields')
      ).toHaveAttribute('data-edit', 'true')
    })

    it('should render with correct default values', () => {
      render(
        <EditDiscountModal
          isOpen={true}
          setIsOpen={vi.fn()}
          discount={mockDiscount}
        />
      )

      const defaultValues = JSON.parse(
        screen.getByTestId('default-values').textContent!
      )
      expect(defaultValues.discount.id).toBe('discount_123')
      expect(defaultValues.__rawAmountString).toBe('10.00')
    })
  })

  describe('Form Submission - Fixed Amount', () => {
    it('should calculate amount correctly for fixed discount type', async () => {
      const { rawStringAmountToCountableCurrencyAmount } =
        await import('@/utils/stripe')

      render(
        <EditDiscountModal
          isOpen={true}
          setIsOpen={vi.fn()}
          discount={mockDiscount}
        />
      )

      const submitButton = screen.getByTestId('submit-button')
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(
          rawStringAmountToCountableCurrencyAmount
        ).toHaveBeenCalledWith('USD', '15.75')
        expect(mockMutateAsync).toHaveBeenCalledWith({
          discount: {
            name: 'Updated Discount',
            code: 'UPDATED10',
            amountType: DiscountAmountType.Fixed,
            amount: 1575, // 15.75 * 100
            duration: DiscountDuration.Once,
            active: true,
            numberOfPayments: null,
            id: 'discount_123',
          },
          id: 'discount_123',
        })
      })
    })
  })

  describe('Form Submission - Percent Amount', () => {
    it('should calculate amount correctly for percent discount type', async () => {
      const percentDiscount = {
        ...mockDiscount,
        amountType: DiscountAmountType.Percent,
        amount: 25,
      }

      const mutateSpy = vi.fn().mockResolvedValue({ success: true })
      vi.mocked(trpc.discounts.update.useMutation).mockReturnValue({
        mutateAsync: mutateSpy,
      } as any)

      render(
        <EditDiscountModal
          isOpen={true}
          setIsOpen={vi.fn()}
          discount={percentDiscount}
        />
      )

      // Click submit which our mock FormModal wires to percent submission
      const submitButton = screen.getByTestId('submit-button')
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mutateSpy).toHaveBeenCalled()
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
    it('should convert countable amount to raw string for display', async () => {
      const { countableCurrencyAmountToRawStringAmount } =
        await import('@/utils/stripe')

      render(
        <EditDiscountModal
          isOpen={true}
          setIsOpen={vi.fn()}
          discount={mockDiscount}
        />
      )

      expect(
        countableCurrencyAmountToRawStringAmount
      ).toHaveBeenCalledWith('USD', 1000)
    })

    it('should handle different currency amounts correctly', () => {
      const discountWithDifferentAmount = {
        ...mockDiscount,
        amount: 2500, // $25.00
      }

      render(
        <EditDiscountModal
          isOpen={true}
          setIsOpen={vi.fn()}
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
    it('should handle mutation errors gracefully', async () => {
      const mockError = new Error('Failed to update discount')
      mockMutateAsync.mockRejectedValue(mockError)

      render(
        <EditDiscountModal
          isOpen={true}
          setIsOpen={vi.fn()}
          discount={mockDiscount}
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
      const mockSetIsOpen = vi.fn()
      render(
        <EditDiscountModal
          isOpen={true}
          setIsOpen={mockSetIsOpen}
          discount={mockDiscount}
        />
      )

      expect(screen.getByTestId('form-modal')).toBeInTheDocument()
      fireEvent.click(screen.getByTestId('submit-button'))
      await waitFor(() => {
        expect(mockSetIsOpen).toHaveBeenCalledWith(false)
      })
    })
  })

  describe('Discount Props', () => {
    it('should handle different discount types correctly', () => {
      const percentDiscount = {
        ...mockDiscount,
        amountType: DiscountAmountType.Percent,
        amount: 15,
      }

      render(
        <EditDiscountModal
          isOpen={true}
          setIsOpen={vi.fn()}
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

    it('should handle recurring discounts correctly', () => {
      const recurringDiscount = {
        ...mockDiscount,
        duration: DiscountDuration.NumberOfPayments,
        numberOfPayments: 3,
      }

      render(
        <EditDiscountModal
          isOpen={true}
          setIsOpen={vi.fn()}
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
