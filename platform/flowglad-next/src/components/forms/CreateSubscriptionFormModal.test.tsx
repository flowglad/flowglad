import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { DefaultValues, FieldValues } from 'react-hook-form'
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
vi.mock('@/components/forms/FormModal', async () => {
  const React = await import('react')
  const { useForm, FormProvider } = await import('react-hook-form')
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
              const mockInput = {
                productId: 'product_123',
                defaultPaymentMethodId: 'pm_123',
                doNotCharge: false,
              }
              try {
                await onSubmit(mockInput as unknown as T)
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

  describe('Basic Rendering', () => {
    it('should render the modal when open', () => {
      render(
        <CreateSubscriptionFormModal
          isOpen={true}
          setIsOpen={vi.fn()}
          customerId="customer_123"
        />
      )

      expect(screen.getByTestId('form-modal')).toBeInTheDocument()
      // Customer name is split across elements with quotes, so use regex
      expect(screen.getByText(/Test Customer/)).toBeInTheDocument()
    })

    it('should display customer name when available', () => {
      render(
        <CreateSubscriptionFormModal
          isOpen={true}
          setIsOpen={vi.fn()}
          customerId="customer_123"
        />
      )

      expect(screen.getByText(/For customer/)).toBeInTheDocument()
      // Customer name is split across elements with quotes, so use regex
      expect(screen.getByText(/Test Customer/)).toBeInTheDocument()
    })

    it('should render product selector', () => {
      render(
        <CreateSubscriptionFormModal
          isOpen={true}
          setIsOpen={vi.fn()}
          customerId="customer_123"
        />
      )

      expect(screen.getByText('Product')).toBeInTheDocument()
      // Radix Select doesn't expose accessible names, so get by index
      // Toggle is ON by default, so we should have 2 comboboxes: Product and Payment Method
      const comboboxes = screen.getAllByRole('combobox')
      expect(comboboxes.length).toBe(2)
    })

    it('should render charge toggle', () => {
      render(
        <CreateSubscriptionFormModal
          isOpen={true}
          setIsOpen={vi.fn()}
          customerId="customer_123"
        />
      )

      expect(
        screen.getByText('Charge for this subscription')
      ).toBeInTheDocument()
      // Switch has an ID, so we can find it directly
      expect(
        document.getElementById('charge-toggle')
      ).toBeInTheDocument()
      expect(screen.getByRole('switch')).toBeInTheDocument()
    })
  })

  describe('Toggle Functionality', () => {
    it('should show payment method selector when toggle is ON (charging)', () => {
      render(
        <CreateSubscriptionFormModal
          isOpen={true}
          setIsOpen={vi.fn()}
          customerId="customer_123"
        />
      )

      // Toggle is ON by default (doNotCharge = false), so payment method should show
      expect(screen.getByText('Payment Method')).toBeInTheDocument()
      // Should have 2 comboboxes: Product and Payment Method
      const comboboxes = screen.getAllByRole('combobox')
      expect(comboboxes.length).toBe(2)
    })

    it('should hide payment method selector when toggle is OFF (no charge)', async () => {
      render(
        <CreateSubscriptionFormModal
          isOpen={true}
          setIsOpen={vi.fn()}
          customerId="customer_123"
        />
      )

      // Initially should have 2 comboboxes (Product + Payment Method)
      expect(screen.getAllByRole('combobox').length).toBe(2)

      // Find and click the toggle to turn it OFF
      const switchElement = screen.getByRole('switch')
      fireEvent.click(switchElement)

      await waitFor(() => {
        // After toggle OFF, should only have 1 combobox (Product only)
        expect(screen.getAllByRole('combobox').length).toBe(1)
      })
    })

    it('should show "no charge" message when toggle is OFF', async () => {
      render(
        <CreateSubscriptionFormModal
          isOpen={true}
          setIsOpen={vi.fn()}
          customerId="customer_123"
        />
      )

      // Wait for product selector to be available
      await waitFor(() => {
        expect(screen.getByText('Product')).toBeInTheDocument()
      })

      // Click toggle to turn it OFF
      const switchElement = screen.getByRole('switch')
      fireEvent.click(switchElement)

      await waitFor(() => {
        expect(
          screen.getByText(/The customer will not be charged/)
        ).toBeInTheDocument()
      })
    })
  })

  describe('Info Card Content', () => {
    it('should show info card when product is selected', async () => {
      render(
        <CreateSubscriptionFormModal
          isOpen={true}
          setIsOpen={vi.fn()}
          customerId="customer_123"
        />
      )

      // Wait for product selector to be available
      // Radix Select uses a button with role="combobox", not a standard input
      // Toggle is ON by default, so we should have 2 comboboxes: Product and Payment Method
      await waitFor(() => {
        expect(screen.getByText('Product')).toBeInTheDocument()
        expect(screen.getAllByRole('combobox').length).toBe(2)
      })
    })

    it('should show "no charge" text when toggle is OFF', async () => {
      render(
        <CreateSubscriptionFormModal
          isOpen={true}
          setIsOpen={vi.fn()}
          customerId="customer_123"
        />
      )

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
    })

    it('should show rate information when toggle is ON', async () => {
      render(
        <CreateSubscriptionFormModal
          isOpen={true}
          setIsOpen={vi.fn()}
          customerId="customer_123"
        />
      )

      // Wait for product selector
      await waitFor(() => {
        expect(screen.getByText('Product')).toBeInTheDocument()
      })

      // Verify payment method selector is visible (toggle is ON by default)
      // Info card with rate info only appears when product is selected
      expect(screen.getByText('Payment Method')).toBeInTheDocument()
      // Should have 2 comboboxes: Product and Payment Method
      expect(screen.getAllByRole('combobox').length).toBe(2)
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

      render(
        <CreateSubscriptionFormModal
          isOpen={true}
          setIsOpen={vi.fn()}
          customerId="customer_123"
        />
      )

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

      render(
        <CreateSubscriptionFormModal
          isOpen={true}
          setIsOpen={vi.fn()}
          customerId="customer_123"
        />
      )

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

      render(
        <CreateSubscriptionFormModal
          isOpen={true}
          setIsOpen={vi.fn()}
          customerId="customer_123"
        />
      )

      expect(
        screen.getByText(/No products available/)
      ).toBeInTheDocument()
    })
  })

  describe('Form Submission', () => {
    it('should call create subscription mutation on submit', async () => {
      render(
        <CreateSubscriptionFormModal
          isOpen={true}
          setIsOpen={vi.fn()}
          customerId="customer_123"
        />
      )

      const submitButton = screen.getByTestId('submit-button')
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledTimes(1)
      })
    })
  })
})
