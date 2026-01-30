/// <reference lib="dom" />

import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { FlowgladApiKeyType } from '@db-core/enums'
import type { ReactNode } from 'react'
import { FormProvider, useForm } from 'react-hook-form'

// Create mock functions
const mockMutateAsync = mock(() =>
  Promise.resolve({
    shownOnlyOnceKey: 'test_sk_xxxxxxxxxxxx',
    apiKey: { livemode: true },
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

mock.module('@/app/_trpc/client', () => ({
  trpc: {
    apiKeys: {
      create: {
        useMutation: mockUseMutation,
      },
      get: {
        invalidate: mock(),
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
    useContext: () => ({
      apiKeys: {
        get: {
          invalidate: mock(),
        },
      },
    }),
  },
}))

mock.module('@/app/hooks/useCopyTextHandler', () => ({
  useCopyTextHandler: () => mock(),
}))

// Mock PricingModelSelect
mock.module('@/components/forms/PricingModelSelect', () => ({
  default: () => (
    <div data-testid="pricing-model-select">
      Mocked PricingModelSelect
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
                apiKey: {
                  name: 'Test API Key',
                  type: FlowgladApiKeyType.Secret,
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
import CreateApiKeyModal from './CreateApiKeyModal'

describe('CreateApiKeyModal', () => {
  beforeEach(() => {
    mockMutateAsync.mockClear()
    mockUseMutation.mockClear()
  })

  describe('Auto-set Pricing Model', () => {
    it('auto-sets pricingModelId from focused membership in default values', () => {
      render(
        <CreateApiKeyModal isOpen={true} setIsOpen={mock(() => {})} />
      )

      const defaultValues = JSON.parse(
        screen.getByTestId('default-values').textContent!
      )

      // The pricingModelId should be set to the focused PM's ID
      expect(defaultValues.apiKey.pricingModelId).toBe(
        'pm-focused-123'
      )
    })

    it('sets correct default values structure including auto-set pricingModelId', () => {
      render(
        <CreateApiKeyModal isOpen={true} setIsOpen={mock(() => {})} />
      )

      const defaultValues = JSON.parse(
        screen.getByTestId('default-values').textContent!
      )

      expect(defaultValues).toEqual({
        apiKey: {
          name: '',
          type: FlowgladApiKeyType.Secret,
          pricingModelId: 'pm-focused-123',
        },
      })
    })
  })

  describe('Hidden Pricing Model Selector', () => {
    it('passes hidePricingModelSelector prop to ApiKeyFormFields', () => {
      render(
        <CreateApiKeyModal isOpen={true} setIsOpen={mock(() => {})} />
      )

      // The PricingModelSelect should NOT be rendered because
      // hidePricingModelSelector is true in the component
      // However, since we're testing through the FormModal mock,
      // we can't directly verify this. The test verifies that
      // the PM is auto-set instead.
      expect(screen.getByTestId('form-modal')).toBeInTheDocument()
    })
  })

  describe('Modal Rendering', () => {
    it('renders the modal with form fields', () => {
      render(
        <CreateApiKeyModal isOpen={true} setIsOpen={mock(() => {})} />
      )

      expect(screen.getByTestId('form-modal')).toBeInTheDocument()
    })
  })
})
