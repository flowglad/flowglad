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

import {
  useAuthContext,
  useAuthenticatedContext,
} from '@/contexts/authContext'
import type { CreateDiscountFormSchema } from '@/db/schema/discounts'
import { DiscountAmountType, DiscountDuration } from '@/types'
import DiscountFormFields from './DiscountFormFields'

// Mock the auth context
mock.module('@/contexts/authContext', () => ({
  useAuthenticatedContext: mock(() => {}),
  useAuthContext: mock(() => {}),
}))

// Mock the PricingModelSelect component to avoid trpc calls
mock.module('@/components/forms/PricingModelSelect', () => ({
  default: () => (
    <div data-testid="pricing-model-select">
      Mocked PricingModelSelect
    </div>
  ),
}))

// Mock the currency character function
mock.module('@/registry/lib/currency', () => ({
  currencyCharacter: mock(() => '$'),
}))

// Mock the currency input component
mock.module('@/components/ui/currency-input', () => ({
  CurrencyInput: ({ value, onValueChange, allowDecimals }: any) => (
    <input
      data-testid="currency-input"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      data-allow-decimals={allowDecimals}
    />
  ),
}))

// Mock the stripe utils
mock.module('@/utils/stripe', () => ({
  isCurrencyZeroDecimal: mock(() => false),
}))

const TestWrapper: React.FC<{
  defaultValues?: Partial<CreateDiscountFormSchema>
  children: React.ReactNode
}> = ({ defaultValues, children }) => {
  const form = useForm<CreateDiscountFormSchema>({
    defaultValues: {
      discount: {
        name: '',
        code: '',
        amountType: DiscountAmountType.Fixed,
        amount: 0,
        duration: DiscountDuration.Once,
        active: true,
        numberOfPayments: null,
      },
      __rawAmountString: '0',
      ...defaultValues,
    },
  })

  return <FormProvider {...form}>{children}</FormProvider>
}

