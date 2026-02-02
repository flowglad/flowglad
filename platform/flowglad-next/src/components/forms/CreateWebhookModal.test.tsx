/// <reference lib="dom" />

import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type { ReactNode } from 'react'
import { FormProvider, useForm } from 'react-hook-form'

// Create mock functions
const mockMutateAsync = mock(() =>
  Promise.resolve({
    secret: 'whsec_xxxxxxxxxxxx',
  })
)
const mockUseMutation = mock(() => ({
  mutateAsync: mockMutateAsync,
}))

const mockFocusedMembershipData = {
  pricingModel: {
    id: 'pm-focused-123',
    name: 'Focused PM',
    livemode: true,
  },
  membership: {
    livemode: true,
  },
}

// Mock toast
mock.module('sonner', () => ({
  toast: {
    success: mock(),
    error: mock(),
  },
}))

mock.module('@/app/_trpc/client', () => ({
  trpc: {
    webhooks: {
      create: {
        useMutation: mockUseMutation,
      },
    },
    organizations: {
      getFocusedMembership: {
        useQuery: () => ({
          data: mockFocusedMembershipData,
          isPending: false,
        }),
      },
    },
  },
}))

// Mock PricingModelSelect
mock.module('@/components/forms/PricingModelSelect', () => ({
  default: () => (
    <div data-testid="pricing-model-select">
      Mocked PricingModelSelect
    </div>
  ),
}))

// Mock CopyableTextTableCell
mock.module('@/components/CopyableTextTableCell', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="copyable-text">{children}</div>
  ),
}))

// Mock WebhookFormFields
mock.module('@/components/forms/WebhookFormFields', () => ({
  default: ({
    hidePricingModelSelector,
  }: {
    hidePricingModelSelector?: boolean
  }) => (
    <div
      data-testid="webhook-form-fields"
      data-hide-pm-selector={hidePricingModelSelector}
    >
      Mocked WebhookFormFields
    </div>
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
    defaultValues?:
      | (() => Record<string, unknown>)
      | Record<string, unknown>
  }) {
    // Handle defaultValues being a function (which is what the component uses)
    const resolvedDefaultValues =
      typeof defaultValues === 'function'
        ? defaultValues()
        : defaultValues
    const form = useForm({ defaultValues: resolvedDefaultValues })
    return (
      <FormProvider {...form}>
        <div data-testid="form-modal">
          <div data-testid="default-values">
            {JSON.stringify(resolvedDefaultValues)}
          </div>
          <button
            type="button"
            data-testid="submit-button"
            onClick={async () => {
              const mockInput = {
                webhook: {
                  name: 'Test Webhook',
                  url: 'https://example.com/webhook',
                  filterTypes: [],
                  active: true,
                  pricingModelId: 'pm-focused-123',
                },
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
import { render, screen } from '@testing-library/react'
import CreateWebhookModal from './CreateWebhookModal'

describe('CreateWebhookModal', () => {
  beforeEach(() => {
    mockMutateAsync.mockClear()
    mockUseMutation.mockClear()
  })

  describe('Auto-set Pricing Model', () => {
    it('auto-sets pricingModelId from focused membership in default values', () => {
      render(
        <CreateWebhookModal
          isOpen={true}
          setIsOpen={mock(() => {})}
        />
      )

      const defaultValues = JSON.parse(
        screen.getByTestId('default-values').textContent!
      )

      // The pricingModelId should be set to the focused PM's ID
      expect(defaultValues.webhook.pricingModelId).toBe(
        'pm-focused-123'
      )
    })

    it('sets correct default values structure including auto-set pricingModelId', () => {
      render(
        <CreateWebhookModal
          isOpen={true}
          setIsOpen={mock(() => {})}
        />
      )

      const defaultValues = JSON.parse(
        screen.getByTestId('default-values').textContent!
      )

      expect(defaultValues).toEqual({
        webhook: {
          name: '',
          url: '',
          filterTypes: [],
          active: true,
          pricingModelId: 'pm-focused-123',
        },
      })
    })
  })

  describe('Hidden Pricing Model Selector', () => {
    it('passes hidePricingModelSelector=true prop to WebhookFormFields', () => {
      render(
        <CreateWebhookModal
          isOpen={true}
          setIsOpen={mock(() => {})}
        />
      )

      // WebhookFormFields should receive hidePricingModelSelector=true
      const webhookFormFields = screen.getByTestId(
        'webhook-form-fields'
      )
      expect(webhookFormFields).toHaveAttribute(
        'data-hide-pm-selector',
        'true'
      )
    })
  })

  describe('Modal Rendering', () => {
    it('renders the modal with form fields', () => {
      render(
        <CreateWebhookModal
          isOpen={true}
          setIsOpen={mock(() => {})}
        />
      )

      expect(screen.getByTestId('form-modal')).toBeInTheDocument()
      expect(
        screen.getByTestId('webhook-form-fields')
      ).toBeInTheDocument()
    })
  })
})
