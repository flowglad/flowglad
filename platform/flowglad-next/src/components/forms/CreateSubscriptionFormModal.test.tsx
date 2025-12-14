import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import React from 'react'
import type { DefaultValues, FieldValues } from 'react-hook-form'
import { FormProvider, useForm } from 'react-hook-form'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { trpc } from '@/app/_trpc/client'
import type { ModalInterfaceProps } from '@/components/forms/FormModal'
import { PriceType } from '@/types'
import { CreateSubscriptionFormModal } from './CreateSubscriptionFormModal'

// Mock tRPC
vi.mock('@/app/_trpc/client', () => ({
  trpc: {
    customers: {
      internal__getById: {
        useQuery: vi.fn(),
      },
      getPricingModelForCustomer: {
        useQuery: vi.fn(),
      },
    },
    paymentMethods: {
      list: {
        useQuery: vi.fn(),
      },
    },
    subscriptions: {
      create: {
        useMutation: vi.fn(),
      },
      getTableRows: {
        invalidate: vi.fn(),
      },
    },
    useUtils: vi.fn(),
  },
}))

// Mock FormModal to provide FormProvider context
vi.mock('@/components/forms/FormModal', () => {
  function FormModalMock<T extends FieldValues>({
    children,
    onSubmit,
    defaultValues,
    setIsOpen,
  }: ModalInterfaceProps & {
    children: React.ReactNode
    onSubmit: (data: T) => void | Promise<void>
    defaultValues?: DefaultValues<T>
  }) {
    const form = useForm({ defaultValues })
    return (
      <FormProvider {...form}>
        <div data-testid="form-modal">
          <button
            data-testid="submit-button"
            onClick={async () => {
              // Use actual form values instead of hardcoded mock
              const formValues = form.getValues()
              try {
                await onSubmit(formValues as T)
              } catch {}
            }}
          >
            Create
          </button>
          {children}
        </div>
      </FormProvider>
    )
  }
  return { default: FormModalMock }
})

