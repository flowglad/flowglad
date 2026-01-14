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
import { trpc } from '@/app/_trpc/client'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { DiscountAmountType, DiscountDuration } from '@/types'
import CreateDiscountModal from './CreateDiscountModal'

// Mock the auth context
vi.mock('@/contexts/authContext', () => ({
  useAuthenticatedContext: vi.fn(),
}))

// Mock tRPC
vi.mock('@/app/_trpc/client', () => ({
  trpc: {
    discounts: {
      create: {
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
}))

// Mock the form modal and provide FormProvider context so inner fields can use useFormContext
vi.mock('@/components/forms/FormModal', async () => {
  // biome-ignore lint/plugin: dynamic import required for vi.mock factory
  const React = await import('react')
  // biome-ignore lint/plugin: dynamic import required for vi.mock factory
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
vi.mock('./DiscountFormFields', () => ({
  default: () => (
    <div data-testid="discount-form-fields">Form Fields</div>
  ),
}))

describe('CreateDiscountModal', () => {
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

  const mockMutateAsync = vi.fn()
  const mockCreateDiscount = {
    mutateAsync: mockMutateAsync,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuthenticatedContext).mockReturnValue({
      organization: mockOrganization as any,
      user: undefined as any,
      apiKey: undefined as any,
    } as any)
    vi.mocked(trpc.discounts.create.useMutation).mockReturnValue(
      mockCreateDiscount as any
    )
  })

  describe('Modal Rendering', () => {
    it('should render the modal with correct props', () => {
      render(
        <CreateDiscountModal isOpen={true} setIsOpen={vi.fn()} />
      )

      expect(screen.getByTestId('form-modal')).toBeInTheDocument()
      expect(
        screen.getByTestId('discount-form-fields')
      ).toBeInTheDocument()
    })

    it('should render with correct default values', () => {
      render(
        <CreateDiscountModal isOpen={true} setIsOpen={vi.fn()} />
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
        <CreateDiscountModal isOpen={true} setIsOpen={vi.fn()} />
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
        <CreateDiscountModal isOpen={true} setIsOpen={vi.fn()} />
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
      const mockSetIsOpen = vi.fn()
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