describe('DiscountFormFields', () => {
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

  beforeEach(() => {
    ;(useAuthenticatedContext as Mock).mockReturnValue({
      organization: mockOrganization as any,
      user: undefined as any,
      apiKey: undefined as any,
    })
    ;(useAuthContext as Mock).mockReturnValue({
      organization: mockOrganization as any,
      user: undefined as any,
      apiKey: undefined as any,
    })
  })

  describe('Amount Type Switching', () => {
    it('should switch to Percent type and set amount to 1', async () => {
      render(
        <TestWrapper>
          <DiscountFormFields />
        </TestWrapper>
      )

      const typeSelect = screen.getAllByRole('combobox')[0]
      fireEvent.click(typeSelect)

      const percentOption = screen.getByText('Percentage')
      fireEvent.click(percentOption)

      await waitFor(() => {
        const amountInput = screen.getByDisplayValue('1')
        expect(amountInput).toBeInTheDocument()
      })
    })

    it('should switch to Fixed type and reset amount fields', async () => {
      render(
        <TestWrapper
          defaultValues={{
            discount: {
              name: '',
              code: '',
              amountType: DiscountAmountType.Percent,
              amount: 50,
              duration: DiscountDuration.Once,
              active: true,
              numberOfPayments: null,
            },
            __rawAmountString: '50',
          }}
        >
          <DiscountFormFields />
        </TestWrapper>
      )

      const typeSelect = screen.getAllByRole('combobox')[0]
      fireEvent.click(typeSelect)

      const fixedOption = screen.getByText('Fixed')
      fireEvent.click(fixedOption)

      await waitFor(() => {
        const currencyInput = screen.getByTestId('currency-input')
        expect(currencyInput).toHaveValue('0')
      })
    })
  })

  describe('Percentage Amount Input', () => {
    it('should parse percentage input as integer', async () => {
      render(
        <TestWrapper
          defaultValues={{
            discount: {
              name: '',
              code: '',
              amountType: DiscountAmountType.Percent,
              amount: 1,
              duration: DiscountDuration.Once,
              active: true,
              numberOfPayments: null,
            },
            __rawAmountString: '1',
          }}
        >
          <DiscountFormFields />
        </TestWrapper>
      )

      const amountInput = screen.getByDisplayValue('1')
      fireEvent.change(amountInput, { target: { value: '25.5' } })

      await waitFor(() => {
        expect(amountInput).toHaveValue(25)
      })
    })

    it('should handle invalid percentage input', async () => {
      render(
        <TestWrapper
          defaultValues={{
            discount: {
              name: '',
              code: '',
              amountType: DiscountAmountType.Percent,
              amount: 1,
              duration: DiscountDuration.Once,
              active: true,
              numberOfPayments: null,
            },
            __rawAmountString: '1',
          }}
        >
          <DiscountFormFields />
        </TestWrapper>
      )

      const amountInput = screen.getByDisplayValue('1')
      fireEvent.change(amountInput, { target: { value: 'invalid' } })

      await waitFor(() => {
        const input = screen.getByPlaceholderText(
          '1'
        ) as HTMLInputElement
        expect(input.value).toBe('')
      })
    })
  })

  describe('Fixed Amount Input', () => {
    it('should render currency input for fixed amounts', () => {
      render(
        <TestWrapper
          defaultValues={{
            discount: {
              name: '',
              code: '',
              amountType: DiscountAmountType.Fixed,
              amount: 0,
              duration: DiscountDuration.Once,
              active: true,
              numberOfPayments: null,
            },
            __rawAmountString: '0',
          }}
        >
          <DiscountFormFields />
        </TestWrapper>
      )

      const currencyInput = screen.getByTestId('currency-input')
      expect(currencyInput).toBeInTheDocument()
      expect(currencyInput).toHaveValue('0')
    })

    it('should handle currency input changes', async () => {
      render(
        <TestWrapper
          defaultValues={{
            discount: {
              name: '',
              code: '',
              amountType: DiscountAmountType.Fixed,
              amount: 0,
              duration: DiscountDuration.Once,
              active: true,
              numberOfPayments: null,
            },
            __rawAmountString: '0',
          }}
        >
          <DiscountFormFields />
        </TestWrapper>
      )

      const currencyInput = screen.getByTestId('currency-input')
      fireEvent.change(currencyInput, { target: { value: '10.50' } })

      await waitFor(() => {
        expect(currencyInput).toHaveValue('10.50')
      })
    })

    it('should handle empty currency input', async () => {
      render(
        <TestWrapper
          defaultValues={{
            discount: {
              name: '',
              code: '',
              amountType: DiscountAmountType.Fixed,
              amount: 0,
              duration: DiscountDuration.Once,
              active: true,
              numberOfPayments: null,
            },
            __rawAmountString: '10',
          }}
        >
          <DiscountFormFields />
        </TestWrapper>
      )

      const currencyInput = screen.getByTestId('currency-input')
      fireEvent.change(currencyInput, { target: { value: '' } })

      await waitFor(() => {
        expect(currencyInput).toHaveValue('0')
      })
    })
  })

  describe('Form Validation', () => {
    it('should show validation error for percentage over 100', async () => {
      render(
        <TestWrapper
          defaultValues={{
            discount: {
              name: '',
              code: '',
              amountType: DiscountAmountType.Percent,
              amount: 150,
              duration: DiscountDuration.Once,
              active: true,
              numberOfPayments: null,
            },
            __rawAmountString: '150',
          }}
        >
          <DiscountFormFields />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(
          screen.getByText('Amount must be less than 100')
        ).toBeInTheDocument()
      })
    })

    it('should show validation error for percentage less than 0', async () => {
      render(
        <TestWrapper
          defaultValues={{
            discount: {
              name: '',
              code: '',
              amountType: DiscountAmountType.Percent,
              amount: -1,
              duration: DiscountDuration.Once,
              active: true,
              numberOfPayments: null,
            },
            __rawAmountString: '0',
          }}
        >
          <DiscountFormFields />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(
          screen.getByText('Amount must be greater than 0')
        ).toBeInTheDocument()
      })
    })
  })

  describe('Code Field', () => {
    it('should convert code to uppercase on blur', async () => {
      render(
        <TestWrapper>
          <DiscountFormFields />
        </TestWrapper>
      )

      const codeInput = screen.getByPlaceholderText(
        "Your Discount's Code"
      )
      fireEvent.change(codeInput, { target: { value: 'test123' } })
      fireEvent.blur(codeInput)

      await waitFor(() => {
        expect(codeInput).toHaveValue('TEST123')
      })
    })
  })

  describe('Duration Field', () => {
    it('should clear numberOfPayments when switching away from NumberOfPayments', async () => {
      render(
        <TestWrapper
          defaultValues={{
            discount: {
              name: '',
              code: '',
              amountType: DiscountAmountType.Fixed,
              amount: 0,
              duration: DiscountDuration.NumberOfPayments,
              active: true,
              numberOfPayments: 5,
            },
            __rawAmountString: '0',
          }}
        >
          <DiscountFormFields />
        </TestWrapper>
      )

      const durationSelect = screen.getAllByRole('combobox')[1]
      fireEvent.click(durationSelect)

      const onceOption = screen.getByText('Once')
      fireEvent.click(onceOption)

      // The numberOfPayments field should be hidden when duration is not NumberOfPayments
      await waitFor(() => {
        expect(
          screen.queryByLabelText('Number of Payments')
        ).not.toBeInTheDocument()
      })
    })

    it('should show numberOfPayments field when duration is NumberOfPayments', () => {
      render(
        <TestWrapper
          defaultValues={{
            discount: {
              name: '',
              code: '',
              amountType: DiscountAmountType.Fixed,
              amount: 0,
              duration: DiscountDuration.NumberOfPayments,
              active: true,
              numberOfPayments: 3,
            },
            __rawAmountString: '0',
          }}
        >
          <DiscountFormFields />
        </TestWrapper>
      )

      expect(
        screen.getByLabelText('Number of Payments')
      ).toBeInTheDocument()
    })
  })

  describe('Edit Mode', () => {
    it('should show status switch when in edit mode', () => {
      render(
        <TestWrapper>
          <DiscountFormFields edit />
        </TestWrapper>
      )

      expect(screen.getByRole('switch')).toBeInTheDocument()
    })

    it('should not show status switch when not in edit mode', () => {
      render(
        <TestWrapper>
          <DiscountFormFields />
        </TestWrapper>
      )

      expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    })
  })
})