describe('CreateSubscriptionFormModal', () => {
  const mockCustomer = {
    id: 'customer_123',
    name: 'Test Customer',
  }

  const mockProduct = {
    id: 'product_123',
    name: 'Test Product',
    default: false,
    prices: [
      {
        id: 'price_123',
        active: true,
        type: PriceType.Subscription,
      },
    ],
    defaultPrice: {
      id: 'price_123',
      active: true,
      type: PriceType.Subscription,
      currency: 'USD',
      unitPrice: 10000,
      intervalUnit: 'month',
      intervalCount: 1,
      trialPeriodDays: null,
    },
  }

  const mockPaymentMethod = {
    id: 'pm_123',
    type: 'card',
    default: true,
    paymentMethodData: {
      brand: 'visa',
      last4: '4242',
    },
  }

  const mockMutateAsync = vi.fn().mockResolvedValue({})
  const mockCreateSubscription = {
    mutateAsync: mockMutateAsync,
    isPending: false,
  }

  const mockUtils = {
    subscriptions: {
      getTableRows: {
        invalidate: vi.fn(),
      },
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Cast through unknown to avoid complex tRPC type requirements
    vi.mocked(trpc.useUtils).mockReturnValue(
      mockUtils as unknown as ReturnType<typeof trpc.useUtils>
    )
    vi.mocked(
      trpc.customers.internal__getById.useQuery
    ).mockReturnValue({
      data: { customer: mockCustomer },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<
      typeof trpc.customers.internal__getById.useQuery
    >)
    vi.mocked(
      trpc.customers.getPricingModelForCustomer.useQuery
    ).mockReturnValue({
      data: {
        pricingModel: {
          products: [mockProduct],
        },
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<
      typeof trpc.customers.getPricingModelForCustomer.useQuery
    >)
    vi.mocked(trpc.paymentMethods.list.useQuery).mockReturnValue({
      data: { data: [mockPaymentMethod] },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<
      typeof trpc.paymentMethods.list.useQuery
    >)
    vi.mocked(trpc.subscriptions.create.useMutation).mockReturnValue(
      mockCreateSubscription as unknown as ReturnType<
        typeof trpc.subscriptions.create.useMutation
      >
    )
  })

  // Helper function to render the modal with default props
  const renderModal = () => {
    return render(
      <CreateSubscriptionFormModal
        isOpen={true}
        setIsOpen={vi.fn()}
        customerId="customer_123"
      />
    )
  }

  // Helper function to select a product
  const selectProduct = async () => {
    await waitFor(() => {
      expect(screen.getByText('Product')).toBeInTheDocument()
    })

    const productCombobox = screen.getAllByRole('combobox')[0]
    fireEvent.click(productCombobox)

    const productOption = screen.getByText('Test Product')
    fireEvent.click(productOption)

    await waitFor(() => {
      expect(
        screen.getByText('Subscription Details')
      ).toBeInTheDocument()
    })
  }

  describe('Basic Rendering', () => {
    it('should render all basic elements when modal is open', () => {
      renderModal()

      // Modal container
      expect(screen.getByTestId('form-modal')).toBeInTheDocument()

      // Customer name (split across elements with quotes, so use regex)
      expect(screen.getByText(/For customer/)).toBeInTheDocument()
      expect(screen.getByText(/Test Customer/)).toBeInTheDocument()

      // Product selector
      expect(screen.getByText('Product')).toBeInTheDocument()
      // Radix Select doesn't expose accessible names, so get by index
      // Toggle is ON by default, so we should have 2 comboboxes: Product and Payment Method
      const comboboxes = screen.getAllByRole('combobox')
      expect(comboboxes.length).toBe(2)

      // Charge toggle
      expect(
        screen.getByText('Charge for this subscription')
      ).toBeInTheDocument()
      expect(screen.getByRole('switch')).toBeInTheDocument()
    })
  })

  describe('Toggle Functionality', () => {
    it('should show payment method selector when toggle is ON (charging)', () => {
      renderModal()

      // Toggle is ON by default (doNotCharge = false), so payment method should show
      expect(screen.getByText('Payment Method')).toBeInTheDocument()
      // Should have 2 comboboxes: Product and Payment Method
      const comboboxes = screen.getAllByRole('combobox')
      expect(comboboxes.length).toBe(2)
    })

    it('should hide payment method selector and show message when toggle is OFF (no charge)', async () => {
      renderModal()

      // Initially should have 2 comboboxes (Product + Payment Method)
      expect(screen.getAllByRole('combobox').length).toBe(2)

      // Wait for product selector to be available
      await waitFor(() => {
        expect(screen.getByText('Product')).toBeInTheDocument()
      })

      // Find and click the toggle to turn it OFF
      const switchElement = screen.getByRole('switch')
      fireEvent.click(switchElement)

      await waitFor(() => {
        // After toggle OFF, should only have 1 combobox (Product only)
        expect(screen.getAllByRole('combobox').length).toBe(1)
        // Should show "no charge" message
        expect(
          screen.getByText(/The customer will not be charged/)
        ).toBeInTheDocument()
      })
    })
  })

  describe('Info Card Content', () => {
    it('should show info card with rate information when product is selected and toggle is ON', async () => {
      renderModal()

      // Verify payment method selector is visible (toggle is ON by default)
      expect(screen.getByText('Payment Method')).toBeInTheDocument()
      // Should have 2 comboboxes: Product and Payment Method
      expect(screen.getAllByRole('combobox').length).toBe(2)

      await selectProduct()

      // Verify info card content is displayed with rate information
      expect(
        screen.getByText('Subscription Details')
      ).toBeInTheDocument()
      expect(
        screen.getByText(/will be subscribed to/i)
      ).toBeInTheDocument()
      expect(screen.getByText(/\$100/)).toBeInTheDocument()
      expect(screen.getByText(/per month/i)).toBeInTheDocument()
      expect(screen.getByText(/at a rate of/i)).toBeInTheDocument()
      expect(
        screen.getByText(/The subscription will begin immediately/i)
      ).toBeInTheDocument()
    })

    it('should show "no charge" text when toggle is OFF and product is selected', async () => {
      renderModal()

      // Wait for product selector
      await waitFor(() => {
        expect(screen.getByText('Product')).toBeInTheDocument()
      })

      // Turn toggle OFF
      const switchElement = screen.getByRole('switch')
      fireEvent.click(switchElement)

      // Verify toggle works and shows "no charge" message
      await waitFor(() => {
        expect(
          screen.getByText(/The customer will not be charged/)
        ).toBeInTheDocument()
      })

      await selectProduct()

      // Wait for info card to appear and verify "no charge" text
      expect(
        screen.getByText('Subscription Details')
      ).toBeInTheDocument()
      // "no charge" is in a <strong> tag, so search for it directly
      expect(screen.getByText(/no charge/i)).toBeInTheDocument()
    })
  })

  describe('Loading States', () => {
    it('should show loading skeletons when data is loading', () => {
      vi.mocked(
        trpc.customers.getPricingModelForCustomer.useQuery
      ).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as unknown as ReturnType<
        typeof trpc.customers.getPricingModelForCustomer.useQuery
      >)

      renderModal()

      // Should show skeleton loaders (they're divs with animate-pulse class)
      // Loading state shows: 2 (Product) + 2 (Payment Method) + 5 (Info Card) = 9 skeletons
      const skeletons = document.querySelectorAll('.animate-pulse')
      expect(skeletons.length).toBe(9)
    })
  })

  describe('Error States', () => {
    it('should show error message when pricing model fails to load', () => {
      vi.mocked(
        trpc.customers.getPricingModelForCustomer.useQuery
      ).mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Failed to load'),
      } as unknown as ReturnType<
        typeof trpc.customers.getPricingModelForCustomer.useQuery
      >)

      renderModal()

      expect(
        screen.getByText(/Failed to load pricing model/)
      ).toBeInTheDocument()
    })

    it('should show message when no products are available', () => {
      vi.mocked(
        trpc.customers.getPricingModelForCustomer.useQuery
      ).mockReturnValue({
        data: {
          pricingModel: {
            products: [],
          },
        },
        isLoading: false,
        error: null,
      } as unknown as ReturnType<
        typeof trpc.customers.getPricingModelForCustomer.useQuery
      >)

      renderModal()

      expect(
        screen.getByText(/No products available/)
      ).toBeInTheDocument()
    })
  })

  describe('Form Submission', () => {
    it('should call create subscription mutation on submit', async () => {
      renderModal()
      await selectProduct()

      // Submit the form
      const submitButton = screen.getByTestId('submit-button')
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledTimes(1)
      })
    })

    it('should send payment method ID when doNotCharge is false', async () => {
      renderModal()
      await selectProduct()

      // Ensure toggle is ON (doNotCharge = false) - it's ON by default
      // Verify payment method selector is visible
      expect(screen.getByText('Payment Method')).toBeInTheDocument()

      // Submit the form
      const submitButton = screen.getByTestId('submit-button')
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledTimes(1)
        const callArgs = mockMutateAsync.mock.calls[0][0]
        expect(callArgs.doNotCharge).toBe(false)
        // Payment method should be set (defaults to first available payment method)
        expect(callArgs.defaultPaymentMethodId).toBe('pm_123')
      })
    })

    it('should send undefined payment method when doNotCharge is true, regardless of form state', async () => {
      renderModal()
      await selectProduct()

      // Ensure payment method is selected (toggle is ON by default)
      expect(screen.getByText('Payment Method')).toBeInTheDocument()

      // Now turn toggle OFF (doNotCharge = true)
      const switchElement = screen.getByRole('switch')
      fireEvent.click(switchElement)

      // Wait for toggle to update
      await waitFor(() => {
        expect(
          screen.getByText(/The customer will not be charged/)
        ).toBeInTheDocument()
      })

      // Submit the form
      const submitButton = screen.getByTestId('submit-button')
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledTimes(1)
        const callArgs = mockMutateAsync.mock.calls[0][0]
        expect(callArgs.doNotCharge).toBe(true)
        // Even though payment method was selected before, it should be undefined
        expect(callArgs.defaultPaymentMethodId).toBeUndefined()
      })
    })
  })
})
